# Network-configuration-management-platform
[![Build & Push](https://github.com/Vnntnn/Network-Lab-Campus/actions/workflows/deploy.yml/badge.svg)](https://github.com/Vnntnn/Network-Lab-Campus/actions/workflows/deploy.yml)

Web based application that makes network device configuration easier to learn.

## Example Lab

The port-dense containerlab sample lives in [labs/containerlab/README.md](labs/containerlab/README.md). The containerlab YAML is the source of truth for [backend/seed.py](backend/seed.py), so the website loads the same nodes and links the lab actually deploys.

## Real Hardware Workflow

Containerlab is only the verification harness. Use it to confirm discovery, SSH reachability, and config push behavior before touching production equipment.

For real devices:

1. Add each device through the Admin view with its real management IP and SSH credentials.
2. Use Topology discovery to verify LLDP/CDP against a real seed node.
3. Use the Command Builder or Topology editor to push config only after reachability is confirmed.

The app does not depend on containerlab at runtime; it uses the same backend paths for both the sample lab and real hardware.

## Production Deployment

If you are hosting on VMs, follow [docs/PRODUCTION_VM_DEPLOYMENT.md](docs/PRODUCTION_VM_DEPLOYMENT.md) for a full production runbook (Nginx reverse proxy, systemd backend service, TLS, and update flow).

## Docker Deployment

If you prefer containers on your VM, use [docker-compose.yml](docker-compose.yml) with [docs/DOCKER_DEPLOYMENT.md](docs/DOCKER_DEPLOYMENT.md).

For automated Linux deployment with preflight checks and health verification, run `scripts/deploy-production.sh`.

## Development Scripts

- Linux/macOS: `./scripts/dev-start.sh`
- Windows: `scripts\\dev-start.bat`

Both scripts can use `BACKEND_PORT` and `FRONTEND_PORT` environment variables to override default ports.
Backend dependencies are pinned for Python 3.11-3.13 (3.12 recommended).
