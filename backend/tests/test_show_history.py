"""
Tests for POST /commands/show — verifies the endpoint returns a response
even when the device is unreachable, and that history recording does not
crash the endpoint.
"""
import pytest


def actor_headers(actor_id: str) -> dict:
    return {"X-Actor-Id": actor_id}


@pytest.mark.asyncio
async def test_show_returns_response_for_unreachable_device(api_client):
    # Create a telnet pod pointing at a loopback port that is not listening.
    # Telnet ECONNREFUSED fails fast (no timeout hang).
    create_resp = await api_client.post(
        "/api/v1/pods/",
        json={
            "pod_number": 1,
            "pod_name": "unreachable-show-pod",
            "device_ip": "127.0.0.1",
            "device_type": "arista_eos",
            "connection_protocol": "telnet",
            "telnet_port": 19999,
            "description": "",
        },
        headers=actor_headers("show-hist-actor"),
    )
    assert create_resp.status_code == 201, create_resp.text
    pod_id = create_resp.json()["id"]

    show_resp = await api_client.post(
        "/api/v1/commands/show",
        json={"pod_id": pod_id, "commands": ["show version"]},
        headers=actor_headers("show-hist-actor"),
    )
    # The endpoint must return 200 regardless of device reachability.
    assert show_resp.status_code == 200, show_resp.text
    data = show_resp.json()
    assert "success" in data
    assert "results" in data
    assert "elapsed_ms" in data
    assert isinstance(data["success"], bool)


@pytest.mark.asyncio
async def test_show_returns_404_for_nonexistent_pod(api_client):
    show_resp = await api_client.post(
        "/api/v1/commands/show",
        json={"pod_id": 999999, "commands": ["show version"]},
        headers=actor_headers("show-hist-actor-2"),
    )
    assert show_resp.status_code == 404


@pytest.mark.asyncio
async def test_show_returns_404_for_wrong_owner(api_client):
    create_resp = await api_client.post(
        "/api/v1/pods/",
        json={
            "pod_number": 2,
            "pod_name": "owner-isolation-show-pod",
            "device_ip": "10.55.66.77",
            "device_type": "arista_eos",
            "connection_protocol": "telnet",
            "description": "",
        },
        headers=actor_headers("show-owner-actor"),
    )
    assert create_resp.status_code == 201, create_resp.text
    pod_id = create_resp.json()["id"]

    cross_resp = await api_client.post(
        "/api/v1/commands/show",
        json={"pod_id": pod_id, "commands": ["show version"]},
        headers=actor_headers("different-actor"),
    )
    assert cross_resp.status_code == 404
