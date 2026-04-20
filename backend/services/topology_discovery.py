from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from hashlib import md5
from math import cos, pi, sin
from typing import Iterable

from fastapi import HTTPException
from ntc_templates.parse import parse_output
from scrapli import AsyncScrapli
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import LabPod
from schemas import (
    TopologyDiscoveryResponse,
    TopologyDeviceRead,
    TopologyEdgeDataRead,
    TopologyEdgeRead,
    TopologyNodeDataRead,
    TopologyNodeDiscoveryRead,
    TopologyNodeRead,
    TopologyPoint,
)
from services.device_executor import _conn_kwargs


DISCOVERY_MAX_HOPS = 3


DISCOVERY_COMMANDS: dict[str, list[tuple[str, str]]] = {
    "arista_eos": [("lldp", "show lldp neighbors")],
    "cisco_iosxe": [
        ("lldp", "show lldp neighbors detail"),
        ("cdp", "show cdp neighbors detail"),
    ],
    "cisco_iosxr": [
        ("lldp", "show lldp neighbors detail"),
        ("cdp", "show cdp neighbors detail"),
    ],
}

TEMPLATE_PLATFORM_MAP = {
    "arista_eos": "arista_eos",
    "cisco_iosxe": "cisco_ios",
    "cisco_iosxr": "cisco_xr",
}


@dataclass
class DiscoveryObservation:
    protocol: str
    local_interface: str
    remote_name: str
    remote_interface: str
    platform: str | None = None
    management_address: str | None = None
    description: str | None = None
    chassis_id: str | None = None
    source_command: str = ""


@dataclass
class DiscoveryCluster:
    protocols: set[str] = field(default_factory=set)
    source_commands: set[str] = field(default_factory=set)
    source_key: str = ""
    target_key: str = ""
    local_interfaces: set[str] = field(default_factory=set)
    remote_interfaces: set[str] = field(default_factory=set)
    platform: str | None = None
    management_address: str | None = None
    remote_name: str | None = None
    description: str | None = None
    chassis_id: str | None = None


@dataclass
class NodeAggregate:
    device: TopologyDeviceRead
    protocols: set[str] = field(default_factory=set)
    source_commands: set[str] = field(default_factory=set)
    local_interfaces: set[str] = field(default_factory=set)
    remote_interfaces: set[str] = field(default_factory=set)
    connected_peers: set[str] = field(default_factory=set)
    connection_count: int = 0
    platform: str | None = None
    management_address: str | None = None
    matched_pod_id: int | None = None


def _clean(value: object | None) -> str:
    if value is None:
        return ""
    return " ".join(str(value).split()).strip()


def _normalize_identity(value: str | None) -> str:
    cleaned = _clean(value).lower().rstrip(".")
    return cleaned


def _identity_candidates(value: str | None) -> list[str]:
    normalized = _normalize_identity(value)
    if not normalized:
        return []

    candidates = [normalized]
    if "." in normalized:
        candidates.append(normalized.split(".", 1)[0])
    if " " in normalized:
        candidates.append(normalized.split(" ", 1)[0])
    return list(dict.fromkeys(candidate for candidate in candidates if candidate))


def _infer_device_type(candidate: str | None) -> str:
    text = _clean(candidate).lower()
    if any(token in text for token in ("ios xr", "ios-xr", "iosxr", "xrv", "crs", "ios xrv")):
        return "cisco_iosxr"
    if any(token in text for token in ("arista", "eos")):
        return "arista_eos"
    if any(token in text for token in ("cisco", "nx-os", "nxos", "nexus", "ios xe", "iosxe")):
        return "cisco_iosxe"
    return "unknown"


def _unique(values: Iterable[str]) -> list[str]:
    return list(dict.fromkeys(value for value in values if value))


def _node_key(device: TopologyDeviceRead) -> str:
    return f"pod-{device.id}" if device.id >= 0 else f"external-{abs(device.id)}"


def _external_id(seed_id: int, key: str) -> int:
    digest = md5(f"{seed_id}:{key}".encode("utf-8")).hexdigest()
    return -int(digest[:8], 16)


def _parse_rows(platform: str, command: str, output: str) -> list[dict]:
    try:
        rows = parse_output(platform=platform, command=command, data=output)
    except Exception:
        return []
    return [dict(row) for row in rows or []]


def _first(row: dict, *keys: str) -> str:
    for key in keys:
        value = _clean(row.get(key))
        if value:
            return value
    return ""


def _to_observations(protocol: str, command: str, rows: list[dict]) -> list[DiscoveryObservation]:
    observations: list[DiscoveryObservation] = []

    for row in rows:
        if command == "show lldp neighbors":
            local_interface = _first(row, "LOCAL_INTERFACE")
            remote_name = _first(row, "NEIGHBOR_NAME")
            remote_interface = _first(row, "NEIGHBOR_INTERFACE")
            if not remote_name:
                remote_name = _first(row, "CHASSIS_ID")
            observations.append(
                DiscoveryObservation(
                    protocol=protocol,
                    local_interface=local_interface,
                    remote_name=remote_name,
                    remote_interface=remote_interface,
                    description=remote_name,
                    source_command=command,
                )
            )
            continue

        if command == "show lldp neighbors detail":
            local_interface = _first(row, "LOCAL_INTERFACE")
            remote_name = _first(row, "NEIGHBOR_NAME", "NEIGHBOR", "CHASSIS_ID")
            remote_interface = _first(row, "NEIGHBOR_INTERFACE", "NEIGHBOR_PORT_ID", "NEIGHBOR_PORT_DESCRIPTION")
            platform = _first(row, "PLATFORM", "SYSTEM_DESCRIPTION")
            management_address = _first(row, "MGMT_ADDRESS", "MANAGEMENT_IP", "MANAGEMENT_IPV6")
            description = _first(row, "NEIGHBOR_DESCRIPTION", "SYSTEM_DESCRIPTION")
            chassis_id = _first(row, "CHASSIS_ID", "MAC_ADDRESS")
            observations.append(
                DiscoveryObservation(
                    protocol=protocol,
                    local_interface=local_interface,
                    remote_name=remote_name or management_address or chassis_id,
                    remote_interface=remote_interface,
                    platform=platform,
                    management_address=management_address,
                    description=description,
                    chassis_id=chassis_id,
                    source_command=command,
                )
            )
            continue

        if command == "show cdp neighbors detail":
            local_interface = _first(row, "LOCAL_INTERFACE")
            remote_name = _first(row, "NEIGHBOR_NAME", "CHASSIS_ID")
            remote_interface = _first(row, "NEIGHBOR_INTERFACE")
            platform = _first(row, "PLATFORM")
            management_address = _first(row, "MGMT_ADDRESS")
            description = _first(row, "NEIGHBOR_DESCRIPTION")
            chassis_id = _first(row, "CHASSIS_ID")
            observations.append(
                DiscoveryObservation(
                    protocol=protocol,
                    local_interface=local_interface,
                    remote_name=remote_name or management_address or chassis_id,
                    remote_interface=remote_interface,
                    platform=platform,
                    management_address=management_address,
                    description=description,
                    chassis_id=chassis_id,
                    source_command=command,
                )
            )
            continue

    return observations


def _build_actual_device(pod: LabPod, *, is_seed: bool = False) -> TopologyDeviceRead:
    return TopologyDeviceRead(
        id=pod.id,
        pod_number=pod.pod_number,
        pod_name=pod.pod_name,
        device_ip=pod.device_ip,
        device_type=pod.device_type,  # type: ignore[arg-type]
        ssh_username=pod.ssh_username,
        ssh_password=pod.ssh_password,
        description=pod.description or "",
        is_external=False,
        is_seed=is_seed,
        badge_label=f"pod {pod.pod_number}",
        matched_pod_id=pod.id,
    )


def _build_external_device(seed_id: int, observation: DiscoveryObservation) -> TopologyDeviceRead:
    primary_name = observation.remote_name or observation.management_address or observation.chassis_id or "unknown neighbor"
    return TopologyDeviceRead(
        id=_external_id(seed_id, primary_name),
        pod_number=None,
        pod_name=primary_name,
        device_ip=observation.management_address or "",
        device_type=_infer_device_type(observation.platform or observation.description or observation.remote_name),
        ssh_username="",
        ssh_password="",
        description=observation.platform or observation.description or observation.chassis_id or "",
        is_external=True,
        is_seed=False,
        badge_label=(observation.protocol or "discovered").upper(),
    )


def _build_discovery_node(
    device: TopologyDeviceRead,
    *,
    protocols: set[str],
    source_commands: set[str],
    local_interfaces: set[str],
    remote_interfaces: set[str],
    platform: str | None,
    management_address: str | None,
    matched_pod_id: int | None,
) -> TopologyNodeRead:
    badge_label = device.badge_label
    if device.is_seed:
        badge_label = "seed"
    elif device.is_external:
        badge_label = " · ".join(sorted(protocols)).upper() if protocols else "discovered"

    return TopologyNodeRead(
        id=_node_key(device),
        position=TopologyPoint(x=0, y=0),
        data=TopologyNodeDataRead(
            pod=device,
            connectionCount=0,
            connectedPeers=[],
            inlineConfig=not device.is_external,
            badgeLabel=badge_label,
            discovery=TopologyNodeDiscoveryRead(
                is_external=device.is_external,
                is_seed=device.is_seed,
                protocols=sorted(protocols),
                platform=platform,
                management_address=management_address,
                local_interfaces=sorted(local_interfaces),
                remote_interfaces=sorted(remote_interfaces),
                source_commands=sorted(source_commands),
                matched_pod_id=matched_pod_id,
            ),
        ),
    )


def _spread_positions(node_count: int, *, center_x: float, center_y: float, radius: float) -> list[TopologyPoint]:
    if node_count <= 0:
        return []
    if node_count == 1:
        return [TopologyPoint(x=center_x + radius, y=center_y)]

    positions: list[TopologyPoint] = []
    step = (2 * pi) / node_count
    for index in range(node_count):
        angle = (-pi / 2) + (step * index)
        positions.append(
            TopologyPoint(
                x=center_x + cos(angle) * radius,
                y=center_y + sin(angle) * radius,
            )
        )
    return positions


def _first_label(values: Iterable[str], *, fallback: str) -> str:
    for value in values:
        cleaned = _clean(value)
        if cleaned:
            return cleaned
    return fallback


def _edge_key(source_key: str, target_key: str) -> str:
    return "::".join(sorted([source_key, target_key]))


def _build_actual_or_external_node(
    *,
    current_pod: LabPod,
    is_seed: bool,
    matched_pod: LabPod | None,
    observation: DiscoveryObservation | None = None,
) -> TopologyDeviceRead:
    if matched_pod is not None:
        return _build_actual_device(matched_pod, is_seed=is_seed)

    if observation is not None:
        return _build_external_device(current_pod.id, observation)

    return _build_actual_device(current_pod, is_seed=is_seed)


def _ensure_node_aggregate(
    aggregates: dict[str, NodeAggregate],
    device: TopologyDeviceRead,
    *,
    is_seed: bool = False,
    platform: str | None = None,
    management_address: str | None = None,
    matched_pod_id: int | None = None,
) -> NodeAggregate:
    node_key = _node_key(device)
    aggregate = aggregates.get(node_key)

    if aggregate is None:
        aggregate = NodeAggregate(
            device=device,
            platform=platform or device.description or (device.device_type if not device.is_external else None),
            management_address=management_address or device.device_ip or None,
            matched_pod_id=matched_pod_id,
        )
        aggregates[node_key] = aggregate
    else:
        if aggregate.device.is_external and not device.is_external:
            aggregate.device = device
        elif not aggregate.device.is_external and device.is_external:
            device = aggregate.device

        if is_seed:
            aggregate.device.is_seed = True
        elif device.is_seed:
            aggregate.device.is_seed = True

        if device.badge_label:
            aggregate.device.badge_label = device.badge_label

        aggregate.platform = aggregate.platform or platform or device.description or (device.device_type if not device.is_external else None)
        aggregate.management_address = aggregate.management_address or management_address or device.device_ip or None
        aggregate.matched_pod_id = aggregate.matched_pod_id or matched_pod_id or device.matched_pod_id

    return aggregate


def _build_node_from_aggregate(node_key: str, aggregate: NodeAggregate, position: TopologyPoint) -> TopologyNodeRead:
    device = aggregate.device
    badge_label = device.badge_label
    if device.is_seed:
        badge_label = "seed"
    elif device.is_external:
        badge_label = " · ".join(sorted(aggregate.protocols)).upper() if aggregate.protocols else "discovered"

    return TopologyNodeRead(
        id=node_key,
        position=position,
        data=TopologyNodeDataRead(
            pod=device,
            connectionCount=aggregate.connection_count,
            connectedPeers=sorted(aggregate.connected_peers),
            inlineConfig=not device.is_external,
            badgeLabel=badge_label,
            discovery=TopologyNodeDiscoveryRead(
                is_external=device.is_external,
                is_seed=device.is_seed,
                protocols=sorted(aggregate.protocols),
                platform=aggregate.platform,
                management_address=aggregate.management_address,
                local_interfaces=sorted(aggregate.local_interfaces),
                remote_interfaces=sorted(aggregate.remote_interfaces),
                source_commands=sorted(aggregate.source_commands),
                matched_pod_id=aggregate.matched_pod_id,
            ),
        ),
    )


async def _scan_device(
    pod: LabPod,
    commands: list[tuple[str, str]],
) -> tuple[list[DiscoveryObservation], list[str]]:
    template_platform = TEMPLATE_PLATFORM_MAP.get(pod.device_type, "cisco_ios")

    try:
        async with AsyncScrapli(**_conn_kwargs(pod)) as conn:
            command_outputs: list[tuple[str, str]] = []
            for _, command in commands:
                response = await conn.send_command(command)
                command_outputs.append((command, response.result or ""))
    except Exception as exc:  # pragma: no cover - connection failures are surfaced to the UI
        raise HTTPException(status_code=502, detail=f"Discovery failed: {exc}") from exc

    observations: list[DiscoveryObservation] = []
    for protocol, command in commands:
        matching_output = next((output for current_command, output in command_outputs if current_command == command), "")
        observations.extend(_to_observations(protocol, command, _parse_rows(template_platform, command, matching_output)))

    return observations, [command for _, command in commands]


async def discover_topology(db: AsyncSession, pod_id: int, max_hops: int = DISCOVERY_MAX_HOPS) -> TopologyDiscoveryResponse:
    seed = await db.get(LabPod, pod_id)
    if not seed:
        raise HTTPException(status_code=404, detail="Pod not found")

    result = await db.execute(select(LabPod))
    known_pods = result.scalars().all()
    pods_by_ip = {pod.device_ip: pod for pod in known_pods}
    pods_by_name: dict[str, LabPod] = {}
    for pod in known_pods:
        for candidate in _identity_candidates(pod.pod_name):
            pods_by_name.setdefault(candidate, pod)

    max_hops = max(1, min(max_hops, 5))

    node_aggregates: dict[str, NodeAggregate] = {}
    edge_clusters: dict[str, DiscoveryCluster] = {}
    executed_commands: list[str] = []
    warnings: list[str] = []

    seed_device = _build_actual_device(seed, is_seed=True)
    seed_node_key = _node_key(seed_device)
    seed_aggregate = _ensure_node_aggregate(
        node_aggregates,
        seed_device,
        is_seed=True,
        platform=seed.description or seed.device_type,
        management_address=seed.device_ip,
        matched_pod_id=seed.id,
    )
    seed_aggregate.device.is_seed = True

    scan_queue: deque[tuple[LabPod, int]] = deque([(seed, 0)])
    visited: set[int] = set()

    while scan_queue:
        current_pod, depth = scan_queue.popleft()
        if current_pod.id in visited:
            continue
        visited.add(current_pod.id)

        current_device = _build_actual_device(current_pod, is_seed=current_pod.id == seed.id)
        current_commands = DISCOVERY_COMMANDS.get(current_pod.device_type, DISCOVERY_COMMANDS["cisco_iosxe"])
        current_aggregate = _ensure_node_aggregate(
            node_aggregates,
            current_device,
            is_seed=current_pod.id == seed.id,
            platform=current_pod.description or current_pod.device_type,
            management_address=current_pod.device_ip,
            matched_pod_id=current_pod.id,
        )
        current_aggregate.device.is_seed = current_aggregate.device.is_seed or current_pod.id == seed.id
        current_aggregate.protocols.update(protocol for protocol, _ in current_commands)
        current_aggregate.source_commands.update(command for _, command in current_commands)

        try:
            observations, scanned_commands = await _scan_device(current_pod, current_commands)
        except HTTPException as exc:
            detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
            detail = detail.removeprefix("Discovery failed: ").strip()
            warnings.append(f"Discovery timed out on {current_pod.pod_name}: {detail or 'device unreachable'}")
            continue

        executed_commands.extend(scanned_commands)

        current_key = _node_key(current_aggregate.device)

        for observation in observations:
            if not observation.remote_name and not observation.remote_interface and not observation.management_address:
                continue

            matched_pod = None
            if observation.management_address and observation.management_address in pods_by_ip:
                matched_pod = pods_by_ip[observation.management_address]
            else:
                for candidate in _identity_candidates(observation.remote_name) + _identity_candidates(observation.chassis_id):
                    matched_pod = pods_by_name.get(candidate)
                    if matched_pod:
                        break

            if matched_pod and matched_pod.id == current_pod.id:
                continue

            remote_device = _build_actual_or_external_node(
                current_pod=current_pod,
                is_seed=False,
                matched_pod=matched_pod,
                observation=observation if matched_pod is None else None,
            )

            if matched_pod:
                remote_device.badge_label = remote_device.badge_label or f"pod {matched_pod.pod_number}"

            remote_key = _node_key(remote_device)
            remote_aggregate = _ensure_node_aggregate(
                node_aggregates,
                remote_device,
                platform=observation.platform or remote_device.description or None,
                management_address=observation.management_address or remote_device.device_ip or None,
                matched_pod_id=matched_pod.id if matched_pod else None,
            )
            remote_aggregate.device.is_seed = remote_aggregate.device.is_seed or (matched_pod is not None and matched_pod.id == seed.id)

            cluster_key = _edge_key(current_key, remote_key)
            cluster = edge_clusters.get(cluster_key)
            if cluster is None:
                cluster = DiscoveryCluster(source_key=current_key, target_key=remote_key)
                edge_clusters[cluster_key] = cluster

            cluster.protocols.add(observation.protocol)
            cluster.source_commands.add(observation.source_command)
            if cluster.source_key == current_key:
                if observation.local_interface:
                    cluster.local_interfaces.add(observation.local_interface)
                if observation.remote_interface:
                    cluster.remote_interfaces.add(observation.remote_interface)
            else:
                if observation.remote_interface:
                    cluster.local_interfaces.add(observation.remote_interface)
                if observation.local_interface:
                    cluster.remote_interfaces.add(observation.local_interface)
            cluster.platform = cluster.platform or observation.platform or remote_device.description or None
            cluster.management_address = cluster.management_address or observation.management_address or remote_device.device_ip or None
            cluster.remote_name = cluster.remote_name or remote_device.pod_name
            cluster.description = cluster.description or observation.description or None
            cluster.chassis_id = cluster.chassis_id or observation.chassis_id or None

            if matched_pod and matched_pod.id not in visited and depth < max_hops:
                scan_queue.append((matched_pod, depth + 1))

    for cluster in edge_clusters.values():
        source_aggregate = node_aggregates[cluster.source_key]
        target_aggregate = node_aggregates[cluster.target_key]

        source_aggregate.protocols.update(cluster.protocols)
        target_aggregate.protocols.update(cluster.protocols)
        source_aggregate.source_commands.update(cluster.source_commands)
        target_aggregate.source_commands.update(cluster.source_commands)
        source_aggregate.local_interfaces.update(cluster.local_interfaces)
        source_aggregate.remote_interfaces.update(cluster.remote_interfaces)
        target_aggregate.local_interfaces.update(cluster.remote_interfaces)
        target_aggregate.remote_interfaces.update(cluster.local_interfaces)
        source_aggregate.connection_count += 1
        target_aggregate.connection_count += 1
        source_aggregate.connected_peers.add(target_aggregate.device.pod_name)
        target_aggregate.connected_peers.add(source_aggregate.device.pod_name)
        source_aggregate.platform = source_aggregate.platform or cluster.platform
        target_aggregate.platform = target_aggregate.platform or cluster.platform
        source_aggregate.management_address = source_aggregate.management_address or cluster.management_address
        target_aggregate.management_address = target_aggregate.management_address or cluster.management_address

    ordered_targets = sorted(key for key in node_aggregates.keys() if key != seed_node_key)
    target_positions = _spread_positions(
        len(ordered_targets),
        center_x=420,
        center_y=290,
        radius=260,
    )

    node_nodes: dict[str, TopologyNodeRead] = {}
    seed_node = _build_node_from_aggregate(seed_node_key, seed_aggregate, TopologyPoint(x=420, y=290))
    node_nodes[seed_node_key] = seed_node

    for index, node_key in enumerate(ordered_targets):
        position = target_positions[index] if index < len(target_positions) else TopologyPoint(x=640 + (index * 90), y=260 + (index % 3) * 110)
        node_nodes[node_key] = _build_node_from_aggregate(node_key, node_aggregates[node_key], position)

    if seed_node.data.connectionCount == 0 and len(ordered_targets) > 0:
        seed_node.data.connectionCount = len(ordered_targets)
        seed_node.data.connectedPeers = [node_nodes[key].data.pod.pod_name for key in ordered_targets]

    edges: list[TopologyEdgeRead] = []
    for cluster_key, cluster in edge_clusters.items():
        source_label = _first_label(cluster.local_interfaces, fallback=node_nodes[cluster.source_key].data.pod.pod_name)
        remote_label = _first_label(cluster.remote_interfaces, fallback=node_nodes[cluster.target_key].data.pod.pod_name)
        edge = TopologyEdgeRead(
            id=cluster_key,
            source=cluster.source_key,
            target=cluster.target_key,
            data=TopologyEdgeDataRead(
                sourceLabel=source_label,
                targetLabel=remote_label,
                recent=False,
                isDiscovery=True,
                discoveryProtocols=sorted(cluster.protocols),
                discoveryNote=cluster.platform,
                sourceInterfaces=sorted(cluster.local_interfaces),
                targetInterfaces=sorted(cluster.remote_interfaces),
            ),
        )
        edges.append(edge)

    seed_node.data.badgeLabel = "seed"

    return TopologyDiscoveryResponse(
        seed_pod_id=seed.id,
        seed_pod_name=seed.pod_name,
        commands=_unique(executed_commands),
        nodes=[seed_node, *[node_nodes[key] for key in ordered_targets]],
        edges=edges,
        warnings=_unique(warnings),
    )