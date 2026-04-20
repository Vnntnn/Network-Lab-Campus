from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import LabPod
from schemas import LabPodCreate, LabPodRead, LabPodUpdate, PingResponse
from services.device_executor import run_show_commands

router = APIRouter(prefix="/pods", tags=["pods"])


@router.get("/", response_model=list[LabPodRead])
async def list_pods(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(LabPod).order_by(LabPod.pod_number))
    return result.scalars().all()


@router.get("/{pod_id}", response_model=LabPodRead)
async def get_pod(pod_id: int, db: AsyncSession = Depends(get_db)):
    pod = await db.get(LabPod, pod_id)
    if not pod:
        raise HTTPException(status_code=404, detail="Pod not found")
    return pod


@router.post("/", response_model=LabPodRead, status_code=201)
async def create_pod(payload: LabPodCreate, db: AsyncSession = Depends(get_db)):
    pod = LabPod(**payload.model_dump())
    db.add(pod)
    await db.commit()
    await db.refresh(pod)
    return pod


@router.put("/{pod_id}", response_model=LabPodRead)
async def update_pod(pod_id: int, payload: LabPodUpdate, db: AsyncSession = Depends(get_db)):
    pod = await db.get(LabPod, pod_id)
    if not pod:
        raise HTTPException(status_code=404, detail="Pod not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(pod, field, value)
    await db.commit()
    await db.refresh(pod)
    return pod


@router.delete("/{pod_id}", status_code=204)
async def delete_pod(pod_id: int, db: AsyncSession = Depends(get_db)):
    pod = await db.get(LabPod, pod_id)
    if not pod:
        raise HTTPException(status_code=404, detail="Pod not found")
    await db.delete(pod)
    await db.commit()


@router.get("/{pod_id}/ping", response_model=PingResponse)
async def ping_pod(pod_id: int, db: AsyncSession = Depends(get_db)):
    """SSH into the device and run 'show version' to verify reachability."""
    pod = await db.get(LabPod, pod_id)
    if not pod:
        raise HTTPException(status_code=404, detail="Pod not found")
    result = await run_show_commands(pod, ["show version"])
    version_line = ""
    if result.success and result.results:
        version_line = result.results[0]["output"].splitlines()[0] if result.results[0]["output"] else ""
    return PingResponse(
        reachable=result.success,
        version_line=version_line,
        elapsed_ms=result.elapsed_ms,
    )
