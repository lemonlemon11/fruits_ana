#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_BIN="$PROJECT_DIR/.venv/bin/python"
BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_HOST="${FRONTEND_HOST:-0.0.0.0}"
FRONTEND_PORT="${FRONTEND_PORT:-53001}"

if [[ ! -x "$PYTHON_BIN" ]]; then
  echo "错误：未找到虚拟环境，请先运行 python3 -m venv .venv。" >&2
  exit 1
fi

if [[ ! -x "$PROJECT_DIR/frontend/node_modules/.bin/vite" ]]; then
  echo "错误：前端依赖未安装，请先运行 npm --prefix frontend ci。" >&2
  exit 1
fi

cleanup() {
  trap - EXIT INT TERM
  kill "${BACKEND_PID:-}" "${FRONTEND_PID:-}" 2>/dev/null || true
  wait "${BACKEND_PID:-}" "${FRONTEND_PID:-}" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

echo "后端：http://$BACKEND_HOST:$BACKEND_PORT"
"$PYTHON_BIN" -m uvicorn app.main:app \
  --app-dir "$PROJECT_DIR/backend" \
  --host "$BACKEND_HOST" \
  --port "$BACKEND_PORT" &
BACKEND_PID=$!

echo "前端：http://127.0.0.1:$FRONTEND_PORT"
npm --prefix "$PROJECT_DIR/frontend" run dev -- \
  --host "$FRONTEND_HOST" \
  --port "$FRONTEND_PORT" \
  --strictPort &
FRONTEND_PID=$!

wait -n "$BACKEND_PID" "$FRONTEND_PID"
