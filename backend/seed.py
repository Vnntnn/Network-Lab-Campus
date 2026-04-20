"""
Run once after deploying the sample topology:
    python seed.py

Optional alternate topology path:
    LAB_TOPOLOGY_PATH=../labs/containerlab/real-hardware-port-lab.clab.yml python seed.py

The topology YAML is the source of truth; this script mirrors its nodes into
the backend database so the app stays aligned with deployed network-device labs.
"""
import asyncio
import os
from pathlib import Path

import yaml
from sqlalchemy import select

from database import AsyncSessionLocal, init_db
from models import LabPod

DEFAULT_LAB_TOPOLOGY_PATH = Path(__file__).resolve().parent.parent / "labs" / "containerlab" / "real-hardware-port-lab.clab.yml"
LAB_TOPOLOGY_PATH = Path(os.getenv("LAB_TOPOLOGY_PATH", str(DEFAULT_LAB_TOPOLOGY_PATH))).resolve()
SEED_OWNER_ID = os.getenv("SEED_OWNER_ID", "default")

DEVICE_TYPE_BY_KIND = {
    "arista_ceos": "arista_eos",
    "cisco_cat9kv": "cisco_iosxe",
    "cisco_csr1000v": "cisco_iosxe",
    "cisco_iol": "cisco_iosxe",
    "cisco_xrv": "cisco_iosxr",
}

SSH_USERNAME_BY_DEVICE_TYPE = {
    "arista_eos": "admin",
    "cisco_iosxe": "cisco",
    "cisco_iosxr": "cisco",
}

NODE_DESCRIPTIONS = {
    "c9200l-core": "Core aggregation switch for the port-dense lab",
    "c3550-dist": "Distribution switch / legacy aggregation block",
    "c3560v2-poe": "PoE access switch with grouped uplinks",
    "c2960-access-a": "Access block A for LLDP/CDP validation",
    "c2960-access-b": "Access block B for LLDP/CDP validation",
    "c2950-access": "Legacy access node for port-density checks",
    "c4331-wan": "WAN edge router for the sample lab",
    "c2901-edge": "Branch edge router for discovery and pushes",
    "c2620xm-legacy": "Legacy router to exercise older interface banks",
    "c3745-io-2fe": "Legacy dual-FE router for multi-link discovery",
}


def _ip_sort_key(value: str) -> tuple[int, int, int, int]:
    octets = []
    for part in value.split("."):
        try:
            octets.append(int(part))
        except ValueError:
            octets.append(-1)

    while len(octets) < 4:
        octets.append(-1)

    return tuple(octets[:4])


def _build_seed_pods() -> list[dict[str, object]]:
    if not LAB_TOPOLOGY_PATH.exists():
        raise FileNotFoundError(f"Topology file not found: {LAB_TOPOLOGY_PATH}")

    with LAB_TOPOLOGY_PATH.open("r", encoding="utf-8") as handle:
        lab_definition = yaml.safe_load(handle) or {}

    nodes = lab_definition.get("topology", {}).get("nodes", {})
    ordered_nodes = sorted(nodes.items(), key=lambda item: _ip_sort_key(str(item[1].get("mgmt-ipv4", ""))))

    seed_pods: list[dict[str, object]] = []
    for index, (node_name, node_definition) in enumerate(ordered_nodes, start=1):
        device_ip = node_definition.get("mgmt-ipv4")
        if not device_ip:
            raise ValueError(f"Topology node {node_name} is missing mgmt-ipv4")

        kind = str(node_definition.get("kind", ""))
        device_type = DEVICE_TYPE_BY_KIND.get(kind)
        if device_type is None:
            supported = ", ".join(sorted(DEVICE_TYPE_BY_KIND.keys()))
            raise ValueError(f"Unsupported topology node kind '{kind}' for {node_name}. Supported kinds: {supported}")

        ssh_username = SSH_USERNAME_BY_DEVICE_TYPE.get(device_type, "cisco")

        seed_pods.append(
            {
                "pod_number": index,
                "pod_name": node_name,
                "device_ip": device_ip,
                "device_type": device_type,
                "ssh_username": ssh_username,
                "ssh_password": "cisco",
                "description": NODE_DESCRIPTIONS.get(node_name, "Node mirrored from topology definition"),
            }
        )

    return seed_pods


SEED_PODS = _build_seed_pods()


async def seed() -> None:
    await init_db()
    async with AsyncSessionLocal() as db:
        for data in SEED_PODS:
            result = await db.execute(
                select(LabPod).where(
                    LabPod.owner_id == SEED_OWNER_ID,
                    LabPod.pod_number == data["pod_number"],
                )
            )
            existing = result.scalar_one_or_none()
            if existing is None:
                db.add(LabPod(owner_id=SEED_OWNER_ID, **data))
            else:
                for field, value in data.items():
                    setattr(existing, field, value)
        await db.commit()
    print(f"Seeded {len(SEED_PODS)} pods from topology for owner '{SEED_OWNER_ID}'.")


if __name__ == "__main__":
    asyncio.run(seed())
