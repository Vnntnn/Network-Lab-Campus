import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from deps import get_actor_id
from models import LabPod
from routers.instructor import broadcast
from schemas import MultiPushRequest, MultiPushResult
from services.device_history import append_device_history
from services.device_executor import push_commands

router = APIRouter(prefix="/orchestration", tags=["orchestration"])


@router.post("/multi-push", response_model=list[MultiPushResult])
async def multi_push(
    req: MultiPushRequest,
    db: AsyncSession = Depends(get_db),
    actor_id: str = Depends(get_actor_id),
):
    result = await db.execute(
        select(LabPod).where(
            LabPod.id.in_(req.pod_ids),
            LabPod.owner_id == actor_id,
        )
    )
    pods = result.scalars().all()

    async def push_one(pod: LabPod) -> MultiPushResult:
        await broadcast(
            {
                "type": "pod.lock",
                "pod_id": pod.id,
                "pod_name": pod.pod_name,
                "reason": "multi-push",
                "duration_ms": 60000,
                "ts": datetime.now(timezone.utc).isoformat(),
            }
        )

        try:
            response = await push_commands(pod, req.commands)
            try:
                await append_device_history(
                    actor_id=actor_id,
                    device_key=pod.device_ip,
                    pod_id=pod.id,
                    pod_name=pod.pod_name,
                    commands=req.commands,
                    success=response.success,
                    output=response.output,
                    elapsed_ms=response.elapsed_ms,
                    pre_snapshot_id=None,
                )
            except Exception:
                pass

            await broadcast(
                {
                    "type": "push",
                    "pod_id": pod.id,
                    "pod_name": pod.pod_name,
                    "device_ip": pod.device_ip,
                    "success": response.success,
                    "elapsed_ms": response.elapsed_ms,
                    "command_count": len(req.commands),
                    "ts": datetime.now(timezone.utc).isoformat(),
                }
            )
            return MultiPushResult(
                pod_id=pod.id,
                pod_name=pod.pod_name,
                success=response.success,
                elapsed_ms=response.elapsed_ms,
                output=response.output,
            )
        except Exception as exc:
            try:
                await append_device_history(
                    actor_id=actor_id,
                    device_key=pod.device_ip,
                    pod_id=pod.id,
                    pod_name=pod.pod_name,
                    commands=req.commands,
                    success=False,
                    output="",
                    elapsed_ms=0,
                    pre_snapshot_id=None,
                )
            except Exception:
                pass

            await broadcast(
                {
                    "type": "push",
                    "pod_id": pod.id,
                    "pod_name": pod.pod_name,
                    "device_ip": pod.device_ip,
                    "success": False,
                    "elapsed_ms": 0,
                    "command_count": len(req.commands),
                    "ts": datetime.now(timezone.utc).isoformat(),
                }
            )
            return MultiPushResult(
                pod_id=pod.id,
                pod_name=pod.pod_name,
                success=False,
                elapsed_ms=0,
                output="",
                error=str(exc),
            )
        finally:
            await broadcast(
                {
                    "type": "pod.unlock",
                    "pod_id": pod.id,
                    "pod_name": pod.pod_name,
                    "reason": "multi-push-complete",
                    "ts": datetime.now(timezone.utc).isoformat(),
                }
            )

    results = await asyncio.gather(*[push_one(pod) for pod in pods])
    return list(results)
