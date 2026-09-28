#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
IMAGES_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "==> 构建用户端后端镜像 fruits-ana-backend:local"
docker build \
  -f "$PROJECT_DIR/deploy/docker/Dockerfile.fruits-backend" \
  -t fruits-ana-backend:local \
  "$PROJECT_DIR"

echo "==> 构建用户端前端镜像 fruits-ana-web:local"
docker build \
  -f "$PROJECT_DIR/deploy/docker/Dockerfile.fruits-web" \
  -t fruits-ana-web:local \
  "$PROJECT_DIR"

echo "==> 导出镜像到 images 目录"
docker save fruits-ana-backend:local -o "$IMAGES_DIR/fruits-ana-backend.tar"
docker save fruits-ana-web:local -o "$IMAGES_DIR/fruits-ana-web.tar"

echo
echo "==> 当前用户端镜像:"
docker images --format 'table {{.Repository}}\t{{.Tag}}\t{{.Size}}' \
  | grep -E '^fruits-ana-(backend|web)\s' || true

echo
echo "==> 镜像文件:"
ls -lh "$IMAGES_DIR"/fruits-ana-backend.tar "$IMAGES_DIR"/fruits-ana-web.tar
