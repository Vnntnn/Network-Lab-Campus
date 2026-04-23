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


def _rebuild_lab_pods_sqlite(sync_conn: Connection, columns: set[str]) -> None:
    has_owner_column = "owner_id" in columns
    owner_expr = f"COALESCE(NULLIF(owner_id, ''), '{DEFAULT_OWNER_ID}')" if has_owner_column else f"'{DEFAULT_OWNER_ID}'"
    connection_protocol_expr = "COALESCE(connection_protocol, 'telnet')" if "connection_protocol" in columns else "'telnet'"
    telnet_port_expr = "telnet_port" if "telnet_port" in columns else "NULL"
    detected_device_type_expr = "detected_device_type" if "detected_device_type" in columns else "NULL"
    auto_detected_expr = "COALESCE(auto_detected, 0)" if "auto_detected" in columns else "0"
    identity_id_expr = "identity_id" if "identity_id" in columns else "NULL"
    display_name_expr = "display_name" if "display_name" in columns else "NULL"

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
                connection_protocol VARCHAR(16) NOT NULL DEFAULT 'telnet',
                telnet_port INTEGER,
                detected_device_type VARCHAR(32),
                auto_detected BOOLEAN NOT NULL DEFAULT 0,
                identity_id INTEGER,
                display_name VARCHAR(64),
                description VARCHAR(256) DEFAULT '',
                CONSTRAINT uq_lab_pods_owner_pod_number UNIQUE (owner_id, pod_number)
            )
            """
        )
    )
    sync_conn.execute(
        text(
            f"""
            INSERT INTO lab_pods_new (
                id,
                owner_id,
                pod_number,
                pod_name,
                device_ip,
                device_type,
                ssh_username,
                ssh_password,
                connection_protocol,
                telnet_port,
                detected_device_type,
                auto_detected,
                identity_id,
                display_name,
                description
            )
            SELECT
                id,
                {owner_expr} AS owner_id,
                pod_number,
                pod_name,
                device_ip,
                COALESCE(device_type, 'arista_eos') AS device_type,
                ssh_username,
                ssh_password,
                {connection_protocol_expr} AS connection_protocol,
                {telnet_port_expr} AS telnet_port,
                {detected_device_type_expr} AS detected_device_type,
                {auto_detected_expr} AS auto_detected,
                {identity_id_expr} AS identity_id,
                {display_name_expr} AS display_name,
                COALESCE(description, '') AS description
            FROM lab_pods
            """
        )
    )
    sync_conn.execute(text("DROP TABLE lab_pods"))
    sync_conn.execute(text("ALTER TABLE lab_pods_new RENAME TO lab_pods"))
    sync_conn.execute(text("CREATE INDEX IF NOT EXISTS ix_lab_pods_id ON lab_pods (id)"))
    sync_conn.execute(text("CREATE INDEX IF NOT EXISTS ix_lab_pods_owner_id ON lab_pods (owner_id)"))


def _ensure_lab_pods_columns(sync_conn: Connection) -> None:
    inspector = inspect(sync_conn)
    if "lab_pods" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("lab_pods")}
    column_defs: dict[str, str] = {
        "connection_protocol": "VARCHAR(16) NOT NULL DEFAULT 'telnet'",
        "telnet_port": "INTEGER",
        "detected_device_type": "VARCHAR(32)",
        "auto_detected": "BOOLEAN NOT NULL DEFAULT 0",
        "identity_id": "INTEGER",
        "display_name": "VARCHAR(64)",
    }

    for column_name, ddl in column_defs.items():
        if column_name not in columns:
            sync_conn.execute(text(f"ALTER TABLE lab_pods ADD COLUMN {column_name} {ddl}"))

    sync_conn.execute(text("UPDATE lab_pods SET connection_protocol = 'telnet' WHERE connection_protocol IS NULL OR connection_protocol = ''"))
    sync_conn.execute(text("UPDATE lab_pods SET auto_detected = 0 WHERE auto_detected IS NULL"))


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
            _rebuild_lab_pods_sqlite(sync_conn, columns)
        _ensure_lab_pods_columns(sync_conn)
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
    _ensure_lab_pods_columns(sync_conn)


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_migrate_lab_pods_schema)
