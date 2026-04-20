import json

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import AsyncSessionLocal
from models import DeviceCommandHistory


def normalize_device_key(device_key: str) -> str:
    return device_key.strip().lower()


def decode_history_commands(commands_json: str) -> list[str]:
    try:
        payload = json.loads(commands_json)
    except Exception:
        payload = None

    if isinstance(payload, list):
        return [str(command) for command in payload]

    return [line for line in commands_json.splitlines() if line.strip()]


async def append_device_history(
    *,
    actor_id: str,
    device_key: str,
    pod_id: int,
    pod_name: str,
    commands: list[str],
    success: bool,
    output: str,
    elapsed_ms: float,
    pre_snapshot_id: int | None = None,
) -> None:
    entry = DeviceCommandHistory(
        actor_id=actor_id,
        device_key=normalize_device_key(device_key),
        pod_id=pod_id,
        pod_name=pod_name,
        commands_json=json.dumps(commands, ensure_ascii=True),
        success=success,
        output=output,
        elapsed_ms=elapsed_ms,
        pre_snapshot_id=pre_snapshot_id,
    )

    async with AsyncSessionLocal() as db:
        db.add(entry)
        await db.commit()


async def fetch_device_history(db: AsyncSession, device_key: str, limit: int = 50) -> list[DeviceCommandHistory]:
    capped_limit = min(max(limit, 1), 200)
    result = await db.execute(
        select(DeviceCommandHistory)
        .where(DeviceCommandHistory.device_key == normalize_device_key(device_key))
        .order_by(DeviceCommandHistory.created_at.desc())
        .limit(capped_limit)
    )
    return result.scalars().all()
