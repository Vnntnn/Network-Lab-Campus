from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from database import DEFAULT_OWNER_ID, get_db
from deps import get_actor_id
from models import CredentialIdentity, LabPod
from schemas import (
    DeviceDiscoveryRequest,
    DeviceDiscoveryResponse,
    LabPodCreate,
    LabPodRead,
    LabPodUpdate,
    PingResponse,
    PodInterfaceSetRequest,
    PodInterfacesResponse,
)
from services.device_executor import run_show_commands
from services.device_discovery import discover_device
from services.identities import resolve_identity_credentials
from services.interface_governance import get_pod_interfaces, set_interface_disabled_state
from services.ownership import get_owned_pod

router = APIRouter(prefix="/pods", tags=["pods"])


def _to_lab_pod_read(pod: LabPod, identity_names: dict[int, str]) -> LabPodRead:
    payload = LabPodRead.model_validate(pod, from_attributes=True).model_dump()
    if pod.identity_id is not None:
        payload["identity_name"] = identity_names.get(pod.identity_id)
    return LabPodRead(**payload)


async def _identity_name_map(db: AsyncSession, actor_id: str) -> dict[int, str]:
    result = await db.execute(
        select(CredentialIdentity.id, CredentialIdentity.name).where(CredentialIdentity.owner_id == actor_id)
    )
    return {identity_id: identity_name for identity_id, identity_name in result.all()}


@router.get("/", response_model=list[LabPodRead])
async def list_pods(
    db: AsyncSession = Depends(get_db),
    actor_id: str = Depends(get_actor_id),
):
    identity_names = await _identity_name_map(db, actor_id)
    result = await db.execute(
        select(LabPod)
        .where(LabPod.owner_id == actor_id)
        .order_by(LabPod.pod_number)
    )
    pods = result.scalars().all()

    if pods or actor_id == DEFAULT_OWNER_ID:
        return [_to_lab_pod_read(pod, identity_names) for pod in pods]

    seed_result = await db.execute(
        select(LabPod)
        .where(LabPod.owner_id == DEFAULT_OWNER_ID)
        .order_by(LabPod.pod_number)
    )
    seed_pods = seed_result.scalars().all()
    if not seed_pods:
        return pods

    for seed_pod in seed_pods:
        db.add(
            LabPod(
                owner_id=actor_id,
                pod_number=seed_pod.pod_number,
                pod_name=seed_pod.pod_name,
                device_ip=seed_pod.device_ip,
                device_type=seed_pod.device_type,
                ssh_username=seed_pod.ssh_username,
                ssh_password=seed_pod.ssh_password,
                connection_protocol=seed_pod.connection_protocol,
                telnet_port=seed_pod.telnet_port,
                identity_id=None,
                display_name=seed_pod.display_name,
                description=seed_pod.description,
            )
        )

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()

    refreshed = await db.execute(
        select(LabPod)
        .where(LabPod.owner_id == actor_id)
        .order_by(LabPod.pod_number)
    )
    refreshed_pods = refreshed.scalars().all()
    identity_names = await _identity_name_map(db, actor_id)
    return [_to_lab_pod_read(pod, identity_names) for pod in refreshed_pods]


@router.get("/{pod_id}", response_model=LabPodRead)
async def get_pod(
    pod_id: int,
    db: AsyncSession = Depends(get_db),
    actor_id: str = Depends(get_actor_id),
):
    pod = await get_owned_pod(db, pod_id, actor_id)
    if not pod:
        raise HTTPException(status_code=404, detail="Pod not found")
    identity_names = await _identity_name_map(db, actor_id)
    return _to_lab_pod_read(pod, identity_names)


@router.post("/", response_model=LabPodRead, status_code=201)
async def create_pod(
    payload: LabPodCreate,
    db: AsyncSession = Depends(get_db),
    actor_id: str = Depends(get_actor_id),
):
    body = payload.model_dump()
    resolved_identity_id, resolved_username, resolved_password, _ = await resolve_identity_credentials(
        db,
        actor_id=actor_id,
        identity_id=body.get("identity_id"),
        username=body.get("ssh_username"),
        password=body.get("ssh_password"),
    )
    body["identity_id"] = resolved_identity_id
    body["ssh_username"] = resolved_username or ""
    body["ssh_password"] = resolved_password or ""

    if body.get("connection_protocol") == "ssh":
        if not body.get("ssh_username") or not body.get("ssh_password"):
            raise HTTPException(status_code=422, detail="SSH pods require credentials or a valid identity")

    pod = LabPod(owner_id=actor_id, **body)
    db.add(pod)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Pod number already exists for this actor")
    await db.refresh(pod)
    identity_names = await _identity_name_map(db, actor_id)
    return _to_lab_pod_read(pod, identity_names)


@router.put("/{pod_id}", response_model=LabPodRead)
async def update_pod(
    pod_id: int,
    payload: LabPodUpdate,
    db: AsyncSession = Depends(get_db),
    actor_id: str = Depends(get_actor_id),
):
    pod = await get_owned_pod(db, pod_id, actor_id)
    if not pod:
        raise HTTPException(status_code=404, detail="Pod not found")

    updates = payload.model_dump(exclude_unset=True)

    if {"identity_id", "ssh_username", "ssh_password", "connection_protocol"} & set(updates.keys()):
        requested_identity_id = updates.get("identity_id", pod.identity_id)
        requested_username = updates.get("ssh_username", pod.ssh_username)
        requested_password = updates.get("ssh_password", pod.ssh_password)
        resolved_identity_id, resolved_username, resolved_password, _ = await resolve_identity_credentials(
            db,
            actor_id=actor_id,
            identity_id=requested_identity_id,
            username=requested_username,
            password=requested_password,
        )
        updates["identity_id"] = resolved_identity_id
        updates["ssh_username"] = resolved_username or ""
        updates["ssh_password"] = resolved_password or ""

    effective_protocol = updates.get("connection_protocol", pod.connection_protocol)
    effective_username = updates.get("ssh_username", pod.ssh_username)
    effective_password = updates.get("ssh_password", pod.ssh_password)
    if effective_protocol == "ssh":
        if not effective_username or not effective_password:
            raise HTTPException(status_code=422, detail="SSH pods require credentials or a valid identity")

    for field, value in updates.items():
        setattr(pod, field, value)

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Pod number already exists for this actor")
    await db.refresh(pod)
    identity_names = await _identity_name_map(db, actor_id)
    return _to_lab_pod_read(pod, identity_names)


@router.delete("/{pod_id}", status_code=204)
async def delete_pod(
    pod_id: int,
    db: AsyncSession = Depends(get_db),
    actor_id: str = Depends(get_actor_id),
):
    pod = await get_owned_pod(db, pod_id, actor_id)
    if not pod:
        raise HTTPException(status_code=404, detail="Pod not found")
    await db.delete(pod)
    await db.commit()


@router.get("/{pod_id}/ping", response_model=PingResponse)
async def ping_pod(
    pod_id: int,
    db: AsyncSession = Depends(get_db),
    actor_id: str = Depends(get_actor_id),
):
    """SSH into the device and run 'show version' to verify reachability."""
    pod = await get_owned_pod(db, pod_id, actor_id)
    if not pod:
        raise HTTPException(status_code=404, detail="Pod not found")
    result = await run_show_commands(pod, ["show version"])
    version_line = ""
    if result.success and result.results:
        version_line = result.results[0]["output"].splitlines()[0] if result.results[0]["output"] else ""
    return PingResponse(
        reachable=result.success,
        version_line=version_line,
        elapsed_ms=result.elapsed_ms,
    )


@router.get("/{pod_id}/interfaces", response_model=PodInterfacesResponse)
async def list_pod_interfaces(
    pod_id: int,
    db: AsyncSession = Depends(get_db),
    actor_id: str = Depends(get_actor_id),
):
    pod = await get_owned_pod(db, pod_id, actor_id)
    if not pod:
        raise HTTPException(status_code=404, detail="Pod not found")

    return await get_pod_interfaces(db, pod=pod, owner_id=actor_id, max_hops=1)


@router.post("/{pod_id}/interfaces", response_model=PodInterfacesResponse)
async def set_pod_interface_state(
    pod_id: int,
    payload: PodInterfaceSetRequest,
    db: AsyncSession = Depends(get_db),
    actor_id: str = Depends(get_actor_id),
):
    pod = await get_owned_pod(db, pod_id, actor_id)
    if not pod:
        raise HTTPException(status_code=404, detail="Pod not found")

    return await set_interface_disabled_state(
        db,
        pod=pod,
        owner_id=actor_id,
        interface_name=payload.interface_name.strip(),
        disabled=payload.disabled,
    )


@router.post("/discover", response_model=DeviceDiscoveryResponse)
async def discover_device_endpoint(
    payload: DeviceDiscoveryRequest,
):
    """Auto-discover Cisco device type, hostname, and other info."""
    result = await discover_device(
        device_ip=payload.device_ip,
        username=payload.ssh_username,
        password=payload.ssh_password,
        protocol=payload.connection_protocol,
        port=payload.port,
    )
    return DeviceDiscoveryResponse(**result)
