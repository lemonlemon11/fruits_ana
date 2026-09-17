# Architecture

> 维护约定：系统结构、模块职责、数据流发生变化时必须更新本文件。
> 最后更新：2026-09-17

## System Overview

单体前后端分离应用：Vue 3 SPA + FastAPI + MySQL。前端只通过 `/api` 与后端通信，
生产环境由 Nginx 提供构建后的静态资源，并把 `/api` 代理到 `127.0.0.1:8000`；
开发环境由 Vite 代理到 `127.0.0.1:8000`。

```text
Browser (Vue 3 SPA, Nginx :53000)
        │  /api/*  (Nginx proxy)
        ▼
FastAPI (:8000)  backend/app/main.py
        ├── api/auth.py      注册 / 登录 / 会话
        ├── api/imports.py   上传、批次列表、问题明细
        ├── api/analytics.py 总览 / 趋势 / 结算单对比 / 结算单详情 / 品牌对比 / 等级细分小结
        ├── api/ask.py       自然语言数据问答「顺仔」（function calling 编排）
        ├── api/entry.py    手工录单读取、保存、修改、字段选项与模板导出
        ├── api/settlements.py 数据明细列表 / 单张结算单全部明细
        └── api/exports.py   总览 CSV、结算单 xlsx、原始文件下载
        ▼
services/  analytics_core / settlement_analytics_service / series_analytics_service
           grade_detail_service / grade_detail_analysis_service / ai_analysis_service
           overview_service / settlement_detail_service / settlement_list_service
           import_service / issue_service / entry_service / entry_export
           ask_service / ask_tools / ask_payloads / ask_tool_schemas
        ▼
parser/    settlement_parser / settlement_summary / decimal_values / grade_detail
        ▼
SQLAlchemy 2.0 (models.py) → MySQL

Filesystem: backend/data/uploads/  原始上传文件（已 gitignore）
```

## Main Components

### Authentication（`backend/app/auth.py`、`backend/app/api/auth.py`）

- 职责：Argon2 密码哈希、服务端会话、HttpOnly Cookie 认证、依赖注入 `require_user`。
- 会话 token 以 SHA-256 哈希落库（`user_session.token_hash`）；登录默认有效期 7 天，
  勾选“30 天内免登录”时延长为 30 天，服务端到期时间与 Cookie `Max-Age` 保持一致。
- 主要路由：`POST /api/auth/register`、`POST /api/auth/login`、`GET /api/auth/me`、`POST /api/auth/logout`。
- 前端：`frontend/src/auth.ts`（`.vue` 侧会话状态）、`frontend/src/views/LoginView.vue`、`RegisterView.vue`。

### Import Pipeline（`backend/app/api/imports.py`、`services/import_draft_service.py`、`parser/`）

- 职责：接收 `.xlsx` / `.csv`，先解析成草稿并进入二次确认，用户确认后才写入批次、源文件、
  销售记录、结算摘要与数据问题。
- 身份：以商号（`import_batch.merchant_no`）作为结算单唯一业务键；柜号可为空且可重复。
- 覆盖：同一商号再次上传返回 `conflict`，确认后以 `?overwrite=true` 在同一事务内替换旧结算单。
- 等级映射：由 `fruits_ana_admin` 的字段转换规则动态生成；默认 `BC → C`，`AB` 默认独立。
  `sale_record.grade_raw` 始终保留用户原始写法，`sale_record.grade` 保存转换后的统计等级。
- 单号双写（ADR-015）：原始单号写入 `import_batch.order_no`，
  同时按 `services/order_no_naming.py` 的规则写入适配后的 `order_no_normalized`
  （`宝贝003 → 宝贝-003`）；页面只展示适配后单号，原始写法保留可追溯。
- 商号双写（ADR-016）：原始商号写入 `import_batch.merchant_no`，
  同时按 `services/merchant_no_naming.py` 的规则写入适配后的 `merchant_no_normalized`
  （`单637 → 637`、`单624 → 624`）；**`merchant_no` 仍是唯一业务键与接口参数**，
  仅页面 / 导出 / AI 数据包展示适配后商号，原始写法保留可追溯。
- 缺失字段或未知等级的行不写入销售事实，其余有效行继续导入，并生成 `data_issue` 明细。
- 原始文件保存在 `backend/data/uploads/`（不入库、不提交 Git）。
- 新模板多文件闭环：`POST /api/imports/preview` 只创建 `import_job` / `import_draft`；
  `GET/PUT /api/imports/jobs/{job}/drafts/{draft}` 回填并保存修改；
  `POST /api/imports/jobs/{job}/confirm` 对全任务草稿做阻断/冲突校验后一次确认入库，
  明细金额按 `数量×单价` 重算，文件合计保留在 `settlement_summary.file_*` 供对账。
- 修改留痕：二次确认页的草稿修改写入 `settlement_revision`（关联 `import_draft_id`）；
  手工录单覆盖保存时写入同一表（关联 `import_batch_id`），避免两类修改无审计轨迹。

### Manual Entry（`backend/app/api/entry.py`、`services/entry_service.py`、`services/entry_export.py`）

- 职责：不依赖 Excel 文件直接录入结算单，保存后以 `source_type='manual'` 进入原有分析链路；
  支持读取、覆盖保存、按模板导出，并读取管理端维护的录单字段字典。
- 路由：`GET /api/entry/field-options`、`POST /api/entry`、`GET/PUT /api/entry/{merchant_no}`、
  `GET /api/entry/{merchant_no}/export.xlsx`。
- 权限：对应 `entry:view` / `entry:create` / `entry:update` / `entry:export`，由管理端维护。
- 冲突与覆盖：`merchant_no` 仍是唯一键；新录同商号默认 409，确认后 `overwrite=true` 覆盖；
  `PUT` 只允许修改 `source_type='manual'` 的单据。
- 汇总口径：销售金额 = 销售数量 × 单价；货款合计 = 销售金额 − 售后合计；
  应付贵方总金额 = 货款合计 − 费用合计。金额计算后端统一用 `Decimal`。
- 导出：`entry_export` 读取模板 `attachments/结算单模板样式.xlsx`，按动态行数插入行、
  重建合并单元格，只写值不保留公式。

### Analytics（`backend/app/api/analytics.py`、`services/*`）

- 职责：总览指标、各等级趋势、结算单对比、结算单摘要与明细。
- `analytics_service` 为兼容门面；`analytics_core` 提供筛选与指标，`settlement_analytics_service`
  提供对比/详情/异常，`overview_service`、`settlement_detail_service` 负责具体聚合。
- 查询维度：`merchant_no`；柜号不再是查询条件。
- 指标口径见 `README.md`，任何口径变化必须记入 `DECISIONS.md`。

### Series Analytics（`backend/app/api/analytics.py`、`services/series_analytics_service.py`）

- 职责：「品牌对比」页的数据来源：按勾选结算单核算各等级独立指标与品牌汇总；
  页面只允许选择同一品牌，后端在传入 `merchant_no` 时校验品牌唯一。
- 路由：`GET /api/analytics/series-comparison`，参数为可重复的 `merchant_no`，外加
  `start_date` / `end_date`；不传 `merchant_no` 时返回日期范围内全部结算单。
- 品牌识别：取结算单单号（优先适配后的 `order_no_normalized`，回落 `order_no`，
  如 `宝贝-001` / `宝贝01`）开头连续的中文前缀作为品牌名；
  识别不出时归入「未识别品牌」，不影响其余结算单参与对比。见 ADR-009。
- 返回结构：`settlements`（逐结算单）、`series`（逐品牌汇总）、`total`（全部所选合计），
  三者使用同一套口径：`total` / `grades` / `grade_amount_shares` / `spread`。
- 注意：品牌只允许同品牌参与对比；对比与查询的唯一键仍是商号 `merchant_no`。

### Settlement List（`backend/app/api/settlements.py`、`services/settlement_list_service.py`）

- 职责：「数据明细」页列表与单张结算单全部明细。
- 默认范围：最新销售日期往前一个自然月；可用 `start_date` / `end_date` / `merchant_no` 覆盖。

### Ask（`backend/app/api/ask.py`、`services/ask_service.py`、`services/ask_tools.py`）

- 职责：自然语言数据问答「顺仔」。`POST /api/ask` 接收 `question` / `history`，返回
  `answer` / `steps` / `model`；`steps` 记录本次实际调用的工具与参数，前端用于展示溯源。
- 方案：Text-to-API（ADR-023）。模型只做工具选择与措辞，数字来自 `ask_tools.py`
  调用现有分析服务的精简结果；`ask_payloads.py` 只保留聚合字段，`ask_tool_schemas.py`
  维护 5 个只读工具的 function-calling 声明。
- 权限：整个路由要求 `ask:view`（管理端角色授权），当前只有 `fruit_admin` 持有；
  前端 `AppShell.vue` 的 `canAsk` 依同一权限决定是否渲染悬浮入口，未授权用户看不到按钮也调不动接口。
- 边界：不生成 SQL、不写库；工具失败以 `{"error": ...}` 交回模型改参数重试；
  最多 3 轮工具调用，最后兜底要求直接回答；回答数字必须原样取自工具结果。
- 入口：正式外壳右下角悬浮机器人「顺仔」（`components/AskWidget.vue` + `ask-widget.css`，
  纯逻辑在 `utils/askWidget.ts`），点击展开微信式左右气泡对话窗；`AppShell.vue` 通过
  `update:open` 让「回顶部」按钮在窗口打开时避让，二者不重叠。历史预览页
  `frontend/dev-preview/ask-demo.html`（53001）保留作留档，不再作为入口。
- 移动端：≤820px 对话窗改为整屏并跟随 `visualViewport`（`AskWidget.vue` 写入
  `--ask-vv-height` / `--ask-vv-top`，取不到有效高度时回落 `100dvh`），软键盘弹出时整窗收缩，
  输入区始终在键盘上方；顶部 / 底部按 `env(safe-area-inset-*)` 避让刘海与横条；站内通知横幅
  在对话窗打开时让位（`AppShell.vue` 的 `!askOpen`）。

### Grade Detail（`backend/app/parser/grade_detail.py`、`services/grade_detail_service.py`）

- 职责：把 `sale_record.grade_raw` 解析成「大等级 + 号别」的细分标签，用于等级阶梯分析。
- 口径（ADR-013，方案 A）：单号各自成桶（`A5`、`A6`）；区间**原样成桶**（`B6/7`、`BC5/7/8`）；
  品质后缀（熟 / 裂 / 黄皮）**只做标记**，不参与分桶；`BC` 仍归入 `C`。
- 可插拔：解析规则按果类注册（`register_fruit_grade_parser`），未识别的写法归入「其他」并计数，
  不静默丢弃；聚合键为「果类 + 标签」，出现第二种水果时自动分组。
- 挂载点：`GET /api/analytics/series-comparison` 响应追加 `grade_details` 字段
  （`buckets` / `unrecognized` / `total`），不改动已有字段。

### Grade Detail AI（`services/grade_detail_analysis_service.py`）

- 职责：按勾选的结算单生成「号别小结」，复用 `ai_analysis_service` 的缓存与调用机制（ADR-011）。
- 路由：`POST /api/analytics/grade-detail/analysis`，请求体与品牌对比一致
  （`merchant_no[]` / `start_date` / `end_date` / `refresh`）。
- 缓存键包含 `feature='grade-detail'` 与口径版本 `v1-schemeA`，口径变化后旧结论自动失效。
- 数据包必须带样本量；样本结算单少于 5 张时，提示词禁止输出趋势类结论。

### Export（`backend/app/api/exports.py`）

- 职责：总览 CSV 导出、结算单 xlsx 导出、单条记录关联的原始文件下载。

### Frontend（`frontend/src`）

- 视图：`OverviewView`（总览看板）、`SettlementListView`（数据明细）、
  `SettlementComparisonView`（结算单对比）、`SettlementView`（结算单诊断）、`ImportView`（导入）、
  `SeriesComparisonView`（品牌对比，内含「按品牌 / 按等级号别」两个视图）、
  `LoginView` / `RegisterView` / `PublicPreviewView`。
- 等级细分组件：`SeriesGradeDetail.vue`（号别阶梯与数据表）、`GradeDetailAiAnalysis.vue`（号别小结）。
  AI 结论的渲染与状态机抽到通用组件 `AiAnalysisCard.vue`，两个页面的封装只负责接口与小标题；
  卡片默认可见并自动以 `refresh=false` 先读缓存，命中缓存直接展示 `cached` 标记。
- 下拉框：展示单号（`orderNo`），取值用商号（`merchantNo`），避免柜号重复导致误选。
- 日期范围：五个业务页统一使用 `DateRangeFilter.vue` 组件，在一个面板内选择开始 / 结束日期。
- 单号展示口径（ADR-015）：统一用适配后单号 `orderNoNormalized`，
  经 `utils/orderNo.ts` 的 `displayOrderNo` 取值（缺失时回退原始 `orderNo`）；
  原始单号用 `rawOrderNo` 放在 tooltip / 副标题里，新增展示位不得直接渲染 `orderNo`。
- 商号展示口径（ADR-016）：统一用适配后商号 `merchantNoNormalized`，
  经 `utils/merchantNo.ts` 的 `displayMerchantNo` 取值（缺失时回退原始 `merchantNo`）；
  原始商号用 `rawMerchantNo` 放在 tooltip 里，新增展示位不得直接渲染 `merchantNo`；
  注意下拉取值、接口参数与 `?selected=` 仍必须用原始 `merchantNo`。
- 图表为手写 SVG 组件，不引入图表库。
- 图表图例与悬浮提示统一复用 `components/ChartLegend.vue` + `components/ChartTooltip.vue`
  与 `utils/chartTooltip.ts`：图例负责色标 / 形状说明，提示用 Teleport 跟随鼠标并做视口避让，
  由 `frontend/tests/chart-tooltip.test.ts` 保证每个图表都接入，新增图表必须一并接入。
- API 契约集中在 `api/types.ts` + `api/normalize.ts` + `api/client.ts`，后端字段变更必须同步这三处。
- 路由守卫在 `main.ts`：`requiresAuth` 保护业务页，`guestOnly` 让已登录用户跳过登录/注册页；
  `/` 重定向到 `/login`（已登录时经 `guestOnly` 再跳 `/overview`），`/preview` 保留为公开演示页但不再作为默认入口。
  业务路由统一按需 `import()` 懒加载；图标统一从 `@lucide/vue/dist/esm/icons/*` 深导入，
  避免登录首屏加载全量业务模块与整包图标。
- 工作台外壳 `AppShell.vue`：顶部 header（品牌图标、当前页面、本地时间含秒、当前用户名与退出登录）、
  左侧导航与页签栏三部分；品牌图标返回 `/overview`，桌面侧栏可收起为自适应图标栏，状态存
  `localStorage`（键 `fruits-ana:sidebar-collapsed`）；页签记录本次会话打开过的页面，首页 `/overview` 固定不可关闭，
  其余可单个关闭或「关闭其他」，关闭当前页签时优先激活右侧邻居；页签只保留当前会话，不写入
  `sessionStorage`，登录或刷新后从首页重新开始；纯逻辑在 `utils/shellTabs.ts`
  （`frontend/tests/shell-tabs.test.ts`）。
  业务页面滚动后右下角显示「回顶部」悬浮按钮；移动端（≤820px）隐藏左侧导航，改用顶部 header +
  底部大按钮导航，页签栏保持可见并可横向滚动，回顶按钮自动抬到底部导航上方。
- 桌面端全局字号基线用 `clamp()` 随视口宽度平滑缩放（15px–17px），主要控件、外壳与卡片尺寸
  改为 `rem`；移动端固定 17px，避免用固定 `zoom` 造成横向溢出或非标缩放。

## Data Flow

### 登录

```text
LoginView
  → POST /api/auth/login {display_name, password, remember_me}
  → auth.py 校验 Argon2 哈希
  → 创建 user_session（存 token_hash；默认 7 天，remember_me=true 时 30 天）
  → Set-Cookie: fruit_session (HttpOnly，同步会话期限)
  → 前端 currentUser 更新 → 跳转 /overview
```

### 数据导入（新模板）

```text
ImportView
  → POST /api/imports/preview (multipart, 多文件)
  → settlement_template 解析基本信息 / 销售 / 售后 / 费用 / 文件合计
  → import_draft_service 创建 import_job + import_draft（不写正式事实）
  → ImportReviewView 回填用户原值，展示系统金额/合计，问题行标红
  → 用户修改并保存：PUT /api/imports/jobs/{job}/drafts/{draft}
  → 确认提交：POST /api/imports/jobs/{job}/confirm（无错直接入库；有错/冲突先 409，二次确认后 force）
  → import_draft_service 写 ImportBatch / SourceFile / SaleRecord / SettlementSummary / DataIssue
```

### 分析查询

```text
OverviewView / SettlementView / SettlementComparisonView / SettlementListView
  → GET /api/analytics/overview | /trend | /settlements/{merchant_no} | /settlement-comparison
  → GET /api/settlements | /api/settlements/{merchant_no}/records
  → 分析服务聚合（按日期与商号筛选，按销售日期而非导入时间）
  → normalize.ts 归一化 → SVG 图表渲染
```

### 数据问答

```text
顺仔 AskWidget（右下角悬浮按钮 → 对话窗）
  → POST /api/ask {question, history}
  → ask_service 注入系统提示词 + 当前结算单清单
  → 大模型选择工具（list / overview / rank / detail / compare）
  → ask_tools 调用现有分析服务并回填精简结果
  → 最多 3 轮后返回 answer + steps + model
```

## Data Model（`backend/app/models.py`）

| 表 | 职责 |
| --- | --- |
| `user` | 登录账号（用户名唯一，Argon2 哈希） |
| `user_session` | 服务端会话（token 哈希 + 过期时间） |
| `import_batch` | 一张结算单：商号（唯一）、原始单号 + 适配后单号、柜号、转运车号与导入计数 |
| `import_job` | 一次多文件导入任务；确认前只产生草稿 |
| `import_draft` | 单文件解析草稿（版本化槽位 JSON、原文 JSON、问题清单、确认状态） |
| `source_file` | 原始文件引用 + 内容哈希 |
| `sale_record` | 销售事实行（含等级、数量、单价、金额） |
| `settlement_summary` | 按结算单（`import_batch_id` 唯一）的汇总结算数据 |
| `settlement_revision` | 导入复核修改与手工录单覆盖修改的留痕 |
| `data_issue` | 导入过程中的问题明细 |
| `settlement_after_sale_item` | 手工录单售后明细（内容、摘要、金额） |
| `settlement_fee_item` | 手工录单支出明细（固定六项 + 自定义项） |
| `entry_field_option` | 市场 / 品种下拉字典，业务端只读、管理端维护 |
| `admin_field_conversion_rule` | 管理端字段转换规则（当前用于等级 `grade`，如 `BC→C`） |
| `admin_role` / `admin_permission` / `admin_user_role` / `admin_role_permission` | 管理端维护的业务 RBAC，业务端只读 |

## Constraints

- 必须保持：API 变更需同步前端 `api/types.ts` + `api/normalize.ts` + `api/client.ts`。
- 已变更（2026-09-10）：柜号维度接口 `/api/analytics/containers*` 已被
  `/api/analytics/settlements*` 取代，前端旧路由 `/containers`、`/container-comparison` 保留重定向。
- 必须保持：统计等级由 `fruits_ana_admin` 字段转换规则生成（ADR-029）；`sale_record.grade_raw`
  保留用户原始写法，默认种子 `BC→C`、`AB` 默认独立。
- 必须保持：日期筛选按销售日期计算，不按导入时间。
- 必须保持：单号双写口径（`order_no` 原始 + `order_no_normalized` 适配后，ADR-015），
  页面统一展示适配后单号；迁移脚本 `backend/scripts/add_order_no_normalized.py` 幂等可重跑。
- 必须保持：商号双写口径（`merchant_no` 原始 + `merchant_no_normalized` 适配后，ADR-016），
  页面统一展示适配后商号，但唯一键 / 接口参数 / 下拉取值 / `?selected=` 仍用原始 `merchant_no`；
  迁移脚本 `backend/scripts/add_merchant_no_normalized.py`（基于 `column_backfill.py`）幂等可重跑。
- 必须保持：MySQL schema 变更需提供可重复执行的迁移脚本（参考 `backend/scripts/`）。
- 不得提交：`backend/data/`、`.env`、`backend/.env`、真实结算单与业务附件。
- 暂不引入：状态管理库、UI 组件库、图表库、容器化与 CI（如引入需先记录 ADR）。
