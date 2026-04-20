# Containerlab Port-Dense Lab

This sample topology is meant to stress the port-dense redesign in the topology view. It mixes a Cat9kv core, Cisco IOL access and distribution devices, a CSR1000v WAN edge, and a few legacy router roles so the UI has to deal with many dynamically detected interfaces on the same node.

## What It Tests

- A core device with eight uplinks.
- Multiple access switches with grouped local port banks.
- Mixed L2 and L3 devices so LLDP/CDP discovery produces both node and link summaries.
- A shared partial startup config that enables LLDP and CDP for discovery.

## Images

The sample uses these vrnetlab image families:

- `vrnetlab/vr-cat9kv:17.12.01p`
- `vrnetlab/cisco_iol:17.12.01`
- `vrnetlab/cisco_iol:L2-17.12.01`
- `vrnetlab/vr-csr:17.03.02`

If your local vrnetlab tags differ, update the image fields in the topology file.
If your environment cannot pull these images, use the public smoke topology below to verify that containerlab really runs end-to-end.

The topology file is the source of truth for [backend/seed.py](../../backend/seed.py). The seed script reads this YAML directly, so the website loads the same nodes the lab deploys.

## Deploy

From this folder:

```bash
containerlab deploy -t real-hardware-port-lab.clab.yml
```

Then seed the backend from the repository root:

```bash
cd backend
python seed.py
```

## Scope

This lab is only for pre-deploy verification. It exists so you can prove the platform can discover neighbors, open SSH sessions, and push config safely before connecting the app to real hardware devices.

When you move to production equipment, create or update devices in the Admin view with the real IPs and credentials for those devices.
