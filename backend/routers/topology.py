import asyncio
from datetime import datetime, timezone
import json

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import AsyncSessionLocal, get_db
from deps import get_actor_id
from models import LabPod, TopologyDiscoveryJob
from schemas import (
    RouteAnalyticsResponse,
    TopologyDiscoverAllItem,
    TopologyDiscoverAllJobCreateResponse,
    TopologyDiscoverAllJobRead,
    TopologyDiscoverAllResponse,
    TopologyDiscoveryResponse,
)
from services.ownership import get_owned_pod
from services.route_analytics import build_route_analytics
from services.topology_discovery import discover_topology

router = APIRouter(prefix="/topology", tags=["topology"])
_clients: list[WebSocket] = []


def _serialize_discovery_items(items: list[TopologyDiscoverAllItem]) -> str:
    return json.dumps([item.model_dump(mode="json") for item in items])


def _deserialize_discovery_items(payload: str | None) -> list[TopologyDiscoverAllItem]:
    if not payload:
        return []

    try:
        raw = json.loads(payload)
    except json.JSONDecodeError:
        return []

    if not isinstance(raw, list):
        return []

    items: list[TopologyDiscoverAllItem] = []
    for entry in raw:
        if isinstance(entry, dict):
            try:
                items.append(TopologyDiscoverAllItem(**entry))
            except Exception:
                continue
    return items


def _to_job_read(job: TopologyDiscoveryJob) -> TopologyDiscoverAllJobRead:
    return TopologyDiscoverAllJobRead(
        id=job.id,
        owner_id=job.owner_id,
        status=job.status,  # type: ignore[arg-type]
        max_hops=job.max_hops,
        total=job.total,
        successful=job.successful,
        failed=job.failed,
        items=_deserialize_discovery_items(job.result_json),
        error_message=job.error_message,
        created_at=job.created_at,
        started_at=job.started_at,
        completed_at=job.completed_at,
        updated_at=job.updated_at,
    )


async def _run_discover_all_job(job_id: int) -> None:
    try:
        async with AsyncSessionLocal() as worker_db:
            job_result = await worker_db.execute(select(TopologyDiscoveryJob).where(TopologyDiscoveryJob.id == job_id))
            job = job_result.scalar_one_or_none()
            if job is None:
                return

            owner_id = job.owner_id
            max_hops = max(1, min(job.max_hops, 5))

            started_at = datetime.now(timezone.utc)
            job.status = "running"
            job.started_at = started_at
            job.updated_at = started_at
            job.error_message = None
            job.result_json = "[]"
            job.total = 0
            job.successful = 0
            job.failed = 0
            await worker_db.commit()

            pods_result = await worker_db.execute(
                select(LabPod)
                .where(LabPod.owner_id == owner_id)
                .order_by(LabPod.pod_number)
            )
            pods = pods_result.scalars().all()

            job.total = len(pods)
            job.updated_at = datetime.now(timezone.utc)
            await worker_db.commit()

            items: list[TopologyDiscoverAllItem] = []
            successful = 0
            failed = 0

            for pod in pods:
                try:
                    snapshot = await discover_topology(worker_db, pod.id, max_hops=max_hops, owner_id=owner_id)
                    await broadcast(
                        {
                            "type": "topology.discovery",
                            "seed_pod_id": snapshot.seed_pod_id,
                            "snapshot": snapshot.model_dump(mode="json"),
                        }
                    )
                    item = TopologyDiscoverAllItem(
                        pod_id=pod.id,
                        pod_name=pod.pod_name,
                        success=True,
                        discovered_at=snapshot.discovered_at,
                        node_count=len(snapshot.nodes),
                        edge_count=len(snapshot.edges),
                        warnings=snapshot.warnings,
                    )
                    successful += 1
                except Exception as exc:  # pragma: no cover - defensive fallback for transport failures
                    detail = str(getattr(exc, "detail", exc))
                    item = TopologyDiscoverAllItem(
                        pod_id=pod.id,
                        pod_name=pod.pod_name,
                        success=False,
                        error=detail,
                    )
                    failed += 1

                items.append(item)
                job.successful = successful
                job.failed = failed
                job.result_json = _serialize_discovery_items(items)
                job.updated_at = datetime.now(timezone.utc)
                await worker_db.commit()

            completed_at = datetime.now(timezone.utc)
            job.status = "completed"
            job.completed_at = completed_at
            job.updated_at = completed_at
            await worker_db.commit()

    except Exception as exc:  # pragma: no cover - background safety path
        async with AsyncSessionLocal() as failed_db:
            job_result = await failed_db.execute(select(TopologyDiscoveryJob).where(TopologyDiscoveryJob.id == job_id))
            job = job_result.scalar_one_or_none()
            if job is None:
                return

            failed_at = datetime.now(timezone.utc)
            job.status = "failed"
            job.error_message = str(exc)
            job.completed_at = failed_at
            job.updated_at = failed_at
            await failed_db.commit()


async def broadcast(event: dict) -> None:
    dead: list[WebSocket] = []
    for ws in _clients:
        try:
            await ws.send_json(event)
        except Exception:
            dead.append(ws)

    for ws in dead:
        if ws in _clients:
            _clients.remove(ws)


@router.websocket("/ws")
async def topology_ws(ws: WebSocket):
    await ws.accept()
    _clients.append(ws)

    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        if ws in _clients:
            _clients.remove(ws)


@router.get("/discover/{pod_id}", response_model=TopologyDiscoveryResponse)
async def discover(
    pod_id: int,
    max_hops: int = Query(3, ge=1, le=5),
    db: AsyncSession = Depends(get_db),
    actor_id: str = Depends(get_actor_id),
):
    pod = await get_owned_pod(db, pod_id, actor_id)
    if not pod:
        raise HTTPException(status_code=404, detail="Pod not found")

    response = await discover_topology(db, pod_id, max_hops=max_hops, owner_id=actor_id)
    await broadcast(
        {
            "type": "topology.discovery",
            "seed_pod_id": response.seed_pod_id,
            "snapshot": response.model_dump(mode="json"),
        }
    )
    return response


@router.get("/routes/{pod_id}", response_model=RouteAnalyticsResponse)
async def get_routes_analytics(
    pod_id: int,
    db: AsyncSession = Depends(get_db),
    actor_id: str = Depends(get_actor_id),
):
    pod = await get_owned_pod(db, pod_id, actor_id)
    if not pod:
        raise HTTPException(status_code=404, detail="Pod not found")

    return await build_route_analytics(pod)


@router.post("/discover-all", response_model=TopologyDiscoverAllResponse)
async def discover_all(
    max_hops: int = Query(3, ge=1, le=5),
    db: AsyncSession = Depends(get_db),
    actor_id: str = Depends(get_actor_id),
):
    started_at = datetime.now(timezone.utc)
    result = await db.execute(
        select(LabPod)
        .where(LabPod.owner_id == actor_id)
        .order_by(LabPod.pod_number)
    )
    pods = result.scalars().all()

    items: list[TopologyDiscoverAllItem] = []
    for pod in pods:
        try:
            snapshot = await discover_topology(db, pod.id, max_hops=max_hops, owner_id=actor_id)
            await broadcast(
                {
                    "type": "topology.discovery",
                    "seed_pod_id": snapshot.seed_pod_id,
                    "snapshot": snapshot.model_dump(mode="json"),
                }
            )
            items.append(
                TopologyDiscoverAllItem(
                    pod_id=pod.id,
                    pod_name=pod.pod_name,
                    success=True,
                    discovered_at=snapshot.discovered_at,
                    node_count=len(snapshot.nodes),
                    edge_count=len(snapshot.edges),
                    warnings=snapshot.warnings,
                )
            )
        except Exception as exc:  # pragma: no cover - defensive fallback for transport failures
            detail = str(getattr(exc, "detail", exc))
            items.append(
                TopologyDiscoverAllItem(
                    pod_id=pod.id,
                    pod_name=pod.pod_name,
                    success=False,
                    error=detail,
                )
            )

    successful = sum(1 for item in items if item.success)
    failed = len(items) - successful

    return TopologyDiscoverAllResponse(
        started_at=started_at,
        completed_at=datetime.now(timezone.utc),
        total=len(items),
        successful=successful,
        failed=failed,
        items=items,
    )


@router.post("/discover-all/jobs", response_model=TopologyDiscoverAllJobCreateResponse, status_code=202)
async def start_discover_all_job(
    max_hops: int = Query(3, ge=1, le=5),
    db: AsyncSession = Depends(get_db),
    actor_id: str = Depends(get_actor_id),
):
    now = datetime.now(timezone.utc)
    job = TopologyDiscoveryJob(
        owner_id=actor_id,
        status="pending",
        max_hops=max_hops,
        result_json="[]",
        total=0,
        successful=0,
        failed=0,
        created_at=now,
        updated_at=now,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    asyncio.create_task(_run_discover_all_job(job.id))

    return TopologyDiscoverAllJobCreateResponse(job_id=job.id, status="pending")


@router.get("/discover-all/jobs/{job_id}", response_model=TopologyDiscoverAllJobRead)
async def get_discover_all_job(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    actor_id: str = Depends(get_actor_id),
):
    result = await db.execute(
        select(TopologyDiscoveryJob).where(
            TopologyDiscoveryJob.id == job_id,
            TopologyDiscoveryJob.owner_id == actor_id,
        )
    )
    job = result.scalar_one_or_none()
    if job is None:
        raise HTTPException(status_code=404, detail="Discovery job not found")

    return _to_job_read(job)


@router.get("/discover-all/jobs", response_model=list[TopologyDiscoverAllJobRead])
async def list_discover_all_jobs(
    limit: int = Query(10, ge=1, le=30),
    db: AsyncSession = Depends(get_db),
    actor_id: str = Depends(get_actor_id),
):
    result = await db.execute(
        select(TopologyDiscoveryJob)
        .where(TopologyDiscoveryJob.owner_id == actor_id)
        .order_by(TopologyDiscoveryJob.created_at.desc())
        .limit(limit)
    )
    jobs = result.scalars().all()
    return [_to_job_read(job) for job in jobs]