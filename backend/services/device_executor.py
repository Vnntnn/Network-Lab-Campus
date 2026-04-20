import asyncio
import time
from collections import defaultdict

from scrapli import AsyncScrapli

from models import LabPod
from schemas import PushResponse, ShowResponse

# One lock per device IP — prevents race conditions when multiple students
# target the same pod simultaneously.
_device_locks: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)

PLATFORM_MAP = {
    "arista_eos":  "arista_eos",
    "cisco_iosxe": "cisco_iosxe",
    "cisco_iosxr": "cisco_iosxr",
}


def _platform_for_device_type(device_type: str) -> str:
    platform = PLATFORM_MAP.get(device_type)
    if platform is not None:
        return platform

    supported = ", ".join(sorted(PLATFORM_MAP.keys()))
    raise ValueError(f"Unsupported device_type '{device_type}'. Supported values: {supported}")


def _conn_kwargs(pod: LabPod) -> dict:
    return dict(
        host=pod.device_ip,
        auth_username=pod.ssh_username,
        auth_password=pod.ssh_password,
        platform=_platform_for_device_type(pod.device_type),
        auth_strict_key=False,
        transport="asyncssh",
        timeout_socket=10,
        timeout_transport=30,
        timeout_ops=30,
    )


async def push_commands(pod: LabPod, commands: list[str]) -> PushResponse:
    lock = _device_locks[pod.device_ip]
    async with lock:
        start = time.monotonic()
        try:
            async with AsyncScrapli(**_conn_kwargs(pod)) as conn:
                result = await conn.send_configs(commands)
                output = "\n".join(r.result for r in result)

            elapsed = (time.monotonic() - start) * 1000
            return PushResponse(success=True, output=output, elapsed_ms=round(elapsed, 2))
        except Exception as exc:
            elapsed = (time.monotonic() - start) * 1000
            return PushResponse(
                success=False,
                output=f"[executor error] {type(exc).__name__}: {exc}",
                elapsed_ms=round(elapsed, 2),
            )


async def run_show_commands(pod: LabPod, commands: list[str]) -> ShowResponse:
    """Send read-only show commands; does NOT acquire the device lock."""
    start = time.monotonic()
    try:
        results = []

        async with AsyncScrapli(**_conn_kwargs(pod)) as conn:
            for cmd in commands:
                r = await conn.send_command(cmd)
                results.append({"command": cmd, "output": r.result})

        elapsed = (time.monotonic() - start) * 1000
        return ShowResponse(success=True, results=results, elapsed_ms=round(elapsed, 2))
    except Exception as exc:
        elapsed = (time.monotonic() - start) * 1000
        return ShowResponse(
            success=False,
            results=[{"command": c, "output": f"[executor error] {type(exc).__name__}: {exc}"} for c in commands],
            elapsed_ms=round(elapsed, 2),
        )
