from types import SimpleNamespace

import pytest

import routers.commands as commands_router


def actor_headers(actor_id: str) -> dict[str, str]:
    return {"X-Actor-Id": actor_id}


def build_pod_payload(*, pod_number: int, pod_name: str, device_ip: str) -> dict:
    return {
        "pod_number": pod_number,
        "pod_name": pod_name,
        "device_ip": device_ip,
        "device_type": "arista_eos",
        "ssh_username": "admin",
        "ssh_password": "admin",
        "description": "pytest",
    }


@pytest.mark.asyncio
async def test_pod_owner_isolation_and_scoped_uniqueness(api_client):
    payload_a = build_pod_payload(pod_number=1, pod_name="alpha", device_ip="10.11.0.1")
    payload_b = build_pod_payload(pod_number=1, pod_name="beta", device_ip="10.11.0.2")

    create_a = await api_client.post("/api/v1/pods/", json=payload_a, headers=actor_headers("actor-a"))
    create_b = await api_client.post("/api/v1/pods/", json=payload_b, headers=actor_headers("actor-b"))

    assert create_a.status_code == 201, create_a.text
    assert create_b.status_code == 201, create_b.text

    pod_a = create_a.json()
    pod_b = create_b.json()

    duplicate_a = await api_client.post("/api/v1/pods/", json=payload_a, headers=actor_headers("actor-a"))
    assert duplicate_a.status_code == 409

    list_a = await api_client.get("/api/v1/pods/", headers=actor_headers("actor-a"))
    list_b = await api_client.get("/api/v1/pods/", headers=actor_headers("actor-b"))
    assert list_a.status_code == 200
    assert list_b.status_code == 200

    ids_a = {pod["id"] for pod in list_a.json()}
    ids_b = {pod["id"] for pod in list_b.json()}
    assert ids_a == {pod_a["id"]}
    assert ids_b == {pod_b["id"]}

    cross_get = await api_client.get(f"/api/v1/pods/{pod_b['id']}", headers=actor_headers("actor-a"))
    cross_update = await api_client.put(
        f"/api/v1/pods/{pod_b['id']}",
        json={"description": "forbidden"},
        headers=actor_headers("actor-a"),
    )
    cross_delete = await api_client.delete(f"/api/v1/pods/{pod_b['id']}", headers=actor_headers("actor-a"))

    assert cross_get.status_code == 404
    assert cross_update.status_code == 404
    assert cross_delete.status_code == 404


@pytest.mark.asyncio
async def test_device_history_is_scoped_per_actor(api_client, monkeypatch):
    async def fake_create_snapshot_record(*, db, pod_id: int, label: str = "manual", actor_id: str | None = None):
        return SimpleNamespace(id=1000 + pod_id)

    async def fake_push_commands(pod, commands: list[str]):
        return SimpleNamespace(
            success=True,
            output=f"{pod.pod_name}:{' | '.join(commands)}",
            elapsed_ms=12.5,
        )

    async def fake_broadcast(_payload):
        return None

    monkeypatch.setattr(commands_router, "create_snapshot_record", fake_create_snapshot_record)
    monkeypatch.setattr(commands_router, "push_commands", fake_push_commands)
    monkeypatch.setattr(commands_router, "broadcast", fake_broadcast)

    shared_device_ip = "10.22.22.22"

    create_a = await api_client.post(
        "/api/v1/pods/",
        json=build_pod_payload(pod_number=1, pod_name="actor-a-node", device_ip=shared_device_ip),
        headers=actor_headers("actor-a"),
    )
    create_b = await api_client.post(
        "/api/v1/pods/",
        json=build_pod_payload(pod_number=1, pod_name="actor-b-node", device_ip=shared_device_ip),
        headers=actor_headers("actor-b"),
    )
    assert create_a.status_code == 201, create_a.text
    assert create_b.status_code == 201, create_b.text

    pod_a = create_a.json()
    pod_b = create_b.json()

    push_a = await api_client.post(
        "/api/v1/commands/push",
        json={"pod_id": pod_a["id"], "commands": ["hostname ACTOR_A"]},
        headers=actor_headers("actor-a"),
    )
    push_b = await api_client.post(
        "/api/v1/commands/push",
        json={"pod_id": pod_b["id"], "commands": ["hostname ACTOR_B"]},
        headers=actor_headers("actor-b"),
    )

    assert push_a.status_code == 200, push_a.text
    assert push_b.status_code == 200, push_b.text
    assert push_a.json()["pre_snapshot_id"] == 1000 + pod_a["id"]
    assert push_b.json()["pre_snapshot_id"] == 1000 + pod_b["id"]

    history_as_actor_a = await api_client.get(
        f"/api/v1/commands/history/device/{shared_device_ip}",
        headers=actor_headers("actor-a"),
    )
    history_as_actor_b = await api_client.get(
        f"/api/v1/commands/history/device/{shared_device_ip}",
        headers=actor_headers("actor-b"),
    )

    assert history_as_actor_a.status_code == 200, history_as_actor_a.text
    assert history_as_actor_b.status_code == 200, history_as_actor_b.text

    entries_a = history_as_actor_a.json()
    entries_b = history_as_actor_b.json()

    assert len(entries_a) == 1
    assert entries_a[0]["actor_id"] == "actor-a"
    assert entries_a[0]["commands"] == ["hostname ACTOR_A"]
    assert entries_a[0]["device_key"] == shared_device_ip

    assert len(entries_b) == 1
    assert entries_b[0]["actor_id"] == "actor-b"
    assert entries_b[0]["commands"] == ["hostname ACTOR_B"]
    assert entries_b[0]["device_key"] == shared_device_ip

    limited = await api_client.get(
        f"/api/v1/commands/history/device/{shared_device_ip}?limit=1",
        headers=actor_headers("actor-a"),
    )
    assert limited.status_code == 200
    assert len(limited.json()) == 1
