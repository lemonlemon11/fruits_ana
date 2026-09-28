#!/usr/bin/env bash
set -euo pipefail

echo "==> Docker 版本:"
docker --version
docker compose version

echo
echo "==> 端口监听检查:"
for port in 53000 8000; do
  if ss -ltn 2>/dev/null | grep -q ":${port} "; then
    echo "[占用] ${port}"
  else
    echo "[空闲] ${port}"
  fi
done

echo
echo "==> 用户端镜像检查:"
docker images --format '{{.Repository}}:{{.Tag}}' | grep -E '^fruits-ana-(backend|web):' || echo "[警告] 尚未加载用户端镜像"
