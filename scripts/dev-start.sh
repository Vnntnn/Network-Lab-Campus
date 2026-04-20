#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
SKIP_INSTALL=0
BACKEND_PID=""
FRONTEND_PID=""
PYTHON_BIN=""
PYTHON_VERSION=""

log() {
  printf "[dev] %s\n" "$*"
}

die() {
  printf "[dev][error] %s\n" "$*" >&2
  exit 1
}

is_supported_python_version() {
  case "$1" in
    3.11|3.12|3.13) return 0 ;;
    *) return 1 ;;
  esac
}

pick_python_bin() {
  local candidate version

  for candidate in python3.13 python3.12 python3.11; do
    if command -v "$candidate" >/dev/null 2>&1; then
      version="$("$candidate" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null || true)"
      if is_supported_python_version "$version"; then
        PYTHON_BIN="$candidate"
        PYTHON_VERSION="$version"
        return 0
      fi
    fi
  done

  for candidate in python3 python; do
    if command -v "$candidate" >/dev/null 2>&1; then
      version="$("$candidate" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null || true)"
      if is_supported_python_version "$version"; then
        PYTHON_BIN="$candidate"
        PYTHON_VERSION="$version"
        return 0
      fi
    fi
  done

  return 1
}

usage() {
  cat <<'EOF'
Usage: ./scripts/dev-start.sh [options]

Options:
  --skip-install  Skip dependency installation steps
  -h, --help      Show this help text

Environment variables:
  BACKEND_PORT    Backend API port (default: 8000)
  FRONTEND_PORT   Frontend Vite port (default: 5173)
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-install)
      SKIP_INSTALL=1
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

command -v npm >/dev/null 2>&1 || die "npm is required but not found"

[[ -d "$BACKEND_DIR" ]] || die "Backend directory not found: $BACKEND_DIR"
[[ -d "$FRONTEND_DIR" ]] || die "Frontend directory not found: $FRONTEND_DIR"

if ! pick_python_bin; then
  detected_version=""
  if command -v python3 >/dev/null 2>&1; then
    detected_version="$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null || true)"
  elif command -v python >/dev/null 2>&1; then
    detected_version="$(python -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null || true)"
  fi

  if [[ -n "$detected_version" ]]; then
    die "Python 3.11, 3.12, or 3.13 is required for backend dependencies (detected: $detected_version)"
  fi

  die "Python 3.11, 3.12, or 3.13 is required for backend dependencies"
fi

log "Using Python ${PYTHON_VERSION} for backend environment"

VENV_PY="$BACKEND_DIR/.venv/bin/python"
if [[ -x "$VENV_PY" ]]; then
  VENV_VERSION="$("$VENV_PY" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null || true)"
  if [[ -z "$VENV_VERSION" ]] || ! is_supported_python_version "$VENV_VERSION"; then
    if [[ -n "$VENV_VERSION" ]]; then
      log "Existing backend virtual environment uses unsupported Python ${VENV_VERSION}; recreating"
    else
      log "Existing backend virtual environment could not be inspected; recreating"
    fi
    rm -rf "$BACKEND_DIR/.venv"
  fi
fi

if [[ ! -d "$BACKEND_DIR/.venv" ]]; then
  log "Creating backend virtual environment with Python ${PYTHON_VERSION}"
  "$PYTHON_BIN" -m venv "$BACKEND_DIR/.venv"
fi

if [[ "$SKIP_INSTALL" -eq 0 ]]; then
  log "Installing backend dependencies"
  "$BACKEND_DIR/.venv/bin/python" -m pip install --upgrade pip
  "$BACKEND_DIR/.venv/bin/python" -m pip install -r "$BACKEND_DIR/requirements.txt"

  if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
    log "Installing frontend dependencies"
    if ! (cd "$FRONTEND_DIR" && npm ci); then
      log "npm ci failed; retrying with npm install --legacy-peer-deps"
      (cd "$FRONTEND_DIR" && npm install --legacy-peer-deps)
    fi
  fi
fi

if [[ ! -f "$BACKEND_DIR/.env" && -f "$BACKEND_DIR/.env.example" ]]; then
  cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
  log "Created backend .env from .env.example"
fi

cleanup() {
  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
  fi

  if [[ -n "$FRONTEND_PID" ]] && kill -0 "$FRONTEND_PID" >/dev/null 2>&1; then
    kill "$FRONTEND_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

log "Starting backend on http://localhost:${BACKEND_PORT}"
(
  cd "$BACKEND_DIR"
  exec "$BACKEND_DIR/.venv/bin/python" -m uvicorn main:app --reload --host 0.0.0.0 --port "$BACKEND_PORT"
) &
BACKEND_PID=$!

log "Starting frontend on http://localhost:${FRONTEND_PORT}"
(
  cd "$FRONTEND_DIR"
  exec npm run dev -- --host 0.0.0.0 --port "$FRONTEND_PORT"
) &
FRONTEND_PID=$!

log "Press Ctrl+C to stop both services"
wait -n "$BACKEND_PID" "$FRONTEND_PID"
