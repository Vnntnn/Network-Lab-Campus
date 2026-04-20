import asyncio
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import LabPod
from routers.instructor import broadcast
from routers.snapshots import capture_snapshot_background, create_snapshot_record
from schemas import PushRequest, PushResponse, ShowRequest, ShowResponse
from services.device_executor import push_commands, run_show_commands

router = APIRouter(prefix="/commands", tags=["commands"])


@router.post("/push", response_model=PushResponse)
async def push_to_device(payload: PushRequest, db: AsyncSession = Depends(get_db)):
    pod = await db.get(LabPod, payload.pod_id)
    if not pod:
        raise HTTPException(status_code=404, detail="Pod not found")

    pre_snapshot_id: int | None = None
    try:
        snapshot = await create_snapshot_record(db=db, pod_id=payload.pod_id, label="pre-push")
        pre_snapshot_id = snapshot.id
    except Exception:
        # Keep push path resilient: if sync capture fails, fallback to background best-effort capture.
        await db.rollback()
        asyncio.create_task(capture_snapshot_background(payload.pod_id, label="pre-push"))

    await broadcast(
        {
            "type": "pod.lock",
            "pod_id": payload.pod_id,
            "pod_name": pod.pod_name,
            "reason": "push",
            "duration_ms": 60000,
            "ts": datetime.utcnow().isoformat(),
        }
    )

    result = await push_commands(pod, payload.commands)
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
            "ts": datetime.utcnow().isoformat(),
        }
    )
    await broadcast(
        {
            "type": "pod.unlock",
            "pod_id": payload.pod_id,
            "pod_name": pod.pod_name,
            "reason": "push-complete",
            "ts": datetime.utcnow().isoformat(),
        }
    )

    return PushResponse(
        success=result.success,
        output=result.output,
        elapsed_ms=result.elapsed_ms,
        pre_snapshot_id=pre_snapshot_id,
    )


@router.post("/show", response_model=ShowResponse)
async def show_on_device(payload: ShowRequest, db: AsyncSession = Depends(get_db)):
    pod = await db.get(LabPod, payload.pod_id)
    if not pod:
        raise HTTPException(status_code=404, detail="Pod not found")
    return await run_show_commands(pod, payload.commands)
