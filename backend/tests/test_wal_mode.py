import pytest
from sqlalchemy import text

from database import AsyncSessionLocal


@pytest.mark.asyncio
async def test_wal_mode():
    async with AsyncSessionLocal() as db:
        result = await db.execute(text("PRAGMA journal_mode"))
        row = result.fetchone()
        assert row[0] == "wal"
