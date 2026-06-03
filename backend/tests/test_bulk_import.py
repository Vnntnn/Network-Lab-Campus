import pytest

from database import AsyncSessionLocal
from models import LabPod
from sqlalchemy import select


def actor_headers(actor_id: str) -> dict:
    return {"X-Actor-Id": actor_id}


def telnet_pod(pod_number: int, pod_name: str, device_ip: str) -> dict:
    return {
        "pod_number": pod_number,
        "pod_name": pod_name,
        "device_ip": device_ip,
        "device_type": "arista_eos",
        "connection_protocol": "telnet",
        "description": "",
    }


@pytest.mark.asyncio
async def test_bulk_import_three_valid_pods(api_client):
    payload = {
        "pods": [
            telnet_pod(1, "pod-a", "10.10.10.1"),
            telnet_pod(2, "pod-b", "10.10.10.2"),
            telnet_pod(3, "pod-c", "10.10.10.3"),
        ]
    }
    resp = await api_client.post(
        "/api/v1/pods/bulk",
        json=payload,
        headers=actor_headers("bulk-actor-valid"),
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["created"] == 3
    assert data["failed"] == 0
    assert data["errors"] == []


@pytest.mark.asyncio
async def test_bulk_import_duplicate_pod_number_yields_failed(api_client):
    actor = "bulk-actor-dup"
    payload_first = {
        "pods": [
            telnet_pod(10, "pod-first", "10.20.20.1"),
        ]
    }
    r1 = await api_client.post(
        "/api/v1/pods/bulk",
        json=payload_first,
        headers=actor_headers(actor),
    )
    assert r1.status_code == 200, r1.text
    assert r1.json()["created"] == 1

    payload_dup = {
        "pods": [
            telnet_pod(11, "pod-ok", "10.20.20.2"),
            telnet_pod(10, "pod-dup", "10.20.20.3"),
        ]
    }
    r2 = await api_client.post(
        "/api/v1/pods/bulk",
        json=payload_dup,
        headers=actor_headers(actor),
    )
    assert r2.status_code == 200, r2.text
    data = r2.json()
    assert data["created"] == 1
    assert data["failed"] == 1
    assert len(data["errors"]) == 1


@pytest.mark.asyncio
async def test_bulk_import_bad_ip_returns_422(api_client):
    payload = {
        "pods": [
            {
                "pod_number": 1,
                "pod_name": "bad-ip-pod",
                "device_ip": "not-an-ip",
                "device_type": "arista_eos",
                "connection_protocol": "telnet",
            }
        ]
    }
    resp = await api_client.post(
        "/api/v1/pods/bulk",
        json=payload,
        headers=actor_headers("bulk-actor-bad-ip"),
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_bulk_imported_pods_appear_in_list(api_client):
    actor = "bulk-actor-list"
    payload = {
        "pods": [
            telnet_pod(5, "pod-list-a", "192.168.5.1"),
            telnet_pod(6, "pod-list-b", "192.168.5.2"),
        ]
    }
    r = await api_client.post(
        "/api/v1/pods/bulk",
        json=payload,
        headers=actor_headers(actor),
    )
    assert r.status_code == 200, r.text
    assert r.json()["created"] == 2

    list_resp = await api_client.get("/api/v1/pods/", headers=actor_headers(actor))
    assert list_resp.status_code == 200, list_resp.text
    pods = list_resp.json()
    pod_names = {p["pod_name"] for p in pods}
    assert "pod-list-a" in pod_names
    assert "pod-list-b" in pod_names
