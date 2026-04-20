from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import LabPod, Snapshot


async def get_owned_pod(db: AsyncSession, pod_id: int, actor_id: str) -> LabPod | None:
    result = await db.execute(
        select(LabPod).where(
            LabPod.id == pod_id,
            LabPod.owner_id == actor_id,
        )
    )
    return result.scalar_one_or_none()


async def get_owned_snapshot(db: AsyncSession, snap_id: int, actor_id: str) -> Snapshot | None:
    result = await db.execute(
        select(Snapshot)
        .join(LabPod, Snapshot.pod_id == LabPod.id)
        .where(
            Snapshot.id == snap_id,
            LabPod.owner_id == actor_id,
        )
    )
    return result.scalar_one_or_none()
