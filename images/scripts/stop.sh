#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="$SCRIPT_DIR/../config"
COMPOSE_FILE="$CONFIG_DIR/docker-compose.yml"
cd "$CONFIG_DIR"
docker compose -f "$COMPOSE_FILE" down
