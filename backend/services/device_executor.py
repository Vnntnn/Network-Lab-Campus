import asyncio
import time
from collections import defaultdict

from scrapli import AsyncScrapli, Scrapli

from models import LabPod
from schemas import PushResponse, ShowResponse
from services.credentials import decrypt_credential

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


def build_conn_kwargs(pod: LabPod) -> dict:
    kwargs = dict(
        host=pod.device_ip,
        platform=_platform_for_device_type(pod.device_type),
        auth_strict_key=False,
        timeout_socket=10,
        timeout_transport=30,
        timeout_ops=30,
    )

    if pod.ssh_username:
        kwargs["auth_username"] = pod.ssh_username
    if pod.ssh_password:
        kwargs["auth_password"] = decrypt_credential(pod.ssh_password)

    if pod.connection_protocol == "telnet":
        kwargs["transport"] = "telnet"
        kwargs["port"] = pod.telnet_port or 23
    else:
        kwargs["transport"] = "asyncssh"

    return kwargs


def _sync_push(pod: LabPod, commands: list[str]) -> tuple[bool, str]:
    conn = Scrapli(**build_conn_kwargs(pod))
    conn.open()
    try:
        result = conn.send_configs(commands)
        return True, "\n".join(r.result for r in result)
    finally:
        conn.close()


def _sync_show(pod: LabPod, commands: list[str]) -> list[dict]:
    conn = Scrapli(**build_conn_kwargs(pod))
    conn.open()
    try:
        return [{"command": cmd, "output": conn.send_command(cmd).result} for cmd in commands]
    finally:
        conn.close()


async def push_commands(pod: LabPod, commands: list[str]) -> PushResponse:
    lock = _device_locks[pod.device_ip]
    async with lock:
        start = time.monotonic()
        try:
            if pod.connection_protocol == "telnet":
                success, output = await asyncio.to_thread(_sync_push, pod, commands)
            else:
                async with AsyncScrapli(**build_conn_kwargs(pod)) as conn:
                    result = await conn.send_configs(commands)
                    success, output = True, "\n".join(r.result for r in result)

            elapsed = (time.monotonic() - start) * 1000
            return PushResponse(success=success, output=output, elapsed_ms=round(elapsed, 2))
        except Exception as exc:
            elapsed = (time.monotonic() - start) * 1000
            return PushResponse(
                success=False,
                output=f"[executor error] {type(exc).__name__}: {exc}",
                elapsed_ms=round(elapsed, 2),
            )


async def run_show_commands(pod: LabPod, commands: list[str]) -> ShowResponse:
    start = time.monotonic()
    try:
        if pod.connection_protocol == "telnet":
            results = await asyncio.to_thread(_sync_show, pod, commands)
        else:
            async with AsyncScrapli(**build_conn_kwargs(pod)) as conn:
                results = []
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
