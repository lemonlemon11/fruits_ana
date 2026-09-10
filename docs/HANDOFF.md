# HANDOFF

Last updated：2026-09-10 16:16 (CST)
Written by：Codex（内容由当前工作区实测生成，非对话记忆）

## Current Goal

界面日期口径统一：把所有面向用户的日期叫法（销售日期 / 首销日期 / 日期 / 销售周期 /
开始日期 / 结束日期）统一改为「到达日期」，筛选控件为「到达日期起 / 到达日期止」，
并记录为 ADR-010。代码与自动化验证已完成并提交，**等待浏览器端手工验收**。

## Current Status

状态：IMPLEMENTATION COMPLETE / COMMITTED / 待浏览器验收

当前进度：
1. 上一批「商号维度重构」已由本会话复核并拆分为 7 个提交（`0160fdf`..`2160b38`），工作区已收口。
2. 系列识别口径落定为「单号中文前缀」，写入 ADR-009；均价口径为元/件（用户确认）。
3. 后端新增 `series_analytics_service` 与 `/api/analytics/series-comparison`，
   `GET /api/settlements` 追加 `series` 字段，新增 13 项后端用例。
4. 前端新增「系列对比」页（勾选业务单 + 总览表 + A/B/C 独立表 + 价差表 + 两张图表），
   新增 8 项前端用例并同步响应式与菜单守卫测试。
5. 真实数据核对：线上 4 张结算单结果与设计稿基线完全一致；其中宝贝01/02/003 三张的
   A/B/C 件数、金额、均价、价差与用户手算结果**逐项一致**。
6. 下拉框展示顺序按用户确认改为「商号（单号）」、取值仍为商号，提交为 `3e50d9f`。
7. 界面日期口径统一为「到达日期」（ADR-010）：涉及结算单列表 / 结算单详情 / 数据明细 /
   趋势表 / 系列总览 / 结算单对比 / 系列对比 / 数据导入共 10 个前端文件，
   含表头、筛选控件、分区说明与空状态文案；数据库字段与接口参数保持不变。
8. 本批提交已入库，工作区干净；等待浏览器端手工验收。

## Completed

- [x] `57468ee feat(backend): 增加按系列组织的结算单对比分析`（13 项用例）
- [x] `7703981 feat(frontend): 增加系列对比页面与图表`（8 项用例）
- [x] `58d164b docs: 记录系列对比口径与实现范围`（ADR-009 + 设计稿修订段落）
- [x] `0160fdf`..`2160b38` 商号维度重构与本批次收口提交（7 个）
- [x] 商号维度重构（解析 / 模型 / 导入 / 分析 / 导出 / 前端）
- [x] 新增「数据明细」页与结算单明细弹窗
- [x] 下拉框改为「商号（单号）展示 + 商号取值」，柜号退回为普通字段
- [x] 数据导入支持多文件拖入（累加去重、忽略不支持类型、清空选择；见 `frontend/src/utils/importFiles.ts`）
- [x] `3e50d9f fix(frontend): 下拉框改为商号在前展示避免误选`
- [x] 界面日期统一显示为「到达日期」（ADR-010，10 个前端文件；筛选控件为「到达日期起 / 到达日期止」）
- [x] 迁移脚本 `backend/scripts/backfill_settlement_identity.py`（含 SQL 快照、幂等、dry-run）
- [x] 文档同步：ADR-008 转为 Accepted、ARCHITECTURE / README / TODO
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

无在途开发任务；「系列对比」与「到达日期」文案统一均已完成开发与自动化验证，
等待浏览器端手工验收（见 `docs/TODO.md`）。

## Incidents（已解决）

### 「开始导入」把点击事件当成覆盖参数，同商号重复导入被静默覆盖（2026-09-10）

- 现象：桌面端验收时，重复导入同一商号**没有**出现「已存在，是否覆盖」的确认提示，
  而是直接返回成功并替换掉原结算单。
- 根因：`ImportView.vue` 里 `@click="submit"` 把 MouseEvent 作为 `overwrite` 实参传入，
  Vue 模板事件绑定不会替你省略参数，任何真值都被当作 `overwrite=true`。
- 处理：按钮改为 `@click="submit()"`，并在 `submit()` 内收敛为 `const forceOverwrite = overwrite === true`；
  新增 `frontend/tests/import-view-binding.test.mjs` 作为回归测试。
- 影响范围：只影响浏览器端导入确认；后端 `?overwrite` 语义本身正确（curl 已验证）。

### 结算单详情页移动端横向溢出 144px（2026-09-10）

- 现象：390px 视口下打开「结算单详情」，整页被撑宽到 534px（出现横向滚动）。
- 根因：该页根容器叫 `.settlement-dashboard`，而 `styles-responsive.css` 的移动端
  `min-width: 0; max-width: 100%` 守卫只列了 `.page-stack`；抽屉里的销售明细表
  （`min-width: 520px`）因此把 grid 轨道顶宽，表格容器失去内部滚动。
- 处理：把 `.settlement-dashboard` 及其子元素加入 560px 守卫；新增
  `frontend/tests/responsive-guards.test.mjs`，对每个业务页面的根容器 class 做守卫覆盖校验。


### 下拉框不能下拉 + 页面「数据加载失败 / not found」（2026-09-10）

- 现象：`http://120.48.117.234:53000/` 各页面下拉框为空，列表报「数据加载失败」「not found」。
- 根因：前端已是商号维度新代码，**后端仍是 14:33 启动的旧进程**（新接口 `/api/settlements`
  返回 404），且线上库仍是旧柜号结构，两端契约不匹配。
- 处理：修掉迁移脚本 `_literal()` 中 `date.isoformat(sep=...)` 崩溃 → 执行 `--apply` 迁移
  （4 批次 / 86 明细 / 4 条 summary）→ 重启服务（`systemd-run --unit=fruits-ana -p WorkingDirectory=...`）。
- 结果：`/api/settlements` 返回 401（鉴权正常，不再是 404），页面 15 项检查全部通过。
- 回滚方式：用 `backend/data/snapshot-settlement-20260910-154020.sql` 还原库结构，
  再切回旧后端进程；该快照**勿删勿提交**。

工作区未跟踪项：

- `.superpowers/`、`.superpowersigeria/`（本地工具状态，不应提交）
- `attachments/`（真实结算单 xlsx，属业务敏感数据，不应提交）
- `backend/data/snapshot-settlement-*.sql`（迁移前快照，勿提交、勿删除）

原因：三者均未加入 `.gitignore`，但也没有被 stage；提交时务必使用显式路径，不要 `git add -A`。

## Next Steps

下一模型应该按以下顺序继续（不要跳步）：

1. 只读复述当前状态并与用户确认，再决定做哪一项。
2. 候选任务（优先级从高到低）：
   a. 浏览器端验收：先确认后端已加载最新代码（`/api/analytics/series-comparison` 不再返回 404，
      运行中的旧进程需重启服务）；再逐页确认日期文案已统一为「到达日期」，并验收「系列对比」页
      （勾选同系列与跨系列业务单、四张表与两张图正确、移动端不溢出）。
   b. 系列对比的后续能力：到港日期字段与一次库迁移、元/KG 口径、AI 分析结论、Excel 导出、系列别名字典。
   c. 真实业绩数据到位后的整体回归验收（目前线上只有 4 张示例结算单）。
   d. 根目录 `.env` 中未使用的 `FRUIT_ANALYSIS_AI_*` 配置确认去留（见 Known Issues 1）。
3. 每次改动后运行基线验证，再按功能提交。

## Known Issues

### Issue 1 — 根目录 `.env` 含未使用的 AI 配置（未处理）

- 问题：仓库根 `.env` 存在 `FRUIT_ANALYSIS_AI_BASE_URL` / `FRUIT_ANALYSIS_AI_API_KEY` /
  `FRUIT_ANALYSIS_AI_MODEL`，但全仓库代码无任何引用。
- 当前判断：疑似多模型切换工具留下的本地配置，非项目运行时依赖。
- 下一步：确认是否保留；`.env` 已被 `.gitignore` 忽略，**严禁提交**。

### Issue 2 — 前端缺少统一的测试 / 类型检查入口（已修复 2026-09-10）

- 已补 `frontend/package.json` 的 `test` / `typecheck` 脚本；
  `tsconfig.json` 增加 `allowImportingTsExtensions` + `noEmit`、`include` 收敛到 `src`，
  并新增 `src/shims-vue.d.ts` 声明 `*.vue`，因此无需引入 `vue-tsc` 或 `@types/node`。

### Issue 3 — 系列识别依赖单号命名规范（已知限制）

- 问题：系列取自单号的中文前缀，单号不规范（如 `626`、空单号）会归入「未识别系列」。
- 当前判断：这是 ADR-009 的既定取舍，不阻塞分析，但系列名可能不等于业务预期品牌。
- 下一步：若业务需要固定品牌名与别名，再考虑新增品牌字典（见 `docs/TODO.md`）。

### 已修复（留档）

- **死代码 `frontend/src/components/ComparisonPanel.vue` 已删除**（无任何源码引用，
  仅历史 plan 提及）；如误删可用 `git checkout -- frontend/src/components/ComparisonPanel.vue` 恢复。
- **`.gitignore` 增加** `.superpowers/`、`.superpowersigeria/`、`attachments/`，
  避免本地工具状态与真实结算单进入 `git status` / 提交范围。

- **导入失败提示被覆盖**：`loadBatches()` 开头清空 `error.value`，而 `submit()` 先写失败摘要再刷新列表，
  导致红色提示被立刻抹掉。已调整为「先刷新列表、再展示摘要」，见 `frontend/src/views/ImportView.vue:51`。
- **前端端口不一致**：README 写 `53000`，代码用 `53001`。已按产品要求统一为 `53000`
  （`3a67116`），`start.sh`、`vite.config.ts`、`docs/ARCHITECTURE.md` 同步。

## Important Context

- 项目状态以文件 + Git 为准，不要依赖任何单次对话上下文。
- 当前分支 `dev`；上一批提交到 `2a71d04`，本批（商号维度）改动**尚未提交**。
- 结算单身份口径：`import_batch.merchant_no`（商号）为唯一业务键；`order_no`（单号）用于界面展示，
  下拉框「以商号取值、按『商号（单号）』展示、字段名写作『商号』」是产品确认过的约定，
  不要改回柜号维度，也不要把展示顺序改回「单号（商号）」。
  注意：列表与表格里的「单号」列仍指单号本身，不要一并改掉。
- 前端旧路由 `/containers`、`/container-comparison` 保留重定向，旧 API 路径 `/api/analytics/containers*` 已删除。
- 2026-09-10 14:31–14:33 期间曾有另一个会话并发修改工作区（认证页 Portal 重构与端口调整）。
  该批改动已由本会话逐项复核、验证（后端 78 例 + 前端 30 例 + 构建全绿）后提交为
  `d9ea10a` / `3a67116` / `2a71d04`，不存在遗留的半成品改动。
- 认证页已抽出 `frontend/src/components/AuthPortal.vue` 作为登录/注册共用骨架；
  新增或修改认证页时请复用该骨架，不要各自复制布局。
- 默认路由：`/` → `/login`；已登录用户经 `guestOnly` 守卫跳 `/overview`；
  `/preview` 仍是公开只读演示页，但需直接访问，不再是默认入口。
- 系列与对比口径（ADR-009）：系列 = 单号 `order_no` 开头连续中文前缀；对比主体是结算单（商号），
  均价 = 销售金额 ÷ 件数（元/件）；一次最多勾选 6 张结算单；不传 `merchant_no` 时返回范围内全部结算单。
- 「系列对比」页的勾选变化会立即重新请求 `GET /api/analytics/series-comparison`（带 requestVersion 竞态保护），
  日期筛选仍需点击按钮，符合「筛选控件不自动查询」的既有约定。
- 仓库未配置全局 git 身份，已设置**仓库级** `user.name=Thomas Lin` / `user.email=bill56789@126.com`
  以与历史提交保持一致；如需更换请自行修改。
- 前端测试命令统一为 `npm --prefix frontend run test`，类型检查为 `npm --prefix frontend run typecheck`
  （Node 22+，本机 v26；不再手写 `node --experimental-strip-types`）。
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
- 结算单身份：商号唯一键与「商号（单号）展示 / 商号取值」的下拉框约定，变更需先新增 ADR。
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
backend/app/services/series_analytics_service.py  # 系列识别、A/B/C 指标、价差与系列汇总
frontend/src/views/SeriesComparisonView.vue       # 系列对比页
frontend/src/components/SeriesGradePriceChart.vue # A/B/C 均价对比图
frontend/src/components/SeriesGradeShareChart.vue # 等级件数占比图
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
npm --prefix frontend run test
npm --prefix frontend run typecheck
./scripts/handoff.sh
```

## Test Status

当前测试：PASS（2026-09-10 16:16 实测，对应「到达日期」文案统一后的工作区）

已通过：

- 后端 `pytest`：121 个用例全部通过，退出码 0（商号维度 108 + 系列对比 13）
- 前端 `npm --prefix frontend run test`：51 个用例全部通过，退出码 0（原有 43 + 系列对比 8；
  「到达日期」文案改动后于 2026-09-10 16:14 重跑通过）
- 前端 `npm --prefix frontend run typecheck`：通过（2026-09-10 16:15，退出码 0）
- 前端 `vite build`：成功（1915 modules，2026-09-10 16:15）
- 线上 MySQL 真实数据核对（`series_analytics_service`，2026-09-10 16:10）：
  4 张结算单合计 3,821 件 / ¥1,654,520 / 均价 ¥433.0071，与设计稿基线（¥433.01）一致；
  宝贝01/02/003 三张的 A/B/C 件数、金额、均价、价差与用户手算结果逐项一致。
- 浏览器端到端（Playwright + Chromium）：商号维度批次 15 + 23 项检查通过（系列对比页尚未做）。

失败：无

尚未测试：

- 「系列对比」页的浏览器端手工与端到端验收（自动化用例已覆盖，但无真实浏览器验收）
- 真实业务数据（当前线上只有 4 张示例结算单）覆盖不到的字段组合

## Git State

Branch：`dev`

Latest commits：

```text
3e50d9f fix(frontend): 下拉框改为商号在前展示避免误选
58d164b docs: 记录系列对比口径与实现范围
7703981 feat(frontend): 增加系列对比页面与图表
57468ee feat(backend): 增加按系列组织的结算单对比分析
2160b38 docs(agent): 更新交接状态
e0ce64b chore(project): 忽略本地工具状态与业务附件
9270c4b docs: 记录商号维度设计与迁移决策
bbcd09e refactor(frontend): 页面口径切换到商号维度
72e6d66 chore(frontend): 补充 test 与 typecheck 脚本
aaea0f8 feat(auth): 认证页接入本地榴莲主图
0160fdf refactor(backend): 以商号替换柜号作为结算单唯一键
```

Uncommitted changes：无；`.superpowers/`、`.superpowersigeria/`、`attachments/`
已加入 `.gitignore`，不会被提交。
