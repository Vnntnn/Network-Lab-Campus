import asyncio
import time
from collections import defaultdict

from scrapli import AsyncScrapli, Scrapli

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
    """Build connection kwargs based on pod configuration and protocol."""
    kwargs = dict(
        host=pod.device_ip,
        platform=_platform_for_device_type(pod.device_type),
        auth_strict_key=False,
        timeout_socket=10,
        timeout_transport=30,
        timeout_ops=30,
    )

    # Only add credentials if provided
    if pod.ssh_username:
        kwargs["auth_username"] = pod.ssh_username
    if pod.ssh_password:
        kwargs["auth_password"] = pod.ssh_password

    # Use connection_protocol field if available, default to ssh for backward compatibility
    protocol = getattr(pod, "connection_protocol", "ssh")

    if protocol == "telnet":
        kwargs["transport"] = "telnet"
        # Use custom telnet port if provided, otherwise use default (23)
        telnet_port = getattr(pod, "telnet_port", None)
        if telnet_port:
            kwargs["port"] = telnet_port
        else:
            kwargs["port"] = 23
    else:
        kwargs["transport"] = "asyncssh"

    return kwargs


async def push_commands(pod: LabPod, commands: list[str]) -> PushResponse:
    lock = _device_locks[pod.device_ip]
    async with lock:
        start = time.monotonic()
        try:
            protocol = getattr(pod, "connection_protocol", "ssh")
            
            if protocol == "telnet":
                # Use synchronous Scrapli for Telnet
                kwargs = _conn_kwargs(pod)
                conn = Scrapli(**kwargs)
                conn.open()
                try:
                    result = conn.send_configs(commands)
                    output = "\n".join(r.result for r in result)
                finally:
                    conn.close()
            else:
                # Use AsyncScrapli for SSH
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
        protocol = getattr(pod, "connection_protocol", "ssh")
        results = []

        if protocol == "telnet":
            # Use synchronous Scrapli for Telnet
            kwargs = _conn_kwargs(pod)
            conn = Scrapli(**kwargs)
            conn.open()
            try:
                for cmd in commands:
                    r = conn.send_command(cmd)
                    results.append({"command": cmd, "output": r.result})
            finally:
                conn.close()
        else:
            # Use AsyncScrapli for SSH
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
