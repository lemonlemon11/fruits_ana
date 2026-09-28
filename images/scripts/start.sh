#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="$SCRIPT_DIR/../config"
COMPOSE_FILE="$CONFIG_DIR/docker-compose.yml"

cd "$CONFIG_DIR"
if [ ! -f .env.docker ]; then
  echo "[错误] 缺少 .env.docker，请先执行 scripts/configure-env.sh 并完成配置。" >&2
  exit 1
fi

docker compose -f "$COMPOSE_FILE" up -d
echo
docker compose -f "$COMPOSE_FILE" ps
