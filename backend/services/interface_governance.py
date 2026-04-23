from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import LabPod, PodDisabledInterface
from schemas import PodInterfaceRead, PodInterfacesResponse
from services.topology_discovery import discover_topology


def _build_interface_peer_map(pod_id: int, snapshot) -> dict[str, int]:
    node_id = f"pod-{pod_id}"
    peer_count: dict[str, int] = defaultdict(int)

    for edge in snapshot.edges:
        if edge.source == node_id:
            names = edge.data.sourceInterfaces or ([edge.data.sourceLabel] if edge.data.sourceLabel else [])
            for name in names:
                cleaned = name.strip()
                if cleaned:
                    peer_count[cleaned] += 1
        if edge.target == node_id:
            names = edge.data.targetInterfaces or ([edge.data.targetLabel] if edge.data.targetLabel else [])
            for name in names:
                cleaned = name.strip()
                if cleaned:
                    peer_count[cleaned] += 1

    return dict(peer_count)


def _build_discovered_interface_set(pod_id: int, snapshot) -> set[str]:
    node_id = f"pod-{pod_id}"
    for node in snapshot.nodes:
        if node.id != node_id:
            continue

        names = set()
        for iface in node.data.discovery.local_interfaces:
            cleaned = iface.strip()
            if cleaned:
                names.add(cleaned)
        for iface in node.data.discovery.remote_interfaces:
            cleaned = iface.strip()
            if cleaned:
                names.add(cleaned)
        return names

    return set()


async def get_pod_interfaces(
    db: AsyncSession,
    *,
    pod: LabPod,
    owner_id: str,
    max_hops: int = 1,
) -> PodInterfacesResponse:
    snapshot = await discover_topology(db, pod.id, max_hops=max_hops, owner_id=owner_id)
    peer_map = _build_interface_peer_map(pod.id, snapshot)
    interface_names = _build_discovered_interface_set(pod.id, snapshot)
    interface_names.update(peer_map.keys())

    disabled_result = await db.execute(
        select(PodDisabledInterface.interface_name).where(PodDisabledInterface.pod_id == pod.id)
    )
    disabled_names = {name for name in disabled_result.scalars().all() if name}

    interfaces: list[PodInterfaceRead] = []
    for interface_name in sorted(interface_names):
        connected = peer_map.get(interface_name, 0) > 0
        disabled = interface_name in disabled_names
        interfaces.append(
            PodInterfaceRead(
                interface_name=interface_name,
                connected=connected,
                disabled=disabled,
                can_disable=not connected,
                peer_count=peer_map.get(interface_name, 0),
            )
        )

    return PodInterfacesResponse(
        pod_id=pod.id,
        pod_name=pod.pod_name,
        discovered_at=snapshot.discovered_at or datetime.now(timezone.utc),
        interfaces=interfaces,
    )


async def set_interface_disabled_state(
    db: AsyncSession,
    *,
    pod: LabPod,
    owner_id: str,
    interface_name: str,
    disabled: bool,
) -> PodInterfacesResponse:
    payload = await get_pod_interfaces(db, pod=pod, owner_id=owner_id, max_hops=1)
    target = next((entry for entry in payload.interfaces if entry.interface_name == interface_name), None)

    if target is None:
        raise HTTPException(status_code=404, detail="Interface not found on discovered topology")

    if disabled and target.connected:
        raise HTTPException(status_code=409, detail="Connected interface cannot be disabled")

    existing_result = await db.execute(
        select(PodDisabledInterface).where(
            PodDisabledInterface.pod_id == pod.id,
            PodDisabledInterface.interface_name == interface_name,
        )
    )
    existing = existing_result.scalar_one_or_none()

    if disabled and existing is None:
        db.add(PodDisabledInterface(pod_id=pod.id, interface_name=interface_name))
    elif not disabled and existing is not None:
        await db.delete(existing)

    await db.commit()
    return await get_pod_interfaces(db, pod=pod, owner_id=owner_id, max_hops=1)
