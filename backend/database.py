import asyncio
import os

from sqlalchemy import event
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./nexus_edu.db")

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


@event.listens_for(engine.sync_engine, "connect")
def _set_sqlite_pragmas(dbapi_connection, _connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.close()


DEFAULT_OWNER_ID = "default"


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session


async def init_db() -> None:
    from alembic.config import Config
    from alembic import command as alembic_command
    from sqlalchemy import text as sa_text

    # WAL mode before Alembic (file-level pragma)
    async with engine.connect() as raw:
        await raw.execute(sa_text("PRAGMA journal_mode=WAL"))
        await raw.commit()

    async with engine.connect() as raw:
        has_alembic = (await raw.execute(
            sa_text("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='alembic_version'")
        )).scalar() > 0
        has_existing = (await raw.execute(
            sa_text("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='lab_pods'")
        )).scalar() > 0

    cfg = Config(os.path.join(os.path.dirname(__file__), "alembic.ini"))
    cfg.set_main_option("sqlalchemy.url", DATABASE_URL.replace("+aiosqlite", ""))

    if not has_alembic and has_existing:
        # Database existed before Alembic — stamp without re-running migrations
        await asyncio.to_thread(alembic_command.stamp, cfg, "head")
    else:
        await asyncio.to_thread(alembic_command.upgrade, cfg, "head")

    async with engine.begin() as conn:
        from services.credentials import encrypt_existing_credentials
        await conn.run_sync(encrypt_existing_credentials)
