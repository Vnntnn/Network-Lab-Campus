from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from deps import get_actor_id
from models import CredentialIdentity, LabPod
from schemas import IdentityCreate, IdentityRead, IdentityUpdate
from services.identities import (
    get_identity,
    list_identities,
    mark_identity_default,
    unset_default_identity,
)

router = APIRouter(prefix="/identities", tags=["identities"])


@router.get("/", response_model=list[IdentityRead])
async def get_identities(
    db: AsyncSession = Depends(get_db),
    actor_id: str = Depends(get_actor_id),
):
    return await list_identities(db, actor_id)


@router.post("/", response_model=IdentityRead, status_code=201)
async def create_identity(
    payload: IdentityCreate,
    db: AsyncSession = Depends(get_db),
    actor_id: str = Depends(get_actor_id),
):
    should_be_default = payload.is_default
    if not should_be_default:
        total_result = await db.execute(
            select(func.count(CredentialIdentity.id)).where(CredentialIdentity.owner_id == actor_id)
        )
        should_be_default = (total_result.scalar_one() or 0) == 0

    if should_be_default:
        await unset_default_identity(db, actor_id)

    identity = CredentialIdentity(
        owner_id=actor_id,
        name=payload.name,
        username=payload.username,
        password=payload.password,
        is_default=should_be_default,
    )
    db.add(identity)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Identity name already exists")

    await db.refresh(identity)
    return identity


@router.patch("/{identity_id}", response_model=IdentityRead)
async def update_identity(
    identity_id: int,
    payload: IdentityUpdate,
    db: AsyncSession = Depends(get_db),
    actor_id: str = Depends(get_actor_id),
):
    identity = await get_identity(db, actor_id, identity_id)
    if not identity:
        raise HTTPException(status_code=404, detail="Identity not found")

    updates = payload.model_dump(exclude_unset=True)
    set_default = updates.pop("is_default", None)

    for field, value in updates.items():
        setattr(identity, field, value)

    if set_default is True:
        await mark_identity_default(db, actor_id, identity_id)
    elif set_default is False and identity.is_default:
        identity.is_default = False

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Identity name already exists")

    await db.refresh(identity)
    return identity


@router.post("/{identity_id}/default", response_model=IdentityRead)
async def set_default_identity(
    identity_id: int,
    db: AsyncSession = Depends(get_db),
    actor_id: str = Depends(get_actor_id),
):
    identity = await mark_identity_default(db, actor_id, identity_id)
    await db.commit()
    await db.refresh(identity)
    return identity


@router.delete("/{identity_id}", status_code=204)
async def delete_identity(
    identity_id: int,
    db: AsyncSession = Depends(get_db),
    actor_id: str = Depends(get_actor_id),
):
    identity = await get_identity(db, actor_id, identity_id)
    if not identity:
        raise HTTPException(status_code=404, detail="Identity not found")

    usage_result = await db.execute(
        select(func.count(LabPod.id)).where(
            LabPod.owner_id == actor_id,
            LabPod.identity_id == identity_id,
        )
    )
    usage_count = usage_result.scalar_one() or 0
    if usage_count > 0:
        raise HTTPException(
            status_code=409,
            detail="Identity is assigned to one or more pods. Reassign pods before deleting.",
        )

    await db.delete(identity)
    await db.commit()
    return Response(status_code=204)
