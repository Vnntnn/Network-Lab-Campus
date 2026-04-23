from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
import re

from fastapi import HTTPException

from models import LabPod
from schemas import RouteAnalyticsResponse, RouteEntryRead
from services.device_executor import run_show_commands


_ROUTE_COMMANDS: dict[str, list[str]] = {
    "arista_eos": ["show ip route"],
    "cisco_iosxe": ["show ip route"],
    "cisco_iosxr": ["show route ipv4 unicast", "show ip route"],
}

_PREFIX_LINE = re.compile(
    r"^(?P<code>[A-Z][A-Z0-9* ]{0,7})\s+(?P<prefix>(?:\d{1,3}\.){3}\d{1,3}/\d{1,2}|[0-9A-Fa-f:]+/\d{1,3})\b"
)
_VIA_RE = re.compile(r"\bvia\s+(?P<nh>[0-9A-Fa-f:.]+)(?:,\s*[^,]+)?(?:,\s*(?P<iface>[A-Za-z][\w./:-]+))?")
_CONNECTED_RE = re.compile(r"directly connected,\s*(?P<iface>[A-Za-z][\w./:-]+)")
_ANSI_RE = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")
_SKIP_PREFIXES = (
    "Codes:",
    "Gateway of last resort",
    "Route Distinguisher",
    "VRF",
    "Routing Table",
)


def _normalize_code(code: str) -> str:
    return " ".join(code.replace("*", "").split()).upper()


def _protocol_from_code(code: str) -> str:
    normalized = _normalize_code(code)

    if normalized.startswith("C"):
        return "connected"
    if normalized.startswith("L"):
        return "local"
    if normalized.startswith("S"):
        return "static"
    if normalized.startswith("O"):
        return "ospf"
    if normalized.startswith("D"):
        return "eigrp"
    if normalized.startswith("B"):
        return "bgp"
    if normalized.startswith("R"):
        return "rip"
    if normalized.startswith("N"):
        return "ospf-nssa"
    if normalized.startswith("I"):
        return "isis"

    return "other"


def _parse_route_line(raw_line: str) -> RouteEntryRead | None:
    line = _ANSI_RE.sub("", raw_line).strip()
    if not line:
        return None
    if any(line.startswith(prefix) for prefix in _SKIP_PREFIXES):
        return None

    match = _PREFIX_LINE.match(line)
    if not match:
        return None

    code = _normalize_code(match.group("code"))
    prefix = match.group("prefix")

    via_match = _VIA_RE.search(line)
    next_hop = via_match.group("nh") if via_match else None
    interface = via_match.group("iface") if via_match else None

    if interface is None:
        connected_match = _CONNECTED_RE.search(line)
        if connected_match:
            interface = connected_match.group("iface")

    return RouteEntryRead(
        code=code,
        protocol=_protocol_from_code(code),
        prefix=prefix,
        next_hop=next_hop,
        interface=interface,
        raw=line,
    )


def _commands_for_pod(pod: LabPod) -> list[str]:
    return _ROUTE_COMMANDS.get(pod.device_type, ["show ip route"])


def _pick_output(results: list[dict]) -> tuple[str, str]:
    for result in results:
        output = (result.get("output") or "").strip()
        if not output:
            continue
        if "[executor error]" in output:
            continue
        if "/" in output:
            return result.get("command", "show ip route"), output

    if results:
        first = results[0]
        return first.get("command", "show ip route"), (first.get("output") or "")

    return "show ip route", ""


async def build_route_analytics(pod: LabPod) -> RouteAnalyticsResponse:
    commands = _commands_for_pod(pod)
    show_response = await run_show_commands(pod, commands)

    if not show_response.success and not show_response.results:
        raise HTTPException(status_code=502, detail="Route analytics failed: device unreachable")

    source_command, output = _pick_output(show_response.results)

    routes: list[RouteEntryRead] = []
    for line in output.splitlines():
        parsed = _parse_route_line(line)
        if parsed is not None:
            routes.append(parsed)

    protocol_counts = Counter(route.protocol for route in routes)
    default_route_present = any(route.prefix in {"0.0.0.0/0", "::/0"} for route in routes)

    warnings: list[str] = []
    if not routes:
        warnings.append("No route entries were parsed from the command output.")

    return RouteAnalyticsResponse(
        pod_id=pod.id,
        pod_name=pod.pod_name,
        generated_at=datetime.now(timezone.utc),
        source_command=source_command,
        total_routes=len(routes),
        default_route_present=default_route_present,
        protocol_counts=dict(sorted(protocol_counts.items(), key=lambda item: item[0])),
        routes=routes[:250],
        warnings=warnings,
    )
