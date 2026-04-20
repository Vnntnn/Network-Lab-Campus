import os

from sqlalchemy import inspect, text
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./nexus_edu.db")

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)
DEFAULT_OWNER_ID = "default"


class Base(DeclarativeBase):
    pass


def _has_owner_scoped_unique(inspector) -> bool:
    for constraint in inspector.get_unique_constraints("lab_pods"):
        columns = constraint.get("column_names") or []
        if set(columns) == {"owner_id", "pod_number"}:
            return True
    return False


def _legacy_unique_names(inspector) -> list[str]:
    names: list[str] = []
    for constraint in inspector.get_unique_constraints("lab_pods"):
        columns = constraint.get("column_names") or []
        name = constraint.get("name")
        if columns == ["pod_number"] and name:
            names.append(name)
    return names


def _rebuild_lab_pods_sqlite(sync_conn: Connection, has_owner_column: bool) -> None:
    owner_expr = f"COALESCE(NULLIF(owner_id, ''), '{DEFAULT_OWNER_ID}')" if has_owner_column else f"'{DEFAULT_OWNER_ID}'"
    sync_conn.execute(
        text(
            """
            CREATE TABLE lab_pods_new (
                id INTEGER PRIMARY KEY,
                owner_id VARCHAR(64) NOT NULL,
                pod_number INTEGER NOT NULL,
                pod_name VARCHAR(64) NOT NULL,
                device_ip VARCHAR(45) NOT NULL,
                device_type VARCHAR(32) NOT NULL DEFAULT 'arista_eos',
                ssh_username VARCHAR(64) NOT NULL,
                ssh_password VARCHAR(128) NOT NULL,
                description VARCHAR(256) DEFAULT '',
                CONSTRAINT uq_lab_pods_owner_pod_number UNIQUE (owner_id, pod_number)
            )
            """
        )
    )
    sync_conn.execute(
        text(
            f"""
            INSERT INTO lab_pods_new (id, owner_id, pod_number, pod_name, device_ip, device_type, ssh_username, ssh_password, description)
            SELECT
                id,
                {owner_expr} AS owner_id,
                pod_number,
                pod_name,
                device_ip,
                COALESCE(device_type, 'arista_eos') AS device_type,
                ssh_username,
                ssh_password,
                COALESCE(description, '') AS description
            FROM lab_pods
            """
        )
    )
    sync_conn.execute(text("DROP TABLE lab_pods"))
    sync_conn.execute(text("ALTER TABLE lab_pods_new RENAME TO lab_pods"))
    sync_conn.execute(text("CREATE INDEX IF NOT EXISTS ix_lab_pods_id ON lab_pods (id)"))
    sync_conn.execute(text("CREATE INDEX IF NOT EXISTS ix_lab_pods_owner_id ON lab_pods (owner_id)"))


def _migrate_lab_pods_schema(sync_conn: Connection) -> None:
    inspector = inspect(sync_conn)
    if "lab_pods" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("lab_pods")}
    has_owner_column = "owner_id" in columns
    has_owner_unique = _has_owner_scoped_unique(inspector)
    legacy_unique_names = _legacy_unique_names(inspector)

    if sync_conn.dialect.name == "sqlite":
        if (not has_owner_column) or (not has_owner_unique) or bool(legacy_unique_names):
            _rebuild_lab_pods_sqlite(sync_conn, has_owner_column)
        return

    if not has_owner_column:
        sync_conn.execute(text(f"ALTER TABLE lab_pods ADD COLUMN owner_id VARCHAR(64) DEFAULT '{DEFAULT_OWNER_ID}'"))
        sync_conn.execute(text(f"UPDATE lab_pods SET owner_id = '{DEFAULT_OWNER_ID}' WHERE owner_id IS NULL OR owner_id = ''"))
        sync_conn.execute(text("ALTER TABLE lab_pods ALTER COLUMN owner_id SET NOT NULL"))

    for constraint_name in legacy_unique_names:
        escaped_name = constraint_name.replace('"', '""')
        sync_conn.execute(text(f'ALTER TABLE lab_pods DROP CONSTRAINT IF EXISTS "{escaped_name}"'))

    inspector = inspect(sync_conn)
    if not _has_owner_scoped_unique(inspector):
        sync_conn.execute(
            text(
                "ALTER TABLE lab_pods "
                "ADD CONSTRAINT uq_lab_pods_owner_pod_number UNIQUE (owner_id, pod_number)"
            )
        )

    sync_conn.execute(text("CREATE INDEX IF NOT EXISTS ix_lab_pods_owner_id ON lab_pods (owner_id)"))


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_migrate_lab_pods_schema)
