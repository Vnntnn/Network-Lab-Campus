from contextlib import asynccontextmanager
from contextlib import suppress
import asyncio
import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import AsyncSessionLocal, init_db
from routers import pods, commands, identities, instructor, snapshots, orchestration, topology
from services.topology_discovery import sync_known_pod_hostnames


logger = logging.getLogger(__name__)


def _resolve_hostname_monitor_interval() -> int:
    raw = os.getenv("HOSTNAME_MONITOR_INTERVAL_SEC", "2").strip()
    try:
        value = int(raw)
    except ValueError:
        return 15
    return max(0, value)


async def _hostname_monitor_loop(interval_sec: int) -> None:
    while True:
        updated_ids: list[int] = []
        try:
            async with AsyncSessionLocal() as db:
                updated_ids = await sync_known_pod_hostnames(db)
        except Exception:
            logger.exception("Hostname monitor iteration failed")

        if updated_ids:
            try:
                await topology.broadcast(
                    {
                        "type": "hostname.sync",
                        "updated_count": len(updated_ids),
                    }
                )
            except Exception:
                logger.exception("Hostname sync broadcast failed")

        await asyncio.sleep(interval_sec)


@asynccontextmanager
async def lifespan(app: FastAPI):
    hostname_monitor_task: asyncio.Task | None = None
    await init_db()

    monitor_interval = _resolve_hostname_monitor_interval()
    if monitor_interval > 0:
        hostname_monitor_task = asyncio.create_task(_hostname_monitor_loop(monitor_interval))

    try:
        yield
    finally:
        if hostname_monitor_task is not None:
            hostname_monitor_task.cancel()
            with suppress(asyncio.CancelledError):
                await hostname_monitor_task


app = FastAPI(
    title="Nexus Edu API",
    description="Real-device network configuration bridge for lab pods",
    version="0.1.0",
    lifespan=lifespan,
)


def resolve_cors_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS", "").strip()
    if not raw:
        return ["http://localhost:5173", "http://127.0.0.1:5173"]

    origins = [origin.strip() for origin in raw.split(",") if origin.strip()]
    return origins or ["http://localhost:5173", "http://127.0.0.1:5173"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=resolve_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(pods.router, prefix="/api/v1")
app.include_router(commands.router, prefix="/api/v1")
app.include_router(identities.router, prefix="/api/v1")
app.include_router(instructor.router)
app.include_router(snapshots.router, prefix="/api/v1")
app.include_router(orchestration.router, prefix="/api/v1")
app.include_router(topology.router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "nexus-edu-api"}
