import os
from pathlib import Path

import httpx
import pytest_asyncio
from sqlalchemy import delete

TEST_DB_FILE = Path(__file__).resolve().parent / "pytest_ncmp.db"
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{TEST_DB_FILE.resolve().as_posix()}"

from database import AsyncSessionLocal, engine, init_db  # noqa: E402
from main import app  # noqa: E402
from models import DeviceCommandHistory, LabPod, Snapshot  # noqa: E402


@pytest_asyncio.fixture(scope="session", autouse=True)
async def init_test_database():
    if TEST_DB_FILE.exists():
        TEST_DB_FILE.unlink()

    await init_db()
    yield

    await engine.dispose()
    if TEST_DB_FILE.exists():
        TEST_DB_FILE.unlink()


@pytest_asyncio.fixture(autouse=True)
async def clean_database_tables():
    async with AsyncSessionLocal() as db:
        await db.execute(delete(DeviceCommandHistory))
        await db.execute(delete(Snapshot))
        await db.execute(delete(LabPod))
        await db.commit()


@pytest_asyncio.fixture
async def api_client():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client
