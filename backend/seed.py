"""
Run once after deploying the containerlab lab:
  python seed.py

The lab topology YAML is the source of truth; this script mirrors its nodes into
the backend database so the app stays aligned with containerlab.
"""
import asyncio
from pathlib import Path

import yaml
from sqlalchemy import select

from database import AsyncSessionLocal, init_db
from models import LabPod

LAB_TOPOLOGY_PATH = Path(__file__).resolve().parent.parent / "labs" / "containerlab" / "real-hardware-port-lab.clab.yml"

DEVICE_TYPE_BY_KIND = {
    "cisco_cat9kv": "cisco_iosxe",
    "cisco_csr1000v": "cisco_iosxe",
    "cisco_iol": "cisco_iosxe",
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
        raise FileNotFoundError(f"Containerlab topology file not found: {LAB_TOPOLOGY_PATH}")

    with LAB_TOPOLOGY_PATH.open("r", encoding="utf-8") as handle:
        lab_definition = yaml.safe_load(handle) or {}

    nodes = lab_definition.get("topology", {}).get("nodes", {})
    ordered_nodes = sorted(nodes.items(), key=lambda item: _ip_sort_key(str(item[1].get("mgmt-ipv4", ""))))

    seed_pods: list[dict[str, object]] = []
    for index, (node_name, node_definition) in enumerate(ordered_nodes, start=1):
        device_ip = node_definition.get("mgmt-ipv4")
        if not device_ip:
            raise ValueError(f"Containerlab node {node_name} is missing mgmt-ipv4")

        seed_pods.append(
            {
                "pod_number": index,
                "pod_name": node_name,
                "device_ip": device_ip,
                "device_type": DEVICE_TYPE_BY_KIND.get(str(node_definition.get("kind", "")), "cisco_iosxe"),
                "ssh_username": "cisco",
                "ssh_password": "cisco",
                "description": NODE_DESCRIPTIONS.get(node_name, "Containerlab node mirrored from the sample topology"),
            }
        )

    return seed_pods


SEED_PODS = _build_seed_pods()


async def seed() -> None:
    await init_db()
    async with AsyncSessionLocal() as db:
        for data in SEED_PODS:
            result = await db.execute(select(LabPod).where(LabPod.pod_number == data["pod_number"]))
            existing = result.scalar_one_or_none()
            if existing is None:
                db.add(LabPod(**data))
            else:
                for field, value in data.items():
                    setattr(existing, field, value)
        await db.commit()
    print(f"Seeded {len(SEED_PODS)} containerlab pods.")


if __name__ == "__main__":
    asyncio.run(seed())
