import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from deps import get_actor_id
from routers.instructor import broadcast
from routers.snapshots import capture_snapshot_background, create_snapshot_record
from schemas import DeviceHistoryEntryRead, PushRequest, PushResponse, ShowRequest, ShowResponse
from services.device_history import append_device_history, decode_history_commands, fetch_device_history
from services.device_executor import push_commands, run_show_commands
from services.ownership import get_owned_pod

router = APIRouter(prefix="/commands", tags=["commands"])


@router.post("/push", response_model=PushResponse)
async def push_to_device(
    payload: PushRequest,
    db: AsyncSession = Depends(get_db),
    actor_id: str = Depends(get_actor_id),
):
    pod = await get_owned_pod(db, payload.pod_id, actor_id)
    if not pod:
        raise HTTPException(status_code=404, detail="Pod not found")

    pre_snapshot_id: int | None = None
    try:
        snapshot = await create_snapshot_record(db=db, pod_id=payload.pod_id, label="pre-push", actor_id=actor_id)
        pre_snapshot_id = snapshot.id
    except Exception:
        # Keep push path resilient: if sync capture fails, fallback to background best-effort capture.
        await db.rollback()
        asyncio.create_task(capture_snapshot_background(payload.pod_id, label="pre-push", actor_id=actor_id))

    await broadcast(
        {
            "type": "pod.lock",
            "pod_id": payload.pod_id,
            "pod_name": pod.pod_name,
            "reason": "push",
            "duration_ms": 60000,
            "ts": datetime.now(timezone.utc).isoformat(),
        }
    )

    result = await push_commands(pod, payload.commands)

    try:
        await append_device_history(
            actor_id=actor_id,
            device_key=pod.device_ip,
            pod_id=pod.id,
            pod_name=pod.pod_name,
            commands=payload.commands,
            success=result.success,
            output=result.output,
            elapsed_ms=result.elapsed_ms,
            pre_snapshot_id=pre_snapshot_id,
        )
    except Exception:
        # History capture should not block the push API path.
        pass

    await broadcast(
        {
            "type": "push",
            "pod_id": payload.pod_id,
            "pod_name": pod.pod_name,
            "device_ip": pod.device_ip,
            "success": result.success,
            "elapsed_ms": result.elapsed_ms,
            "command_count": len(payload.commands),
            "pre_snapshot_id": pre_snapshot_id,
            "ts": datetime.now(timezone.utc).isoformat(),
        }
    )
    await broadcast(
        {
            "type": "pod.unlock",
            "pod_id": payload.pod_id,
            "pod_name": pod.pod_name,
            "reason": "push-complete",
            "ts": datetime.now(timezone.utc).isoformat(),
        }
    )

    return PushResponse(
        success=result.success,
        output=result.output,
        elapsed_ms=result.elapsed_ms,
        pre_snapshot_id=pre_snapshot_id,
    )


@router.post("/show", response_model=ShowResponse)
async def show_on_device(
    payload: ShowRequest,
    db: AsyncSession = Depends(get_db),
    actor_id: str = Depends(get_actor_id),
):
    pod = await get_owned_pod(db, payload.pod_id, actor_id)
    if not pod:
        raise HTTPException(status_code=404, detail="Pod not found")
    return await run_show_commands(pod, payload.commands)


@router.get("/history/device/{device_key}", response_model=list[DeviceHistoryEntryRead])
async def list_device_history(
    device_key: str,
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    history_entries = await fetch_device_history(db=db, device_key=device_key, limit=limit)
    return [
        DeviceHistoryEntryRead(
            id=entry.id,
            device_key=entry.device_key,
            pod_id=entry.pod_id,
            pod_name=entry.pod_name,
            actor_id=entry.actor_id,
            commands=decode_history_commands(entry.commands_json),
            success=entry.success,
            output=entry.output,
            elapsed_ms=entry.elapsed_ms,
            pre_snapshot_id=entry.pre_snapshot_id,
            created_at=entry.created_at,
        )
        for entry in history_entries
    ]
