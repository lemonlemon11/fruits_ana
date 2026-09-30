#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGES_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

shopt -s nullglob
tar_files=("$IMAGES_DIR"/*.tar)
shopt -u nullglob

if [ ${#tar_files[@]} -eq 0 ]; then
  echo "[错误] $IMAGES_DIR 下没有 .tar 镜像文件。" >&2
  echo "        请先在开发机执行 ./scripts/build-images.sh 构建并导出镜像，再用 ./scripts/package.sh 打包带到本机。" >&2
  exit 1
fi

for tar_file in "${tar_files[@]}"; do
  echo "==> 加载镜像: $tar_file"
  docker load -i "$tar_file"
done

echo
echo "==> 当前用户端镜像:"
docker images --format 'table {{.Repository}}\t{{.Tag}}\t{{.Size}}' | grep -E '^fruits-ana-(backend|web)\s' || true
