import pytest

from database import AsyncSessionLocal
from models import LabPod
from sqlalchemy import select


def actor_headers(actor_id: str) -> dict:
    return {"X-Actor-Id": actor_id}


def telnet_pod_payload(pod_number: int, pod_name: str, device_ip: str) -> dict:
    return {
        "pod_number": pod_number,
        "pod_name": pod_name,
        "device_ip": device_ip,
        "device_type": "arista_eos",
        "connection_protocol": "telnet",
        "description": "",
    }


@pytest.mark.asyncio
async def test_new_pod_last_seen_at_is_none(api_client):
    resp = await api_client.post(
        "/api/v1/pods/",
        json=telnet_pod_payload(7, "lastseen-pod", "10.77.77.77"),
        headers=actor_headers("lastseen-actor"),
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert "last_seen_at" in data
    assert data["last_seen_at"] is None


@pytest.mark.asyncio
async def test_lab_pod_read_includes_last_seen_at_field(api_client):
    actor = "lastseen-actor-2"
    create_resp = await api_client.post(
        "/api/v1/pods/",
        json=telnet_pod_payload(8, "lastseen-pod-2", "10.78.78.78"),
        headers=actor_headers(actor),
    )
    assert create_resp.status_code == 201, create_resp.text
    pod_id = create_resp.json()["id"]

    get_resp = await api_client.get(f"/api/v1/pods/{pod_id}", headers=actor_headers(actor))
    assert get_resp.status_code == 200, get_resp.text
    pod_data = get_resp.json()
    assert "last_seen_at" in pod_data
    assert pod_data["last_seen_at"] is None


@pytest.mark.asyncio
async def test_last_seen_at_in_db_model_is_none_initially():
    actor = "lastseen-db-actor"
    async with AsyncSessionLocal() as db:
        pod = LabPod(
            owner_id=actor,
            pod_number=99,
            pod_name="db-direct-pod",
            device_ip="10.99.88.77",
            device_type="arista_eos",
            ssh_username="",
            ssh_password="",
            connection_protocol="telnet",
            description="",
        )
        db.add(pod)
        await db.commit()
        await db.refresh(pod)
        pod_id = pod.id

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(LabPod).where(LabPod.id == pod_id))
        fetched = result.scalar_one_or_none()
        assert fetched is not None
        assert fetched.last_seen_at is None
