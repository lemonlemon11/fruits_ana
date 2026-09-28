#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="$(cd "$SCRIPT_DIR/../config" && pwd)"
ENV_FILE="$CONFIG_DIR/.env.docker"

if [ -f "$ENV_FILE" ]; then
  echo "[已存在] $ENV_FILE"
  echo "如需重新生成，请先删除该文件后再次运行本脚本。"
else
  cp "$CONFIG_DIR/.env.docker.example" "$ENV_FILE"
  echo "[已生成] $ENV_FILE"
fi

echo
echo "请至少修改以下配置后，再执行 start.sh："
echo "  - FRUIT_ANALYSIS_DATABASE_URL"
echo "  - FRUIT_ANALYSIS_AI_BASE_URL / FRUIT_ANALYSIS_AI_API_KEY"
echo "  - FRUIT_ANALYSIS_SMTP_HOST / USER / PASSWORD / FROM（邮箱注册验证码）"
