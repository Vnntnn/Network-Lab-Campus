from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import AsyncSessionLocal, get_db
from deps import get_actor_id
from models import LabPod, Snapshot
from schemas import SnapshotRead
from services.device_executor import push_commands, run_show_commands
from services.ownership import get_owned_pod, get_owned_snapshot

router = APIRouter(prefix="/snapshots", tags=["snapshots"])


def _extract_running_config(show_result) -> str:
    if not show_result or not show_result.results:
        return ""
    first = show_result.results[0] if show_result.results else {}
    output = first.get("output") if isinstance(first, dict) else ""
    return output if isinstance(output, str) else ""


async def create_snapshot_record(
    db: AsyncSession,
    pod_id: int,
    label: str = "manual",
    actor_id: str | None = None,
) -> Snapshot:
    pod = await get_owned_pod(db, pod_id, actor_id) if actor_id else await db.get(LabPod, pod_id)
    if not pod:
        raise HTTPException(status_code=404, detail="Pod not found")

    show_result = await run_show_commands(pod, ["show running-config"])
    content = _extract_running_config(show_result)

    snap = Snapshot(pod_id=pod_id, label=label, content=content)
    db.add(snap)
    await db.commit()
    await db.refresh(snap)
    return snap


async def capture_snapshot_background(
    pod_id: int,
    label: str = "pre-push",
    actor_id: str | None = None,
) -> None:
    async with AsyncSessionLocal() as db:
        try:
            await create_snapshot_record(db=db, pod_id=pod_id, label=label, actor_id=actor_id)
        except Exception:
            await db.rollback()


@router.get("/pod/{pod_id}", response_model=list[SnapshotRead])
async def list_snapshots(
    pod_id: int,
    db: AsyncSession = Depends(get_db),
    actor_id: str = Depends(get_actor_id),
):
    pod = await get_owned_pod(db, pod_id, actor_id)
    if not pod:
        raise HTTPException(status_code=404, detail="Pod not found")

    result = await db.execute(
        select(Snapshot)
        .where(Snapshot.pod_id == pod_id)
        .order_by(Snapshot.created_at.desc())
        .limit(50)
    )
    return result.scalars().all()


@router.post("/capture/{pod_id}", response_model=SnapshotRead)
async def capture_snapshot(
    pod_id: int,
    label: str = "manual",
    db: AsyncSession = Depends(get_db),
    actor_id: str = Depends(get_actor_id),
):
    return await create_snapshot_record(db=db, pod_id=pod_id, label=label, actor_id=actor_id)


@router.post("/{snap_id}/rollback")
async def rollback_snapshot(
    snap_id: int,
    db: AsyncSession = Depends(get_db),
    actor_id: str = Depends(get_actor_id),
):
    snap = await get_owned_snapshot(db, snap_id, actor_id)
    if not snap:
        raise HTTPException(status_code=404, detail="Snapshot not found")

    pod = await get_owned_pod(db, snap.pod_id, actor_id)
    if not pod:
        raise HTTPException(status_code=404, detail="Pod not found")

    commands = [line for line in snap.content.splitlines() if line.strip() and not line.lstrip().startswith("!")]
    if not commands:
        return {"success": False, "elapsed_ms": 0, "message": "Snapshot has no rollback commands"}

    result = await push_commands(pod, commands)
    return {"success": result.success, "elapsed_ms": result.elapsed_ms}


@router.delete("/{snap_id}", status_code=204)
async def delete_snapshot(
    snap_id: int,
    db: AsyncSession = Depends(get_db),
    actor_id: str = Depends(get_actor_id),
):
    snap = await get_owned_snapshot(db, snap_id, actor_id)
    if not snap:
        raise HTTPException(status_code=404, detail="Snapshot not found")

    await db.execute(delete(Snapshot).where(Snapshot.id == snap.id))
    await db.commit()
