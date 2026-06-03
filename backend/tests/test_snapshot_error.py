import pytest

from database import AsyncSessionLocal
from routers.snapshots import SnapshotCaptureError, create_snapshot_record


@pytest.mark.asyncio
async def test_create_snapshot_record_raises_for_nonexistent_pod():
    async with AsyncSessionLocal() as db:
        with pytest.raises(SnapshotCaptureError, match="Pod 999999 not found"):
            await create_snapshot_record(db=db, pod_id=999999, label="manual", actor_id=None)


@pytest.mark.asyncio
async def test_create_snapshot_record_raises_for_nonexistent_pod_with_actor():
    async with AsyncSessionLocal() as db:
        with pytest.raises(SnapshotCaptureError, match="Pod 888888 not found"):
            await create_snapshot_record(db=db, pod_id=888888, label="pre-push", actor_id="some-actor")
