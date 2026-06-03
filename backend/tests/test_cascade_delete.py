import pytest
from sqlalchemy import select

from database import AsyncSessionLocal
from models import LabPod, PodDisabledInterface, Snapshot


def actor_headers(actor_id: str) -> dict:
    return {"X-Actor-Id": actor_id}


def telnet_pod_payload(pod_number: int, pod_name: str, device_ip: str) -> dict:
    return {
        "pod_number": pod_number,
        "pod_name": pod_name,
        "device_ip": device_ip,
        "device_type": "arista_eos",
        "ssh_username": "",
        "ssh_password": "",
        "connection_protocol": "telnet",
        "description": "cascade-delete test",
    }


@pytest.mark.asyncio
async def test_delete_pod_cascades_snapshot_and_disabled_interface(api_client):
    actor = "cascade-actor"
    headers = actor_headers(actor)

    create_resp = await api_client.post(
        "/api/v1/pods/",
        json=telnet_pod_payload(42, "cascade-pod", "10.99.99.99"),
        headers=headers,
    )
    assert create_resp.status_code == 201, create_resp.text
    pod_id = create_resp.json()["id"]

    async with AsyncSessionLocal() as db:
        snap = Snapshot(pod_id=pod_id, label="pre-push", content="! running config")
        db.add(snap)
        iface = PodDisabledInterface(pod_id=pod_id, interface_name="Ethernet1")
        db.add(iface)
        await db.commit()
        snap_id = snap.id
        iface_id = iface.id

    delete_resp = await api_client.delete(f"/api/v1/pods/{pod_id}", headers=headers)
    assert delete_resp.status_code == 204, delete_resp.text

    async with AsyncSessionLocal() as db:
        remaining_snap = await db.execute(select(Snapshot).where(Snapshot.id == snap_id))
        assert remaining_snap.scalar_one_or_none() is None, "Snapshot should be deleted with pod"

        remaining_iface = await db.execute(
            select(PodDisabledInterface).where(PodDisabledInterface.id == iface_id)
        )
        assert remaining_iface.scalar_one_or_none() is None, "PodDisabledInterface should be deleted with pod"

        remaining_pod = await db.execute(select(LabPod).where(LabPod.id == pod_id))
        assert remaining_pod.scalar_one_or_none() is None, "Pod itself should be deleted"


@pytest.mark.asyncio
async def test_delete_pod_returns_404_for_wrong_owner(api_client):
    create_resp = await api_client.post(
        "/api/v1/pods/",
        json=telnet_pod_payload(43, "owned-pod", "10.100.100.1"),
        headers=actor_headers("real-owner"),
    )
    assert create_resp.status_code == 201, create_resp.text
    pod_id = create_resp.json()["id"]

    cross_delete = await api_client.delete(f"/api/v1/pods/{pod_id}", headers=actor_headers("other-actor"))
    assert cross_delete.status_code == 404
