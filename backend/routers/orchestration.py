import asyncio
from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import LabPod
from routers.instructor import broadcast
from schemas import MultiPushRequest, MultiPushResult
from services.device_executor import push_commands

router = APIRouter(prefix="/orchestration", tags=["orchestration"])


@router.post("/multi-push", response_model=list[MultiPushResult])
async def multi_push(req: MultiPushRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(LabPod).where(LabPod.id.in_(req.pod_ids)))
    pods = result.scalars().all()

    async def push_one(pod: LabPod) -> MultiPushResult:
        await broadcast(
            {
                "type": "pod.lock",
                "pod_id": pod.id,
                "pod_name": pod.pod_name,
                "reason": "multi-push",
                "duration_ms": 60000,
                "ts": datetime.utcnow().isoformat(),
            }
        )

        try:
            response = await push_commands(pod, req.commands)
            await broadcast(
                {
                    "type": "push",
                    "pod_id": pod.id,
                    "pod_name": pod.pod_name,
                    "device_ip": pod.device_ip,
                    "success": response.success,
                    "elapsed_ms": response.elapsed_ms,
                    "command_count": len(req.commands),
                    "ts": datetime.utcnow().isoformat(),
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
            await broadcast(
                {
                    "type": "push",
                    "pod_id": pod.id,
                    "pod_name": pod.pod_name,
                    "device_ip": pod.device_ip,
                    "success": False,
                    "elapsed_ms": 0,
                    "command_count": len(req.commands),
                    "ts": datetime.utcnow().isoformat(),
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
                    "ts": datetime.utcnow().isoformat(),
                }
            )

    results = await asyncio.gather(*[push_one(pod) for pod in pods])
    return list(results)
