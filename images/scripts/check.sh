#!/usr/bin/env bash
set -euo pipefail

echo "==> Docker 版本:"
docker --version
docker compose version

echo
echo "==> 端口监听检查:"
LISTEN_BIN=""
if command -v ss >/dev/null 2>&1; then
  LISTEN_BIN="ss"
elif command -v netstat >/dev/null 2>&1; then
  LISTEN_BIN="netstat"
fi
if [ -n "$LISTEN_BIN" ] && [ "$LISTEN_BIN" = "ss" ]; then
  LISTEN_CMD=(ss -ltn)
elif [ -n "$LISTEN_BIN" ]; then
  LISTEN_CMD=(netstat -ltn)
else
  echo "[跳过] 未找到 ss / netstat，无法检查端口占用，请人工确认 53000 / 8000 未被占用"
fi
if [ -n "$LISTEN_BIN" ]; then
  for port in 53000 8000; do
    if "${LISTEN_CMD[@]}" 2>/dev/null | grep -q ":${port} "; then
      echo "[占用] ${port}"
    else
      echo "[空闲] ${port}"
    fi
  done
fi

echo
echo "==> MySQL 连通性检查（信息性；MySQL 不在本机时可忽略）:"
if timeout 3 bash -c '</dev/tcp/127.0.0.1/3306' 2>/dev/null; then
  echo "[正常] 127.0.0.1:3306 可连通"
else
  echo "[提示] 127.0.0.1:3306 不可达；若 MySQL 在其他机器或未启动，请先核对 .env.docker 中的数据库地址"
fi

echo
echo "==> 用户端镜像检查:"
docker images --format '{{.Repository}}:{{.Tag}}' | grep -E '^fruits-ana-(backend|web):' || echo "[警告] 尚未加载用户端镜像"
