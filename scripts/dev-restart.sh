#!/usr/bin/env bash
# Free dev ports (from .env like Vite/backend) and start FastAPI + Vite.
# Usage: from repo root —  bash scripts/dev-restart.sh
#        or            —  ./scripts/dev-restart.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

die() {
  echo "dev-restart: $*" >&2
  exit 1
}

# Same merge order as vite.config.ts: root .env, then backend/.env (later wins).
load_ports() {
  FRONTEND_DEV_PORT=5173
  BACKEND_PORT=8000
  FRONTEND_PORT=3080
  local f
  for f in "$ROOT/.env" "$ROOT/backend/.env"; do
    [[ -f "$f" ]] || continue
    local line key val
    while IFS= read -r line || [[ -n "${line:-}" ]]; do
      [[ "$line" =~ ^[[:space:]]*# ]] && continue
      [[ "$line" =~ ^[[:space:]]*$ ]] && continue
      [[ "$line" =~ ^(FRONTEND_DEV_PORT|BACKEND_PORT|FRONTEND_PORT)= ]] || continue
      key="${line%%=*}"
      val="${line#*=}"
      val="${val%%$'\r'}"
      val="${val#\"}"
      val="${val%\"}"
      val="${val#\'}"
      val="${val%\'}"
      case "$key" in
        FRONTEND_DEV_PORT) FRONTEND_DEV_PORT="$val" ;;
        BACKEND_PORT) BACKEND_PORT="$val" ;;
        FRONTEND_PORT) FRONTEND_PORT="$val" ;;
      esac
    done <"$f"
  done
}

is_uint16() {
  [[ "$1" =~ ^[0-9]+$ ]] && (( "$1" >= 1 && "$1" <= 65535 ))
}

free_tcp_port() {
  local p="$1"
  if is_uint16 "$p"; then
    if fuser -s "${p}/tcp" 2>/dev/null; then
      echo "dev-restart: freeing TCP port ${p} …"
      fuser -k "${p}/tcp" 2>/dev/null || true
    else
      echo "dev-restart: port ${p} is free"
    fi
  else
    echo "dev-restart: skip invalid port: ${p}" >&2
  fi
}

load_ports

# Defaults from .env.example — also try common fallbacks so stray processes are cleared.
declare -A seen_ports=()
queue_free() {
  is_uint16 "$1" || return 0
  [[ -n "${seen_ports[$1]+x}" ]] && return 0
  seen_ports[$1]=1
  free_tcp_port "$1"
}
queue_free "$FRONTEND_DEV_PORT"
queue_free "$BACKEND_PORT"
queue_free "$FRONTEND_PORT"
queue_free 3080
queue_free 5173
queue_free 8000

sleep 0.5

[[ -x "$ROOT/backend/.venv/bin/python" ]] ||
  die "backend/.venv/bin/python missing — run: cd backend && python -m venv .venv && .venv/bin/pip install -r requirements.txt"

echo "dev-restart: starting backend on port ${BACKEND_PORT} …"
(cd "$ROOT/backend" && exec .venv/bin/python dev.py) &
BACK_PID=$!

echo "dev-restart: starting Vite on port ${FRONTEND_DEV_PORT} …"
npm run dev &
VITE_PID=$!

cleanup() {
  echo "dev-restart: stopping (PIDs ${BACK_PID} ${VITE_PID}) …" >&2
  kill "$BACK_PID" "$VITE_PID" 2>/dev/null || true
  wait "$BACK_PID" "$VITE_PID" 2>/dev/null || true
}

trap cleanup INT TERM

# If either server exits, stop the other (typical: one crashed).
# `wait` can return non-zero when a child fails — must not abort under `set -e`.
set +e
wait -n
exit_code=$?
set -e
cleanup
trap - INT TERM
exit "${exit_code:-0}"
