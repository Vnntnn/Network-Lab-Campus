# Docker Deployment

This setup runs both services with Docker Compose:
- backend: FastAPI + Uvicorn
- frontend: Nginx serving Vite build + proxying /api and websocket traffic

## 1) Prerequisites

- Docker Engine 24+
- Docker Compose v2+

## 2) Configure Environment

1. Copy env template:

```bash
cp .env.docker.example .env
```

2. Update values in `.env`:

- `WEB_PORT`: host port for website (80 by default)
- `CORS_ORIGINS`: browser origin(s), comma-separated
- `DATABASE_URL`: keep default SQLite path unless moving to PostgreSQL
- `VITE_API_BASE_URL`: optional frontend API base (default `/api/v1`)
- `VITE_WS_BASE_URL`: optional websocket base (default current host)

## 3) Build and Start

```bash
docker compose up -d --build
```

Preferred production path (uses repository deploy script with prechecks):

```bash
chmod +x scripts/deploy-production.sh
./scripts/deploy-production.sh
```

Script options:

- `--env-file <path>` use a non-default env file
- `--no-build` restart containers without rebuild
- `--pull` refresh base images before build
- `--skip-healthcheck` skip `/health` verification

## 4) Verify

```bash
curl -i http://localhost:${WEB_PORT:-80}/health
```

Open:

- `http://<vm-ip-or-domain>:<WEB_PORT>`

## 5) Logs and Operations

```bash
docker compose logs -f backend
docker compose logs -f frontend
docker compose restart backend
docker compose down
```

## 6) Data Persistence

SQLite file is persisted in the named volume `backend_data` mounted to `/app/data`.

## 7) TLS in Production

For internet-facing production, place a host Nginx or cloud load balancer in front for HTTPS termination, then proxy to `frontend` container.
