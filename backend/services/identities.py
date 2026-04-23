from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import Select, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from models import CredentialIdentity


def _owner_stmt(actor_id: str) -> Select[tuple[CredentialIdentity]]:
    return select(CredentialIdentity).where(CredentialIdentity.owner_id == actor_id)


async def list_identities(db: AsyncSession, actor_id: str) -> list[CredentialIdentity]:
    result = await db.execute(
        _owner_stmt(actor_id).order_by(CredentialIdentity.is_default.desc(), CredentialIdentity.created_at.desc())
    )
    return result.scalars().all()


async def get_identity(db: AsyncSession, actor_id: str, identity_id: int) -> CredentialIdentity | None:
    result = await db.execute(
        _owner_stmt(actor_id).where(CredentialIdentity.id == identity_id)
    )
    return result.scalar_one_or_none()


async def get_default_identity(db: AsyncSession, actor_id: str) -> CredentialIdentity | None:
    result = await db.execute(
        _owner_stmt(actor_id).where(CredentialIdentity.is_default.is_(True)).limit(1)
    )
    return result.scalar_one_or_none()


async def unset_default_identity(db: AsyncSession, actor_id: str) -> None:
    await db.execute(
        update(CredentialIdentity)
        .where(CredentialIdentity.owner_id == actor_id)
        .values(is_default=False)
    )


async def mark_identity_default(db: AsyncSession, actor_id: str, identity_id: int) -> CredentialIdentity:
    identity = await get_identity(db, actor_id, identity_id)
    if not identity:
        raise HTTPException(status_code=404, detail="Identity not found")

    await unset_default_identity(db, actor_id)
    identity.is_default = True
    return identity


async def resolve_identity_credentials(
    db: AsyncSession,
    *,
    actor_id: str,
    identity_id: int | None,
    username: str | None,
    password: str | None,
) -> tuple[int | None, str | None, str | None, str | None]:
    """Return (identity_id, username, password, identity_name) using explicit or default identity fallback."""
    if identity_id is not None:
        identity = await get_identity(db, actor_id, identity_id)
        if not identity:
            raise HTTPException(status_code=404, detail="Identity not found")
        return identity.id, identity.username, identity.password, identity.name

    trimmed_user = (username or "").strip() or None
    trimmed_pass = (password or "").strip() or None

    if trimmed_user and trimmed_pass:
        return None, trimmed_user, trimmed_pass, None

    default_identity = await get_default_identity(db, actor_id)
    if default_identity is not None:
        return default_identity.id, default_identity.username, default_identity.password, default_identity.name

    return None, trimmed_user, trimmed_pass, None
