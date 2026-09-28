#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORKSPACE="$(cd "$PROJECT_DIR/.." && pwd)"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT="$WORKSPACE/fruits_ana_deploy_${STAMP}.tar.gz"

tar -czf "$OUT" \
  -C "$WORKSPACE" \
  --exclude='fruits_ana/images/config/.env.docker' \
  fruits_ana/images

echo "已生成用户端部署包: $OUT"
ls -lh "$OUT"
