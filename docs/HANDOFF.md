# HANDOFF

Last updated：2026-09-10 14:30 (CST)
Written by：Codex（无待交接的模型上下文，内容由当前工作区实测生成）

## Current Goal

当前正在解决：
把「认证体系 + 免登录公开预览页」这批在途改动收口并提交，同时建立跨模型交接机制
（本次新增 `AGENTS.md` 与 `docs/` 下四个项目记忆文件、`scripts/handoff.sh`）。

## Current Status

状态：IN_PROGRESS

当前进度：
1. 认证能力已实现但未提交：后端 Argon2 + 服务端会话 + HttpOnly Cookie，
   前端登录/注册页、会话恢复、路由守卫均已写入工作区。
2. 公开预览页 `frontend/src/views/PublicPreviewView.vue` 已新增（未跟踪），
   `/` 重定向到 `/preview`，`/preview` 为公开路由。
3. 后端 78 项测试全部通过；前端构建通过；前端测试 26 项中 25 通过、1 项失败（断言陈旧）。
4. 工作区共有 42 个已跟踪文件被修改、68 个未跟踪条目，均**未提交**。

## Completed

- [x] 后端认证：`backend/app/auth.py`、`backend/app/api/auth.py`、`UserSession` 模型
- [x] 前端认证：`frontend/src/auth.ts`、`LoginView.vue`、`RegisterView.vue`、路由守卫
- [x] 公开预览页与路由调整：`PublicPreviewView.vue`、`frontend/src/main.ts`
- [x] 文档：`AGENTS.md`、`docs/ARCHITECTURE.md`、`docs/DECISIONS.md`、`docs/TODO.md`、本文件、`scripts/handoff.sh`
- [x] 验证：后端 pytest 78 passed；`npm --prefix frontend run build` 成功

## In Progress

当前正在修改（相对于 `8e2ce11` 的工作区改动，尚未提交）：

- 后端：`backend/app/auth.py`、`api/auth.py`、`db.py`、`models.py`、`schemas.py`、
  `api/analytics.py`、`api/imports.py`、`api/exports.py`、`pyproject.toml` 及测试
- 前端：`src/auth.ts`、`views/LoginView.vue`、`views/RegisterView.vue`、
  `views/PublicPreviewView.vue`、`styles-auth.css`、`main.ts`、`AppShell.vue`、
  `api/{client,normalize,types}.ts`、对比组件与 `views/*`、`utils/*`、多个 `styles-*.css`
- 文档与配置：`README.md`、`.gitignore`、`backend/.env.example`、
  `docs/superpowers/**`、`design/*.md`、`attachments/*.xlsx`

原因：这批改动横跨「认证」「公开预览」「MySQL 文档化」三条线，混在工作区未拆分提交。

## Next Steps

下一模型应该按以下顺序继续（不要跳步）：

1. 先只读复述当前状态并等待确认，不要立即改代码。
2. 跑一次基线验证：
   `.venv/bin/python -m pytest backend/tests -q --basetemp=backend/.pytest-tmp` 与
   `npm --prefix frontend run build`。
3. 修复 `frontend/tests/farmer-ui-copy.test.mjs` 的陈旧断言（断言要求
   `ImportView.vue` 中 `await loadBatches()` 出现在 `const summary = summarizeImportResults`
   之前，但重构后顺序相反）。确认新顺序是预期行为后再更新断言，不要为迁就测试改回实现。
4. 拆分提交，建议顺序：① 设计与 spec 文档归档 → ② 后端认证 → ③ 前端认证与公开预览
   → ④ 样式与对比组件调整 → ⑤ 测试与配置。不要一次 `git add -A` 全量提交。
5. 需要 checkpoint 时使用 `checkpoint: <描述>` 格式。
6. 上述完成后，再评估是否启动 ADR-008（结算单单号身份），启动前必须确认数据回填与覆盖策略。

## Known Issues

### Issue 1 — 前端测试 1 项失败

- 问题：`frontend/tests/farmer-ui-copy.test.mjs:57` 断言失败。
- 原因：断言匹配 `await loadBatches()` 早于 `const summary = summarizeImportResults` 的旧导入页写法，
  当前 `ImportView.vue` 已重构为先算 summary 再刷新列表。
- 当前判断：测试陈旧，非实现缺陷；但需人工确认新顺序符合预期。
- 下一步：确认后更新该断言。

### Issue 2 — README 与代码的前端端口不一致

- 问题：README 写网页地址为 `http://127.0.0.1:53000`，
  但 `start.sh` 默认 `FRONTEND_PORT=53001`，`frontend/vite.config.ts` 也是 `53001`。
- 当前判断：README 描述过期。
- 下一步：统一为 `53001`，或修改代码默认值后同步 README。

### Issue 3 — 根目录 `.env` 含未使用的 AI 配置

- 问题：仓库根 `.env` 存在 `FRUIT_ANALYSIS_AI_BASE_URL` / `FRUIT_ANALYSIS_AI_API_KEY` / `FRUIT_ANALYSIS_AI_MODEL`，
  但全仓库代码没有任何引用。
- 当前判断：疑似多模型切换工具留下的本地配置，非项目运行时依赖。
- 下一步：确认是否保留；`.env` 已被 `.gitignore` 忽略，**严禁提交**。

## Important Context

- 项目状态以文件 + Git 为准，不要依赖任何单次对话上下文。
- 当前分支为 `dev`，最新提交 `8e2ce11 feat(auth): 增加认证基础能力`。
- 前端没有 `npm test` / `lint` / `typecheck` 脚本，前端测试需手动执行：
  `node --experimental-strip-types --test frontend/tests/*.test.ts frontend/tests/*.test.mjs`（Node 22+）。
- 后端测试通过 `--basetemp=backend/.pytest-tmp` 隔离临时目录。
- 数据库为远端 MySQL（`backend/.env` 配置，已被忽略），schema 由 `init_db()` 建表；
  结构变更必须提供可重复执行的迁移脚本，参考 `backend/scripts/`。
- `backend/data/` 存放原始上传文件与旧 SQLite 快照，不提交 Git。
- `attachments/` 内为真实结算单 xlsx，属于业务敏感数据，不要提交到远程仓库。

## Do Not Change

- `backend/data/`：原始上传文件与 SQLite 回滚快照。
- `.env`、`backend/.env`：本地密钥与数据库口令。
- `design/*.md`：早期关键决策记录，只读不改写。
- `docs/superpowers/specs|plans/**`：已归档的历史 spec / plan，需要新计划时新增文件。
- 等级映射（`BC → C`）、指标口径（金额 ÷ 数量、按销售日期筛选）：变更必须先新增 ADR。
- 现有 API 路径与响应字段：变更需同步前端 `api/types.ts` + `normalize.ts`。
- 未经确认不要改动数据库 schema、`pyproject.toml` 依赖、`package.json` 依赖与根配置。

原因：这些是共享契约或不可重建的历史资产，任一模型擅自修改都会破坏其他模型的工作基础。

## Relevant Files

```text
backend/app/main.py                      # FastAPI 入口与路由注册
backend/app/auth.py                      # 密码哈希、会话、认证依赖
backend/app/api/auth.py                  # 注册/登录/me/logout
backend/app/models.py                    # SQLAlchemy 模型
backend/app/services/import_service.py   # 导入与去重
backend/app/parser/settlement_parser.py  # 结算单解析
frontend/src/main.ts                     # 路由与守卫
frontend/src/auth.ts                     # 前端会话状态
frontend/src/api/types.ts                # API 契约
frontend/src/views/OverviewView.vue      # 总览看板
frontend/src/views/ImportView.vue        # 导入页（含失败断言相关逻辑）
frontend/tests/farmer-ui-copy.test.mjs   # 当前唯一失败用例
docs/ARCHITECTURE.md
docs/DECISIONS.md
docs/TODO.md
```

## Commands

启动（同时拉起前后端）：

```bash
./start.sh
```

仅后端 / 仅前端：

```bash
.venv/bin/python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
npm --prefix frontend run dev -- --host 0.0.0.0 --port 53001 --strictPort
```

测试 / 构建 / 交接采集：

```bash
.venv/bin/python -m pytest backend/tests -q --basetemp=backend/.pytest-tmp
npm --prefix frontend run build
node --experimental-strip-types --test frontend/tests/*.test.ts frontend/tests/*.test.mjs
./scripts/handoff.sh
```

## Test Status

当前测试：PARTIAL

已通过：

- 后端 `pytest`：78 passed
- 前端 `vite build`：成功（1890 modules，产物在 `frontend/dist/`）
- 前端 node:test：26 项中 25 通过

失败：

- `frontend/tests/farmer-ui-copy.test.mjs`：1 项，断言 `ImportView.vue` 内部语句顺序（见 Known Issues 1）

尚未测试：

- 浏览器端到端手工验收（登录、导入、公开预览移动端布局）未在本次交接中执行
- 远端 MySQL 真实数据的联调未执行

## Git State

Branch：`dev`

Latest checkpoint：`8e2ce11 feat(auth): 增加认证基础能力`（尚无 checkpoint 提交）

Uncommitted changes：42 个已跟踪文件被修改（约 +1015 / -1064），68 个未跟踪条目，
包含认证实现、公开预览页、设计文档与真实结算单附件。未 stage、未 commit。
