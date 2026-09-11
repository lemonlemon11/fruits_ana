# HANDOFF

Last updated：2026-09-11 16:20 (CST)
Written by：Codex（内容由当前工作区实测生成，非对话记忆）

## Current Goal

单号与商号命名适配（ADR-015 / ADR-016）均已交付：**原始写法 + 适配后写法双写落库，
页面统一展示适配后写法，原始写法保留可追溯**；线上 MySQL 迁移已执行、真实浏览器验收通过，
代码与文档已提交到 `dev`（尚未 push）。工作区剩余的未提交改动属并发会话的品牌化与预览页改造，见 In Progress。

## Current Status

状态：P0-1 / P0-2 / P0-3 / P0-4 均已完成 / COMMITTED

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
8. 本批在途改动已按主题拆分为 7 个代码 / 测试提交（`48b4ed5`..`a1e8bfd`），
   覆盖果农版导航、移动端底部导航、全站字号、商号筛选跟随、下拉自动刷新、
   单日趋势参考线、柱状图高度修复与回归测试。
9. 已验证当前批次：前端 62 项测试通过、`typecheck` 通过、`vite build` 成功；后端 pytest 通过。
10. P0-1 走查完成，发现并修复三处：移动端系列对比页横向溢出、`.xls` 文档与实现不一致、
    ADR-010 接口参数名与实现不一致；P0-2 / P0-3 浏览器验收已通过。
11. **单号命名适配（15:20–15:55）**：新增 `services/order_no_naming.py`（统一命名纯函数）、
    `import_batch.order_no_normalized` 列与幂等迁移脚本；导入、查询、导出、AI 数据包与
    11 处前端展示位全部改为「适配后单号优先、原始单号可追溯」，见 ADR-015。
12. **商号规范化（16:00–16:20）**：新增 `services/merchant_no_naming.py` 与
    `import_batch.merchant_no_normalized` 列（迁移改用通用工具 `scripts/column_backfill.py`）；
    接口、导出、AI 数据包（`PROMPT_VERSION` `v3 → v4`）与前端展示统一用适配后商号，
    **唯一键 / 接口参数 / 下拉取值 / `?selected=` 仍是原始 `merchant_no`**，见 ADR-016。
    线上迁移已执行（4 行：`单637→637`、`单624→624`、`626`/`640` 不变），浏览器验收通过。

## Completed

- [x] `4823631 feat(backend): 单号商号双写并增加回填迁移`（含 10 项双写用例）
- [x] `294cf2f feat(frontend): 统一图表图例与悬浮提示`
- [x] `03dbb6d feat(frontend): 页面统一展示适配后单号与商号`
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

工作台外壳改版（2026-09-11，**已提交 `668f572`**）：

- `frontend/src/AppShell.vue`：新增顶部 header（左侧品牌与当前页面、右侧当前用户名与「退出登录」），
  侧栏底部账号区上移、侧栏品牌区移除；新增页签栏，首页 `/overview` 固定不可关闭，
  其余可单个关闭或「关闭其他」，关闭当前页签激活右侧邻居（无右侧退回左侧），
  页签超出可视宽度时自动滚动到当前页签；移动端合并为单条 header，≤430px 只留品牌图标。
- 新增 `frontend/src/utils/shellTabs.ts`（`openTab` / `closeTab` / `closeOtherTabs` /
  `nextActivePath` / `restoreTabs`）与 7 项用例 `frontend/tests/shell-tabs.test.ts`；
  页签存 `sessionStorage`（键 `fruits-ana:open-tabs`），登录页不记录页签，退出登录后清空。
- `styles-shell.css` 改为「header + body（侧栏 / 工作区）」两段式栅格；
  `styles-responsive.css` 同步把 `.app-shell` 的列定义改到 `.app-body`（否则 ≤1100px 列会错位）。
- 验证：前端 104 项 + `typecheck` + `vite build` 通过，后端 233 项通过；
  53002 实例 + Chromium 实测（临时账号，已清理）：初始 1 个页签、点导航新增页签、重复进入不新增、
  关闭当前页签跳右侧邻居、首页无关闭按钮、「关闭其他」生效、刷新后页签保留、
  移动端 360 / 390px 无横向溢出且 header 稳定 60px。

单号命名适配（2026-09-11，代码 + 迁移 + 浏览器验收完成，**已提交 `4823631` / `03dbb6d`**，ADR-015）：

- 统一规则集中在 `backend/app/services/order_no_naming.py`：NFKC 归一 → 取开头连续中文为系列 →
  去分隔符 / 字母大写 → 序号数字左补零 3 位 → `系列-序号`
  （`宝贝003 → 宝贝-003`、`宝贝01 → 宝贝-001`、`宝贝L004 → 宝贝-L004`）；识别不出中文系列时原样返回。
- 落库双写：`import_batch.order_no`（原始）与 `import_batch.order_no_normalized`（适配后）；
  迁移脚本 `backend/scripts/add_order_no_normalized.py`（幂等 / 默认演练 / `--force` 重算 / 自动 SQL 快照）。
- 接口：`/api/imports`、`/api/settlements`、`/api/settlements/{merchant_no}/records`、
  `/api/analytics/{overview,settlements/{merchant_no},settlement-comparison,series-comparison}`
  均追加 `order_no_normalized`；导出 xlsx 元数据为「单号（适配后） + 原始单号」，
  导出文件名带适配后单号；AI 系列数据包 `PROMPT_VERSION` `v2 → v3`。
- 前端：新增 `utils/orderNo.ts`（`displayOrderNo` / `rawOrderNo`），11 处展示位统一走适配后单号，
  原始单号放 tooltip 或副标题；导入记录以适配后单号为标题、原始文件名作副标题。
- 验证：后端 223 项通过；前端 97 项 + `typecheck` + `build` 通过；线上迁移已 `--apply`
  （4 行回填为 `宝贝-001/002/003/L004`）；临时 8010 + 53011 实例 + Chromium 实测
  数据明细 / 导入记录 / 系列对比总览显示适配后单号且无控制台报错（临时账号已清理）。
- 注意：改完后端必须重启 `./start.sh`，否则 8000 端口仍是旧代码（见 Known Issues 4）。

商号规范化（2026-09-11，代码 + 迁移 + 浏览器验收完成，**已提交 `4823631` / `03dbb6d`**，ADR-016）：

- 统一规则集中在 `backend/app/services/merchant_no_naming.py`：NFKC 归一 → 去掉所有空白 →
  去掉开头「单」前缀（可重复）→ 字母大写（`单637 → 637`、`单624 → 624`、`626` / `640` 不变）；
  去掉「单」后为空时原样返回。
- 落库双写：`import_batch.merchant_no`（原始）与 `import_batch.merchant_no_normalized`（适配后）；
  迁移脚本 `backend/scripts/add_merchant_no_normalized.py`，复用新增的通用工具
  `backend/scripts/column_backfill.py`（幂等 / 默认演练 / `--force` 重算 / 自动 SQL 快照）。
- **`merchant_no` 仍是业务唯一键、接口参数、前端下拉取值与地址栏 `?selected=` 的值**，
  只有展示走 `merchant_no_normalized`；「最高价商号 / 最低价商号」等文案改用适配后商号。
- 接口 `order_no_normalized` 旁追加 `merchant_no_normalized`；导出 xlsx 元数据为
  「商号（适配后） + 原始商号」、文件名 `settlement-{适配商号}-{适配单号}.xlsx`；
  AI 系列数据包 `PROMPT_VERSION` `v3 → v4`，旧缓存自动失效。
- 前端：新增 `utils/merchantNo.ts`（`displayMerchantNo` / `rawMerchantNo`）；数据明细、
  导入记录副标题、总览经营异常、结算单详情、系列对比总览与均价图统一展示适配后商号，
  原始商号放 tooltip；下拉标签为「商号 624（宝贝-001）」。
- 验证：后端 233 项通过（含 `test_merchant_no_naming.py` 6 项、`test_merchant_no_migration.py` 4 项）；
  前端 110 项 + `typecheck` + `build` 通过；线上迁移已 `--apply`
  （4 行：`单637→637`、`单624→624`、`626`/`640` 不变，快照
  `backend/data/snapshot-merchant-no-20260911-075941.sql`）；重启 8000 + 53000 后 Chromium 实测
  数据明细显示 `637/624/626/640`（`单637`/`单624` 落在 title）、筛选下拉与选择器标签为
  「商号 624（宝贝-001）」、导入记录副标题含「商号 XXX」，无控制台报错，临时账号已清理。

图表图例与悬浮提示已统一（2026-09-11，自动化 + 真实浏览器验证通过，**已提交 `294cf2f`**）：
涉及 `TrendChart`、`GradePieChart`、`GradeSummary`、`SeriesGradePriceChart`、`SeriesGradeShareChart`、
`SeriesGradeDetail`、`SeriesOverviewTable` 与公开预览页 `/preview`（折线图 + 环形图）。
新增共享组件 `ChartLegend.vue` / `ChartTooltip.vue` 与 `utils/chartTooltip.ts`；
公开预览页的环形图由硬编码 `conic-gradient` 改为按数据绘制的 SVG；
原生 `<title>` 提示全部由统一的跟随式提示替代。验证：前端 90 项测试、`typecheck`、`vite build` 通过，
Chromium 实测 9 处图表悬浮提示均按预期出现（见 `frontend/tests/chart-tooltip.test.ts`）。

等级细分已开发完成（2026-09-11），**待真实浏览器端到端验收**；下一阶段按 `docs/TODO.md` 的 P1 继续
（候选：元/KG 口径、单位经营结果与费用结构）。

本轮交付（2026-09-11，代码已完成、自动化验证通过、**已提交到 `dev`**）：

1. 后端新增 `parser/grade_detail.py`（号别解析，口径方案 A，按果类可插拔）、
   `services/grade_detail_service.py`（号别聚合）、
   `services/grade_detail_analysis_service.py`（号别 AI 小结）。
2. `GET /api/analytics/series-comparison` 响应**追加** `grade_details` 字段（不改已有字段）。
   新增 `POST /api/analytics/grade-detail/analysis`。
3. `ai_analysis_service` 抽出可复用的 `read_cache` / `write_cache`，`build_cache_key` 支持
   按 feature 传入提示词版本；AI 结论渲染抽到通用组件 `AiAnalysisCard.vue`。
4. 前端「系列对比」页新增「按系列 / 按等级号别」视图切换，新增
   `SeriesGradeDetail.vue`、`GradeDetailAiAnalysis.vue`；`types.ts` / `normalize.ts` / `client.ts` 已同步。
5. 验证：后端 **208 项** pytest 通过；前端 **73 项**通过、typecheck 通过、vite build 成功；
   用 dev-preview 在 53001 实测桌面 1440px 与移动 390px：16 个号别桶、0 未识别、无横向溢出、无控制台报错。

提交记录（`dev`，尚未 push）：

- `37373cd feat(backend): 增加等级细分解析聚合与号别小结`
- `b920a1c feat(frontend): 系列对比增加按等级号别视图`
- `d1005f1 feat(frontend): 提升系列对比图表与表格可读性`

代码审查修正（2026-09-11）：`grade_detail_metrics` 改为每条记录只解析一次
（原实现在聚合循环里二次解析）；`AiAnalysisCard` 标题 id 改用 `useId()`，
避免同页两张卡片出现重复 DOM id。

### AI 结论深化与展示（2026-09-11，已提交 `b54db83`）

- 结论改为「后端先算对比、模型只做解读」：新增结算单价差排名与极值差、等级结构信号、
  号别价格排名、同级号别价差、同号别跨结算单价差、品质标记对比、大等级汇总，见 ADR-014。
- 提示词升级为「结论 + 比较 + 建议」（`PROMPT_VERSION`：系列 `v2` / 等级细分 `v3-schemeA`）。
- 前端 AI 卡片改为主色强调卡 + 关键数字高亮 + 建议小节暖色底。
- 已用真实 DeepSeek（`deepseek-v4-flash`）跑通两类结论，输出可直接落地。

### 结算单选择器交互改造（2026-09-11，未提交）

- 原因：平铺全部结算单在单量增长后不可用，且每勾一下请求一次。
- 采用**抽屉式选择器**：主页面只留已选 chips + 选择按钮，抽屉内搜索 / 系列折叠 /
  草稿勾选，点「确定」才刷新一次。设计见
  `docs/superpowers/plans/2026-09-11-settlement-picker.md`。
- 新增 `utils/settlementPicker.ts`、`components/SettlementPicker.vue`；
  `SeriesComparisonView.vue` 移除平铺列表与逐次请求逻辑。
- 补齐三项：Tab 焦点锁在抽屉内；抽屉内可切换「按系列 / 最近到达」排列；
  已选写入地址栏 `?selected=`，分享链接可还原、清空即删除。
- 验证：前端 80 项通过、typecheck 通过、build 成功；53001 dev-preview 实测
  桌面 1440px 与移动 390px 的搜索、取消、确定、系列折叠与全选，均无控制台报错与横向溢出。
- 预览工具已入库：`frontend/dev-preview/` 的预览代码进入 Git，
  含真实数据的 `fixture.json`、`grade-detail-data.js`、`review-data.ts` 已加入 `.gitignore`。

口径已定（ADR-013 修订）：方案 A（区间原样成桶）、品质后缀只做标记、不新增一级菜单、
果类可插拔、AI 小结一起做。

「系列对比」与「到达日期」文案统一均已完成开发与自动化验证；「系列对比」页及 AI 分析结论
仍等待真实浏览器验收（见 `docs/TODO.md`）。

新增（2026-09-11，只读分析，无代码改动）：完成全系统走查（前端体验 / 后端数据链路 /
线上库只读盘点），产出优化方案、数据挖掘地图与评审会议方案，见
`docs/superpowers/plans/2026-09-11-system-review-and-meeting.md`。
已确认（2026-09-11）：① 清关费以清关单为准，没有即为没有，单 640 应付 384,740 元为真实值
（ADR-012）；② 下一阶段主线为「等级细分」（ADR-013），实施计划见
`docs/superpowers/plans/2026-09-11-grade-detail-analysis.md`。
仍待确认：细分号别区间（如 `B6/7`）的归属规则。（商号规范化已于 2026-09-11 交付，见 ADR-016。）

## Incidents（已解决）

### 「A/B/C 平均每件售价对比」柱状图不显示（2026-09-10）

- 现象：系列对比页该图只剩等级标题、金额文字和单据名，柱子看不见（疑似没渲染）。
- 排查：接口侧正常——直接调用 `get_series_comparison` 拿到真实数据，
  `spread.grade_prices` 有 A/B/C 三个均价，前端 `gradePrice()` 取值不为空。
  用 Playwright 打开真实页面（拦截接口注入同一份真实数据）后实测：
  12 根 `.price-bar` 的 inline 高度分别是 `88.83% / 98.08% / 100% …`，
  但 `getBoundingClientRect().height` 全是 **2px**（即 `min-height: 2px` 兜底值）。
- 根因：`.price-bars` 用 `align-items: flex-end`，`.price-bar-item` 高度收缩到内容高度（43px），
  其网格 `1fr` 行高度不确定，柱子上的百分比高度按 CSS 规则退化成 `auto`，于是塌成 2px。
- 处理：`.price-bars` 改为 `align-items: stretch`（`min-height: 132px` 保留），
  让 `.price-bar-item` 拿到确定高度，百分比柱高才能生效。
- 验证：同一脚本复测，桌面与 390px 移动端柱高均为 52~91px，最大值对应最高价、组内比例正确；
  新增回归用例 `frontend/tests/comparison-chart.test.ts`「价格柱状图的柱高容器必须拉伸」。
- 经验：本项目图表是手写 CSS/SVG，**百分比高度必须落在有确定高度的父容器上**；
  新增/改动柱状图后先在浏览器量一次 `getBoundingClientRect().height`，别只看代码。

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
   a. 与并发会话确认品牌化改动的处理（`AGENTS.md` / `backend/app/main.py` / `backend/app/__init__.py` /
      `frontend/index.html` / `AuthPortal.vue` / `RegisterView.vue` / `styles-auth.css` /
      `dev-preview/**` / `public/**` / `BrandMark.vue` / `PublicPreviewView.vue`）：
      这些**不属于命名适配**，不要混进命名相关提交，先确认归属再提交。
   b. 系列对比后续能力：到港日期字段与一次库迁移、元/KG 口径、Excel 导出、系列别名字典。
   c. 真实业绩数据到位后的整体回归验收（目前线上只有 4 张示例结算单）。
   d. 根目录 `.env` 中未使用的 `FRUIT_ANALYSIS_AI_*` 配置确认去留（见 Known Issues 1）。
3. 改完后端记得重启 `./start.sh`（Known Issues 4）；每次改动后运行基线验证，再按功能提交。

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

### Issue 4 — 改完后端必须重启服务，否则页面拿到旧数据（高频坑，已确认两次）

- 现象：前端已是新代码，但接口少了新字段（例如「按等级号别」页数据为空、
  或「数据加载失败 / not found」）。
- 根因：`start.sh` 起的 uvicorn **没有 `--reload`**，进程只在启动时加载一次代码；
  磁盘改了、服务没重启，接口就仍是旧行为。前端 vite 有 HMR，所以问题只出在后端。
- 排查顺序（30 秒内可确认）：
  1. `ps -eo pid,lstart,args | grep uvicorn` 看进程启动时间是否早于最近的代码改动；
  2. `curl -s http://127.0.0.1:8000/openapi.json` 看新路由是否存在；
  3. 两者任一不符 → 直接重启服务。
- 处理：

  ```bash
  systemctl restart fruits-ana.service
  ```

  该 unit 是 transient systemd unit，**同时托管 8000 后端与 53000 前端**；重启后浏览器需刷新。
- 注意：机器上还有其它项目（如 `stock-analyzer`）的 uvicorn 进程，**不要按进程名批量 kill**，
  只重启本项目这个 unit。
- 可选改进（未做，需确认）：给开发环境的 uvicorn 加 `--reload`，改完自动生效；
  代价是 `start.sh` 属根级启动配置，改动需评审。

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
- 当前分支 `dev`，领先 `origin/dev` 若干提交（含本批等级细分），**尚未 push**。
- `frontend/dev-preview/` **未加入 `.gitignore`**，其中 `fixture.json` 含真实结算单数据，
  提交时必须用显式路径、禁止 `git add -A`；是否纳入忽略清单待确认。
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
- 单号双写口径（ADR-015）：`order_no` 是原始写法、`order_no_normalized` 是适配后写法，
  页面 / 导出 / AI 一律展示适配后写法；不得改写 `order_no`，也不得直接渲染 `order_no`。
- 商号双写口径（ADR-016）：`merchant_no` 是原始写法且**仍是唯一键 / 接口参数 / 下拉取值 /
  `?selected=` 的值**；`merchant_no_normalized` 只用于展示（页面 / 导出 / AI），
  不得把取值或查询键改成适配后商号，也不得直接渲染 `merchant_no`。
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
backend/app/services/order_no_naming.py           # 单号统一命名（系列识别 + 适配后单号，ADR-015）
backend/app/services/merchant_no_naming.py        # 商号统一命名（去「单」前缀，ADR-016）
backend/scripts/column_backfill.py                # 通用「加列 + 回填」迁移工具（幂等 / 演练 / --force）
backend/scripts/add_order_no_normalized.py        # 适配后单号加列与回填（基于 column_backfill）
backend/scripts/add_merchant_no_normalized.py     # 适配后商号加列与回填（基于 column_backfill）
frontend/src/utils/orderNo.ts                     # displayOrderNo / rawOrderNo 展示口径
frontend/src/utils/merchantNo.ts                  # displayMerchantNo / rawMerchantNo 展示口径
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

服务由 transient systemd unit 托管时（当前线上开发环境即如此），**后端改完必须重启**：

```bash
systemctl restart fruits-ana.service   # 同时重启 8000 后端与 53000 前端
systemctl is-active fruits-ana.service # 确认 active
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

当前测试：PASS（2026-09-11 16:20 实测：后端 234 项、前端 110 项，含单号与商号命名适配）

### 单号命名适配（2026-09-11）

- 后端 `pytest`：**223 项通过**，退出码 0（新增 `test_order_no_naming.py` 6 项、
  `test_order_no_migration.py` 4 项、`test_import_service` 1 项，并同步 `test_settlements_api` 断言）
- 前端 `npm test`：**97 项通过**，退出码 0（新增 `order-no-normalized.test.ts` 7 项）
- 前端 `npm run typecheck`：通过（退出码 0）；`npm run build`：成功
- 线上 MySQL 迁移：`scripts.add_order_no_normalized --apply` 已执行，快照
  `backend/data/snapshot-order-no-20260911-070729.sql`；4 行回填完成、无未回填行
- 服务层核对（真实 MySQL）：`list_settlements` / `series-comparison` / `settlement_detail` /
  `overview` / `settlement-comparison` 均返回 `order_no_normalized`，系列分组不变
- HTTP 链路（临时 8010 实例 + 真实 MySQL + 临时账号）：`/api/settlements`、`/api/imports`、
  `/api/analytics/series-comparison` 返回 200 且含适配后单号；临时账号已清理
- Chromium（临时 53011 前端 + 8010 后端）：数据明细列显示 `宝贝-L004/-003/-002/-001`
  且 title 保留「原始单号」；导入记录标题为适配后单号、副标题保留原始文件名；无控制台报错
- 重启后正式实例验收（2026-09-11 15:45 `./start.sh` 重启，8000 + 53000 均加载新代码）：
  `GET /api/settlements`、`GET /api/imports` 均返回 `order_no_normalized`；
  Chromium 实测数据明细列为 `宝贝-L004/-003/-002/-001`（title 为「原始单号：…」）、
  导入记录标题为适配后单号；无控制台报错；临时验收账号已清理
- **未验证**：导入新文件时的真实入库回填（已由 `test_import_service` 单测覆盖，
  未用真实文件走 HTTP 上传）

### 测试环境注意（2026-09-11 踩坑）

`backend/tests/conftest.py` 把测试库固定为 `backend/.pytest-tmp/fruit-analysis-test.sqlite3`，
**所有会话共用同一个文件**。若两个 Codex 会话同时跑 pytest，会出现
`no such table` / `table user already exists` / `disk I/O error` 等互相踩踏的假失败
（同一份代码时跑通时跑挂）。经验：跑后端测试前先确认没有其它会话在跑 pytest；
若看到上述报错且单独跑某个文件能过，优先怀疑并发而不是代码。

### 商号规范化（2026-09-11，ADR-016）

- 后端 `pytest`：**234 项通过**，退出码 0（新增 `test_merchant_no_naming.py` 6 项、
  `test_merchant_no_migration.py` 4 项；`test_order_no_migration` 在脚本重构为
  `column_backfill` 后仍通过）
- 前端 `npm test`：**110 项通过**，退出码 0（新增 `merchant-no-normalized.test.ts` 6 项）；
  `npm run typecheck` 通过（退出码 0）；`npm run build` 成功（vite 6.4.3，1942 modules）
- 线上 MySQL 迁移：`scripts.add_merchant_no_normalized` 先演练后 `--apply`，
  快照 `backend/data/snapshot-merchant-no-20260911-075941.sql`；
  真实 MySQL 查询核对 4 行：`(单637→637)`、`(单624→624)`、`626→626`、`640→640`，
  `merchant_no` 与 `merchant_no_normalized` 两列都在且有值
- 服务重启：`./start.sh` 重启 8000 + 53000（16:00 启动，setsid 脱离会话保持常驻）
- HTTP 链路（真实 MySQL + 临时账号 `tmp_check_merchant`，已清理）：`GET /api/settlements`
  返回 `merchant_no`/`merchant_no_normalized`（`单637`↔`637`）、`GET /api/imports` 同字段齐全
- Chromium（53000 正式实例）：数据明细商号列显示 `640 / 637 / 626 / 624`，
  `单637` / `单624` 落在 title「原始商号：…」；筛选下拉与选择器标签为
  「商号 640（宝贝-L004）」等；导入记录标题为适配后单号、副标题含「商号 637」；无控制台报错

### 等级细分（2026-09-11）

- 后端 `pytest`：**208 项通过**，退出码 0（原 78 项 + 新增 130 项：
  `test_grade_detail` 55、`test_grade_detail_service` 6、`test_grade_detail_analysis` 7，
  以及 `test_series_analytics` 新增 1 项）
- 前端 `npm --prefix frontend run test`：**73 项通过**，退出码 0（新增 `grade-detail.test.ts` 6 项）
- 前端 `typecheck`：通过；`vite build`：成功（1926 modules，215.93 kB）
- 真实 MySQL 数据核对：4 张结算单 → 16 个号别桶、0 条未识别，件数合计 3,821 与总量一致
- Playwright + Chromium（dev-preview，53001）：桌面 1440px 与移动 390px 均无横向溢出、
  无控制台报错；切换「按等级号别」后 16 个号别行、3 个分组、16 行数据表，标题为
  「按等级号别看价格」+「号别小结」
- HTTP 链路验证（覆盖鉴权，打真实 MySQL）：`GET /api/analytics/series-comparison` 返回 200，
  含 `grade_details`（16 桶）
- **未验证**：真实浏览器登录后的端到端流程（含真实大模型调用）；`POST /api/analytics/grade-detail/analysis`
  仅由单元测试覆盖，未真实调用大模型（避免产生费用）

### 追加验证（2026-09-10 16:30，商号筛选修复）

- 前端 `npm --prefix frontend run test`：58 个用例通过，退出码 0
  （含本次新增 `overview-merchant-filter.test.ts` 2 项；计数同时包含并行会话的 AI 分析用例）
- 前端 `npm --prefix frontend run typecheck`：通过，退出码 0
- 前端 `vite build`：成功（1919 modules）
- 后端 `pytest`：通过，退出码 0（本次未改后端，用于确认工作区未被破坏）
- Playwright + Chromium 真实浏览器（真实 MySQL 数据）：选择商号后
  `结算单销售情况` 收敛为该商号 1 行、趋势图标题带商号、单日商号显示参考线；未选择时为全部结算单。
  商号下拉切换后无需点击按钮即刷新（按钮仍保留），仅改到达日期时列表不变、点击「查看结果」后才刷新

已通过：

- 后端 `pytest`：136 个用例全部通过，退出码 0（含本次 AI 分析 15 项）
- 前端 `npm --prefix frontend run test`：58 个用例全部通过，退出码 0（含 AI 分析 5 项）
- 前端 `npm --prefix frontend run typecheck`：通过（退出码 0）；`vite build`：成功
- AI 分析真实联调（临时 8010 实例 + 真实 MySQL 数据 + 真实 DeepSeek 调用）：
  3 张单据返回 200，件数 2848 / 金额 1242280 / 平均每件 436.19 元与表格一致；
  同一条件二次调用 `cached=true` 且内容一致；联调期间创建的临时账号已清理。

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
4823631 feat(backend): 单号商号双写并增加回填迁移
294cf2f feat(frontend): 统一图表图例与悬浮提示
03dbb6d feat(frontend): 页面统一展示适配后单号与商号
668f572 feat(frontend): 外壳增加顶部 header 与页签栏
bbbce09 docs: 修正导入文件类型与日期接口参数口径
09dfb4b fix(frontend): 修复系列对比移动端横向溢出
168f126 docs: 记录果农版简化设计并更新交接与待办
a1e8bfd test(frontend): 更新界面与筛选交互守卫
4dbe9b8 style(frontend): 全站字号统一并修正表格文字对齐
c773dd8 fix(frontend): 修复系列对比均价柱状图高度塌缩
fe586aa fix(frontend): 单日趋势图增加参考线与提示
d2d8a3e fix(frontend): 商号下拉默认选中并切换立即刷新
9f7bb11 fix(frontend): 总览页结算单销售情况跟随商号筛选
48b4ed5 feat(frontend): 果农版主导航收敛并增加移动端底部导航
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

Uncommitted changes（2026-09-11 16:20 实测，均为本地未提交，**属并发会话的品牌化改动，不是命名适配**）：

- `AGENTS.md`、`backend/app/main.py`、`backend/app/__init__.py`、`frontend/index.html`
  （项目名改为「SLD-水果市场销售分析」）；`frontend/src/components/AuthPortal.vue`、
  `frontend/src/views/RegisterView.vue`、`frontend/src/styles-auth.css`（认证页视觉）；
  `frontend/src/views/PublicPreviewView.vue`（预览页品牌 + 本轮已提交的口径在其工作区副本里仍在）；
  `frontend/dev-preview/**`、`frontend/public/**`、`frontend/src/components/BrandMark.vue`（新品牌资产）。
- 本轮的命名适配代码与文档已全部提交（见 Latest commits，文档随本提交一起落库）。
- `.superpowers/`、`.superpowersigeria/`、`attachments/`、`backend/data/` 已被 `.gitignore` 忽略，不会提交。
