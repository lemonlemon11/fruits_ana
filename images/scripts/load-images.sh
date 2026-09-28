#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGES_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

for tar_file in "$IMAGES_DIR"/*.tar; do
  if [ ! -f "$tar_file" ]; then
    continue
  fi
  echo "==> 加载镜像: $tar_file"
  docker load -i "$tar_file"
done

echo
echo "==> 当前用户端镜像:"
docker images --format 'table {{.Repository}}\t{{.Tag}}\t{{.Size}}' | grep -E '^fruits-ana-(backend|web)\s' || true
