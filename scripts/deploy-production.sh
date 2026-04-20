#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
COMPOSE_FILE="$ROOT_DIR/docker-compose.yml"
NO_BUILD=0
PULL_BASE_IMAGES=0
SKIP_HEALTHCHECK=0

log() {
  printf "[deploy] %s\n" "$*"
}

die() {
  printf "[deploy][error] %s\n" "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage: ./scripts/deploy-production.sh [options]

Options:
  --env-file <path>      Override environment file (default: ./.env)
  --no-build             Skip image rebuild and just recreate/start containers
  --pull                 Pull latest base images before build
  --skip-healthcheck     Skip post-deploy /health probe
  -h, --help             Show this help text

Examples:
  ./scripts/deploy-production.sh
  ./scripts/deploy-production.sh --env-file .env.prod --pull
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)
      [[ $# -ge 2 ]] || die "Missing value for --env-file"
      ENV_FILE="$2"
      shift 2
      ;;
    --no-build)
      NO_BUILD=1
      shift
      ;;
    --pull)
      PULL_BASE_IMAGES=1
      shift
      ;;
    --skip-healthcheck)
      SKIP_HEALTHCHECK=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Unknown option: $1"
      ;;
  esac
done

[[ -f "$COMPOSE_FILE" ]] || die "Missing docker-compose.yml at $COMPOSE_FILE"

if ! command -v docker >/dev/null 2>&1; then
  die "Docker is not installed or not in PATH"
fi

if ! docker info >/dev/null 2>&1; then
  die "Docker daemon is not reachable. Start Docker and retry"
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  die "Neither 'docker compose' nor 'docker-compose' is available"
fi

if [[ ! -f "$ENV_FILE" ]]; then
  if [[ -f "$ROOT_DIR/.env.docker.example" ]]; then
    log "Env file not found. Creating from .env.docker.example"
    cp "$ROOT_DIR/.env.docker.example" "$ENV_FILE"
    die "Created $ENV_FILE. Update values and rerun"
  fi
  die "Environment file not found: $ENV_FILE"
fi

log "Using compose CLI: ${COMPOSE[*]}"
log "Using env file: $ENV_FILE"

# Export env vars so both compose variants resolve ${...} consistently.
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

compose() {
  "${COMPOSE[@]}" -f "$COMPOSE_FILE" "$@"
}

log "Validating compose configuration"
compose config >/dev/null

if [[ "$PULL_BASE_IMAGES" -eq 1 ]]; then
  log "Pulling latest base images"
  docker pull python:3.12-slim
  docker pull node:20-alpine
  docker pull nginx:1.27-alpine
fi

if [[ "$NO_BUILD" -eq 1 ]]; then
  log "Starting containers without rebuild"
  compose up -d
else
  log "Building and starting containers"
  compose up -d --build
fi

log "Current service status"
compose ps

if [[ "$SKIP_HEALTHCHECK" -eq 1 ]]; then
  log "Skipping health check as requested"
  exit 0
fi

probe_health() {
  local url="$1"

  if command -v curl >/dev/null 2>&1; then
    curl -fsS "$url" >/dev/null
    return $?
  fi

  if command -v wget >/dev/null 2>&1; then
    wget -qO- "$url" >/dev/null
    return $?
  fi

  die "Neither curl nor wget found for health checks"
}

WEB_PORT="${WEB_PORT:-80}"
HEALTH_URL="http://127.0.0.1:${WEB_PORT}/health"
log "Waiting for health endpoint: $HEALTH_URL"

for attempt in $(seq 1 30); do
  if probe_health "$HEALTH_URL"; then
    log "Deployment successful. Health check passed"
    exit 0
  fi
  sleep 2
  log "Health check retry ${attempt}/30"
done

die "Health check failed after 30 attempts. Check logs with: ${COMPOSE[*]} -f $COMPOSE_FILE logs -f"
