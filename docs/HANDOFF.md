# HANDOFF

Last updated：2026-09-10 14:47 (CST)
Written by：Codex（内容由当前工作区实测生成，非对话记忆）

## Current Goal

本批次所有在途改动已收口并提交：认证体系、登录/注册门户重构、免登录预览页、
MySQL 迁移、端口统一、默认入口调整、多模型交接机制。
当前**没有正在进行的开发任务**，等待下一项任务确认。

## Current Status

状态：COMPLETE

当前进度：
1. 工作区全部改动已按功能拆成 11 个提交，`git status` 除 3 个本地目录外干净。
2. 修复了导入失败提示被列表刷新覆盖的缺陷（`frontend/src/views/ImportView.vue:51`）。
3. 补齐并验证了并发会话产出的登录/注册 Portal 重构、端口统一、默认入口调整。
4. 项目记忆文件（`AGENTS.md` + `docs/` 四件套 + `scripts/handoff.sh`）已建立并纳入版本控制。

## Completed

- [x] `33a5aef docs: 归档设计与实施计划文档`
- [x] `66d4a81 docs(agent): 建立多模型交接机制`
- [x] `710e483 chore(project): 迁移 MySQL 配置并补齐依赖与启动脚本`
- [x] `c197322 feat(auth): 增加用户名认证与免登录预览`
- [x] `2e68deb feat(ui): 重构总览与货柜对比页面`
- [x] `f892c49 docs: 更新启动、数据库与认证说明`
- [x] `b2df429` / `9172d8d` 交接状态更新与校正
- [x] `d9ea10a feat(auth): 重构登录注册为门户布局`（AuthPortal 骨架 + 密码可见切换 + 就近校验）
- [x] `3a67116 fix(config): 统一前端端口为 53000`
- [x] `2a71d04 feat(ui): 默认入口改为登录页`（`/` → `/login`，`/preview` 仍可直达）

## In Progress

当前没有正在修改的文件。工作区未跟踪项仅剩本地产物：

- `.superpowers/`、`.superpowersigeria/`（本地工具状态，不应提交）
- `attachments/`（真实结算单 xlsx，属业务敏感数据，不应提交）

原因：三者均未加入 `.gitignore`，但也没有被 stage；提交时务必使用显式路径，不要 `git add -A`。

## Next Steps

下一模型应该按以下顺序继续（不要跳步）：

1. 只读复述当前状态并与用户确认，再决定做哪一项。
2. 候选任务（优先级从高到低）：
   a. 浏览器端手工验收：登录 / 注册 / 登出、密码可见切换、导入、`/preview` 直达、移动端布局。
      （自动化测试已通过，但无端到端验证。）
   b. 把 `.superpowers/`、`.superpowersigeria/`、`attachments/` 加入 `.gitignore`（配置变更，需确认）。
   c. 为前端补 `npm test` / `typecheck` 脚本，统一测试入口。
   d. 结算单单号身份 `settlement_no`（ADR-008 仍为 Proposed，启动前必须确认数据回填与覆盖策略）。
3. 每次改动后运行基线验证，再按功能提交。

## Known Issues

### Issue 1 — 根目录 `.env` 含未使用的 AI 配置（未处理）

- 问题：仓库根 `.env` 存在 `FRUIT_ANALYSIS_AI_BASE_URL` / `FRUIT_ANALYSIS_AI_API_KEY` /
  `FRUIT_ANALYSIS_AI_MODEL`，但全仓库代码无任何引用。
- 当前判断：疑似多模型切换工具留下的本地配置，非项目运行时依赖。
- 下一步：确认是否保留；`.env` 已被 `.gitignore` 忽略，**严禁提交**。

### Issue 2 — 前端缺少统一的测试 / 类型检查入口（未处理）

- 问题：`frontend/package.json` 只有 `dev` / `build` / `preview`，
  前端测试必须手写 `node --experimental-strip-types --test ...`。
- 下一步：补 `test` / `typecheck` 脚本，降低交接时的执行门槛。

### 已修复（留档）

- **导入失败提示被覆盖**：`loadBatches()` 开头清空 `error.value`，而 `submit()` 先写失败摘要再刷新列表，
  导致红色提示被立刻抹掉。已调整为「先刷新列表、再展示摘要」，见 `frontend/src/views/ImportView.vue:51`。
- **前端端口不一致**：README 写 `53000`，代码用 `53001`。已按产品要求统一为 `53000`
  （`3a67116`），`start.sh`、`vite.config.ts`、`docs/ARCHITECTURE.md` 同步。

## Important Context

- 项目状态以文件 + Git 为准，不要依赖任何单次对话上下文。
- 当前分支 `dev`，本批提交范围 `8e2ce11..2a71d04`。
- 2026-09-10 14:31–14:33 期间曾有另一个会话并发修改工作区（认证页 Portal 重构与端口调整）。
  该批改动已由本会话逐项复核、验证（后端 78 例 + 前端 30 例 + 构建全绿）后提交为
  `d9ea10a` / `3a67116` / `2a71d04`，不存在遗留的半成品改动。
- 认证页已抽出 `frontend/src/components/AuthPortal.vue` 作为登录/注册共用骨架；
  新增或修改认证页时请复用该骨架，不要各自复制布局。
- 默认路由：`/` → `/login`；已登录用户经 `guestOnly` 守卫跳 `/overview`；
  `/preview` 仍是公开只读演示页，但需直接访问，不再是默认入口。
- 仓库未配置全局 git 身份，已设置**仓库级** `user.name=Thomas Lin` / `user.email=bill56789@126.com`
  以与历史提交保持一致；如需更换请自行修改。
- 前端测试命令：`node --experimental-strip-types --test frontend/tests/*.test.ts frontend/tests/*.test.mjs`
  （Node 22+，本机 v26）。
- 后端测试通过 `--basetemp=backend/.pytest-tmp` 隔离临时目录。
- 数据库为远端 MySQL（`backend/.env` 配置，已被忽略），建表由 `init_db()` 完成；
  结构变更必须提供可重复执行的迁移脚本，参考 `backend/scripts/`。
- 本批提交未做逐提交（中间态）验证，仅验证了最终状态；后续如需严格 bisect，请以最终提交为准。

## Do Not Change

- `.env`、`backend/.env`：本地密钥与数据库口令。
- `.superpowers/`、`.superpowersigeria/`、`attachments/`：本地工具状态与真实业务数据，不要提交。
- `backend/data/`：原始上传文件与 SQLite 回滚快照。
- `design/*.md`：早期关键决策记录，只读不改写。
- `docs/superpowers/specs|plans/**`：已归档的历史 spec / plan；需要修订时在文件内追加「修订」段落，
  不要删除既有结论。
- 等级映射（`BC → C`）、指标口径（金额 ÷ 数量、按销售日期筛选）：变更必须先新增 ADR。
- 现有 API 路径与响应字段：变更需同步前端 `api/types.ts` + `normalize.ts`。
- 未经确认不要改动数据库 schema、依赖与根配置。

原因：这些是共享契约或不可重建的历史资产，任一模型擅自修改都会破坏其他模型的工作基础。

## Relevant Files

```text
backend/app/main.py                      # FastAPI 入口与路由注册
backend/app/auth.py                      # 密码哈希、会话、认证依赖
backend/app/api/auth.py                  # 注册/登录/me/logout
backend/app/db.py                        # MySQL 连接与环境变量读取
backend/app/models.py                    # SQLAlchemy 模型
backend/app/services/import_service.py   # 导入与去重
backend/app/parser/settlement_parser.py  # 结算单解析
frontend/src/main.ts                     # 路由与守卫（默认入口 /login）
frontend/src/auth.ts                     # 前端会话状态与 safeRedirect
frontend/src/components/AuthPortal.vue   # 登录/注册共用骨架
frontend/src/api/types.ts                # API 契约
frontend/src/views/ImportView.vue        # 导入页（本轮修复点）
frontend/src/views/PublicPreviewView.vue # 免登录演示页（/preview）
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
npm --prefix frontend run dev -- --host 0.0.0.0 --port 53000 --strictPort
```

测试 / 构建 / 交接采集：

```bash
.venv/bin/python -m pytest backend/tests -q --basetemp=backend/.pytest-tmp
npm --prefix frontend run build
node --experimental-strip-types --test frontend/tests/*.test.ts frontend/tests/*.test.mjs
./scripts/handoff.sh
```

## Test Status

当前测试：PASS（2026-09-10 14:45 实测，对应提交 `2a71d04` 的工作区）

已通过：

- 后端 `pytest`：78 个用例全部通过，退出码 0
- 前端 `node:test`：30 个用例全部通过，退出码 0
- 前端 `vite build`：成功

失败：无

尚未测试：

- 浏览器端到端手工验收（登录、注册、导入、`/preview` 直达、移动端布局）
- 远端 MySQL 真实数据联调

## Git State

Branch：`dev`

Latest commits（本批）：

```text
2a71d04 feat(ui): 默认入口改为登录页
3a67116 fix(config): 统一前端端口为 53000
d9ea10a feat(auth): 重构登录注册为门户布局
9172d8d docs(agent): 校正交接时间并记录并发改动
b2df429 docs(agent): 更新交接状态与待办
f892c49 docs: 更新启动、数据库与认证说明
2e68deb feat(ui): 重构总览与货柜对比页面
c197322 feat(auth): 增加用户名认证与免登录预览
710e483 chore(project): 迁移 MySQL 配置并补齐依赖与启动脚本
66d4a81 docs(agent): 建立多模型交接机制
33a5aef docs: 归档设计与实施计划文档
```

Uncommitted changes：无已跟踪文件改动；仅 3 个未跟踪目录（`.superpowers/`、
`.superpowersigeria/`、`attachments/`），不应提交。
