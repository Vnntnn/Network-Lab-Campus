import pytest

from database import AsyncSessionLocal
from services.device_history import append_device_history, fetch_device_history

DEVICE_KEY = "10.55.55.55"


@pytest.mark.asyncio
async def test_fetch_history_filtered_by_actor_id():
    await append_device_history(
        actor_id="user1",
        device_key=DEVICE_KEY,
        pod_id=1,
        pod_name="pod-user1",
        commands=["show version"],
        success=True,
        output="user1 output",
        elapsed_ms=10.0,
    )
    await append_device_history(
        actor_id="user2",
        device_key=DEVICE_KEY,
        pod_id=2,
        pod_name="pod-user2",
        commands=["show ip int brief"],
        success=True,
        output="user2 output",
        elapsed_ms=15.0,
    )

    async with AsyncSessionLocal() as db:
        user1_rows = await fetch_device_history(db, DEVICE_KEY, actor_id="user1")
        user2_rows = await fetch_device_history(db, DEVICE_KEY, actor_id="user2")
        all_rows = await fetch_device_history(db, DEVICE_KEY, actor_id=None)

    assert len(user1_rows) == 1
    assert user1_rows[0].actor_id == "user1"

    assert len(user2_rows) == 1
    assert user2_rows[0].actor_id == "user2"

    assert len(all_rows) == 2
    actor_ids = {row.actor_id for row in all_rows}
    assert actor_ids == {"user1", "user2"}


@pytest.mark.asyncio
async def test_fetch_history_actor_id_none_returns_all():
    await append_device_history(
        actor_id="actorX",
        device_key=DEVICE_KEY,
        pod_id=10,
        pod_name="pod-x",
        commands=["hostname X"],
        success=True,
        output="",
        elapsed_ms=5.0,
    )
    await append_device_history(
        actor_id="actorY",
        device_key=DEVICE_KEY,
        pod_id=11,
        pod_name="pod-y",
        commands=["hostname Y"],
        success=False,
        output="error",
        elapsed_ms=8.0,
    )

    async with AsyncSessionLocal() as db:
        rows = await fetch_device_history(db, DEVICE_KEY, actor_id=None)

    assert len(rows) >= 2
    actor_ids_in_result = {r.actor_id for r in rows}
    assert "actorX" in actor_ids_in_result
    assert "actorY" in actor_ids_in_result
