#!/usr/bin/env bash
#
# 采集模型交接所需的 Git 现场信息。
# 用法：./scripts/handoff.sh
# 注意：本脚本只读，不会修改工作区，也不会提交代码。

set -Eeuo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "错误：$PROJECT_DIR 不是 Git 仓库，无法采集交接信息。" >&2
  exit 1
fi

echo "================================"
echo "AI MODEL HANDOFF"
echo "================================"
echo ""

echo "### DATE"
date "+%Y-%m-%d %H:%M:%S %Z"
echo ""

echo "### BRANCH"
git branch --show-current
echo ""

echo "### LATEST COMMITS"
git log --oneline -10
echo ""

echo "### STATUS"
git status --short
echo ""

echo "### DIFF STAT"
git diff --stat
echo ""

echo "### CHANGED FILES"
git diff --name-only
echo ""

echo "### STAGED FILES"
git diff --cached --name-only
echo ""

echo "### UNTRACKED FILES"
git ls-files --others --exclude-standard
echo ""

echo "================================"
echo "HANDOFF DATA COMPLETE"
echo "================================"
echo ""
echo "下一步：把以上信息整理进 docs/HANDOFF.md 与 docs/TODO.md，"
echo "必要时更新 docs/DECISIONS.md / docs/ARCHITECTURE.md，"
echo "并在切换模型前创建 checkpoint commit。"
