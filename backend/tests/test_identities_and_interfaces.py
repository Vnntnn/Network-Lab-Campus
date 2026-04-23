from datetime import datetime, timezone

import pytest

import services.interface_governance as interface_governance
from schemas import (
    TopologyDeviceRead,
    TopologyDiscoveryResponse,
    TopologyEdgeDataRead,
    TopologyEdgeRead,
    TopologyNodeDataRead,
    TopologyNodeDiscoveryRead,
    TopologyNodeRead,
    TopologyPoint,
)


def actor_headers(actor_id: str) -> dict[str, str]:
    return {"X-Actor-Id": actor_id}


@pytest.mark.asyncio
async def test_identity_can_be_assigned_to_ssh_pod(api_client):
    actor = actor_headers("identity-owner")

    identity_response = await api_client.post(
        "/api/v1/identities/",
        json={
            "name": "lab-default",
            "username": "netadmin",
            "password": "secret",
            "is_default": True,
        },
        headers=actor,
    )
    assert identity_response.status_code == 201, identity_response.text
    identity = identity_response.json()

    pod_response = await api_client.post(
        "/api/v1/pods/",
        json={
            "pod_number": 7,
            "pod_name": "edge-7",
            "device_ip": "10.88.0.7",
            "device_type": "cisco_iosxe",
            "connection_protocol": "ssh",
            "identity_id": identity["id"],
            "description": "identity backed",
        },
        headers=actor,
    )
    assert pod_response.status_code == 201, pod_response.text
    pod = pod_response.json()

    assert pod["identity_id"] == identity["id"]
    assert pod["identity_name"] == "lab-default"
    assert pod["ssh_username"] == "netadmin"
    assert pod["ssh_password"] == "secret"


@pytest.mark.asyncio
async def test_default_identity_fallback_on_ssh_pod(api_client):
    actor = actor_headers("identity-default")

    create_identity = await api_client.post(
        "/api/v1/identities/",
        json={
            "name": "fallback",
            "username": "auto-user",
            "password": "auto-pass",
            "is_default": True,
        },
        headers=actor,
    )
    assert create_identity.status_code == 201, create_identity.text
    identity = create_identity.json()

    pod_response = await api_client.post(
        "/api/v1/pods/",
        json={
            "pod_number": 8,
            "pod_name": "edge-8",
            "device_ip": "10.88.0.8",
            "device_type": "cisco_iosxe",
            "connection_protocol": "ssh",
            "description": "default identity fallback",
        },
        headers=actor,
    )
    assert pod_response.status_code == 201, pod_response.text
    pod = pod_response.json()

    assert pod["identity_id"] == identity["id"]
    assert pod["identity_name"] == identity["name"]
    assert pod["ssh_username"] == identity["username"]
    assert pod["ssh_password"] == identity["password"]


@pytest.mark.asyncio
async def test_interface_governance_blocks_connected_disable(api_client, monkeypatch):
    actor = actor_headers("interface-owner")

    create_pod = await api_client.post(
        "/api/v1/pods/",
        json={
            "pod_number": 11,
            "pod_name": "dist-11",
            "device_ip": "10.99.0.11",
            "device_type": "cisco_iosxe",
            "connection_protocol": "telnet",
            "description": "governance test",
        },
        headers=actor,
    )
    assert create_pod.status_code == 201, create_pod.text
    pod = create_pod.json()

    async def fake_discover_topology(db, pod_id: int, max_hops: int = 1, owner_id: str | None = None):
        seed_node = TopologyNodeRead(
            id=f"pod-{pod_id}",
            type="device",
            position=TopologyPoint(x=420, y=290),
            data=TopologyNodeDataRead(
                pod=TopologyDeviceRead(
                    id=pod_id,
                    pod_number=11,
                    pod_name="dist-11",
                    device_ip="10.99.0.11",
                    device_type="cisco_iosxe",
                    ssh_username="",
                    ssh_password="",
                    description="",
                    is_external=False,
                    is_seed=True,
                    badge_label="seed",
                    matched_pod_id=pod_id,
                ),
                connectionCount=1,
                connectedPeers=["edge-ext"],
                inlineConfig=True,
                badgeLabel="seed",
                discovery=TopologyNodeDiscoveryRead(
                    is_external=False,
                    is_seed=True,
                    protocols=["lldp"],
                    local_interfaces=["Ethernet1", "Ethernet2"],
                    remote_interfaces=["Ethernet10"],
                    source_commands=["show lldp neighbors detail"],
                    matched_pod_id=pod_id,
                ),
            ),
        )
        external_node = TopologyNodeRead(
            id="external-1",
            type="device",
            position=TopologyPoint(x=640, y=290),
            data=TopologyNodeDataRead(
                pod=TopologyDeviceRead(
                    id=-1,
                    pod_number=None,
                    pod_name="edge-ext",
                    device_ip="",
                    device_type="unknown",
                    ssh_username="",
                    ssh_password="",
                    description="",
                    is_external=True,
                    is_seed=False,
                    badge_label="LLDP",
                    matched_pod_id=None,
                ),
                connectionCount=1,
                connectedPeers=["dist-11"],
                inlineConfig=False,
                badgeLabel="LLDP",
                discovery=TopologyNodeDiscoveryRead(
                    is_external=True,
                    is_seed=False,
                    protocols=["lldp"],
                    local_interfaces=["Ethernet10"],
                    remote_interfaces=["Ethernet1"],
                    source_commands=["show lldp neighbors detail"],
                    matched_pod_id=None,
                ),
            ),
        )
        edge = TopologyEdgeRead(
            id="pod-11::external-1",
            source=f"pod-{pod_id}",
            target="external-1",
            type="topology",
            data=TopologyEdgeDataRead(
                sourceLabel="Ethernet1",
                targetLabel="Ethernet10",
                isDiscovery=True,
                discoveryProtocols=["lldp"],
                sourceInterfaces=["Ethernet1"],
                targetInterfaces=["Ethernet10"],
            ),
        )
        return TopologyDiscoveryResponse(
            seed_pod_id=pod_id,
            seed_pod_name="dist-11",
            discovered_at=datetime.now(timezone.utc),
            commands=["show lldp neighbors detail"],
            nodes=[seed_node, external_node],
            edges=[edge],
            warnings=[],
        )

    monkeypatch.setattr(interface_governance, "discover_topology", fake_discover_topology)

    interfaces_response = await api_client.get(f"/api/v1/pods/{pod['id']}/interfaces", headers=actor)
    assert interfaces_response.status_code == 200, interfaces_response.text
    interfaces = interfaces_response.json()["interfaces"]
    assert any(item["interface_name"] == "Ethernet1" and item["connected"] for item in interfaces)

    block_disable = await api_client.post(
        f"/api/v1/pods/{pod['id']}/interfaces",
        json={"interface_name": "Ethernet1", "disabled": True},
        headers=actor,
    )
    assert block_disable.status_code == 409, block_disable.text

    disable_free = await api_client.post(
        f"/api/v1/pods/{pod['id']}/interfaces",
        json={"interface_name": "Ethernet2", "disabled": True},
        headers=actor,
    )
    assert disable_free.status_code == 200, disable_free.text
    updated = disable_free.json()["interfaces"]
    assert any(item["interface_name"] == "Ethernet2" and item["disabled"] for item in updated)
