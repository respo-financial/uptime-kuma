#!/usr/bin/env bash
# PM2 entrypoint: Docker runs Uptime Kuma; PM2 owns start/stop/restart.
set -euo pipefail
cd "$(dirname "$0")/.."

cleanup() {
    docker compose down --remove-orphans || true
}
trap cleanup EXIT INT TERM

docker compose up --remove-orphans --abort-on-container-exit
