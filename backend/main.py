from contextlib import asynccontextmanager
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import init_db
from routers import pods, commands, instructor, snapshots, orchestration, topology


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


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
app.include_router(instructor.router)
app.include_router(snapshots.router, prefix="/api/v1")
app.include_router(orchestration.router, prefix="/api/v1")
app.include_router(topology.router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "nexus-edu-api"}
