# Architecture

> 维护约定：系统结构、模块职责、数据流发生变化时必须更新本文件。
> 最后更新：2026-09-10

## System Overview

单体前后端分离应用：Vue 3 SPA + FastAPI + MySQL。前端只通过 `/api` 与后端通信，
开发环境由 Vite 代理到 `127.0.0.1:8000`。

```text
Browser (Vue 3 SPA, Vite dev server :53000)
        │  /api/*  (Vite proxy)
        ▼
FastAPI (:8000)  backend/app/main.py
        ├── api/auth.py      注册 / 登录 / 会话
        ├── api/imports.py   上传、批次列表、问题明细
        ├── api/analytics.py 总览 / 趋势 / 结算单对比 / 结算单详情 / 系列对比
        ├── api/settlements.py 数据明细列表 / 单张结算单全部明细
        └── api/exports.py   总览 CSV、结算单 xlsx、原始文件下载
        ▼
services/  analytics_core / settlement_analytics_service / series_analytics_service
           overview_service / settlement_detail_service / settlement_list_service
           import_service / issue_service
        ▼
parser/    settlement_parser / settlement_summary / decimal_values
        ▼
SQLAlchemy 2.0 (models.py) → MySQL

Filesystem: backend/data/uploads/  原始上传文件（已 gitignore）
```

## Main Components

### Authentication（`backend/app/auth.py`、`backend/app/api/auth.py`）

- 职责：Argon2 密码哈希、服务端会话、HttpOnly Cookie 认证、依赖注入 `require_user`。
- 会话 token 以 SHA-256 哈希落库（`user_session.token_hash`），有效期 7 天。
- 主要路由：`POST /api/auth/register`、`POST /api/auth/login`、`GET /api/auth/me`、`POST /api/auth/logout`。
- 前端：`frontend/src/auth.ts`（`.vue` 侧会话状态）、`frontend/src/views/LoginView.vue`、`RegisterView.vue`。

### Import Pipeline（`backend/app/api/imports.py`、`services/import_service.py`、`parser/`）

- 职责：接收 `.xlsx` / `.xls` / `.csv`，解析结算单版式，写入批次、源文件、销售记录、
  结算摘要与数据问题。
- 身份：以商号（`import_batch.merchant_no`）作为结算单唯一业务键；柜号可为空且可重复。
- 覆盖：同一商号再次上传返回 `conflict`，确认后以 `?overwrite=true` 在同一事务内替换旧结算单。
- 等级映射：`A/A6 → A`、`B/B6 → B`、`C/C6/BC/BC6 → C`。
- 缺失字段或未知等级的行不写入销售事实，其余有效行继续导入，并生成 `data_issue` 明细。
- 原始文件保存在 `backend/data/uploads/`（不入库、不提交 Git）。

### Analytics（`backend/app/api/analytics.py`、`services/*`）

- 职责：总览指标、A/B/C 趋势、结算单对比、结算单摘要与明细。
- `analytics_service` 为兼容门面；`analytics_core` 提供筛选与指标，`settlement_analytics_service`
  提供对比/详情/异常，`overview_service`、`settlement_detail_service` 负责具体聚合。
- 查询维度：`merchant_no`；柜号不再是查询条件。
- 指标口径见 `README.md`，任何口径变化必须记入 `DECISIONS.md`。

### Series Analytics（`backend/app/api/analytics.py`、`services/series_analytics_service.py`）

- 职责：「系列对比」页的数据来源：按勾选的结算单（可跨系列）核算 A/B/C 独立指标、价差与系列汇总。
- 路由：`GET /api/analytics/series-comparison`，参数为可重复的 `merchant_no`，外加
  `start_date` / `end_date`；不传 `merchant_no` 时返回日期范围内全部结算单。
- 系列识别：取结算单单号（`order_no`，如 `宝贝01`）开头连续的中文前缀作为系列名；
  识别不出时归入「未识别系列」，不影响其余结算单参与对比。见 ADR-009。
- 返回结构：`settlements`（逐结算单）、`series`（逐系列汇总）、`total`（全部所选合计），
  三者使用同一套口径：`total` / `grades` / `grade_amount_shares` / `spread`。
- 注意：系列只是分组标签，对比与查询的唯一键仍是商号 `merchant_no`。

### Settlement List（`backend/app/api/settlements.py`、`services/settlement_list_service.py`）

- 职责：「数据明细」页列表与单张结算单全部明细。
- 默认范围：最新销售日期往前一个自然月；可用 `start_date` / `end_date` / `merchant_no` 覆盖。

### Export（`backend/app/api/exports.py`）

- 职责：总览 CSV 导出、结算单 xlsx 导出、单条记录关联的原始文件下载。

### Frontend（`frontend/src`）

- 视图：`OverviewView`（总览看板）、`SettlementListView`（数据明细）、
  `SettlementComparisonView`（结算单对比）、`SettlementView`（结算单诊断）、`ImportView`（导入）、
  `SeriesComparisonView`（系列对比）、`LoginView` / `RegisterView` / `PublicPreviewView`。
- 下拉框：展示单号（`orderNo`），取值用商号（`merchantNo`），避免柜号重复导致误选。
- 图表为手写 SVG 组件，不引入图表库。
- API 契约集中在 `api/types.ts` + `api/normalize.ts` + `api/client.ts`，后端字段变更必须同步这三处。
- 路由守卫在 `main.ts`：`requiresAuth` 保护业务页，`guestOnly` 让已登录用户跳过登录/注册页；
  `/` 重定向到 `/login`（已登录时经 `guestOnly` 再跳 `/overview`），`/preview` 保留为公开演示页但不再作为默认入口。

## Data Flow

### 登录

```text
LoginView
  → POST /api/auth/login {username, password}
  → auth.py 校验 Argon2 哈希
  → 创建 user_session（存 token_hash）
  → Set-Cookie: fruit_session (HttpOnly)
  → 前端 currentUser 更新 → 跳转 /overview
```

### 数据导入

```text
ImportView
  → POST /api/imports (multipart)
  → import_service 计算内容哈希 → 去重判断
  → parser 解析结算单（商号/单号/柜号/转运车号 + 明细）→ SaleRecord / SettlementSummary
  → 校验异常 → DataIssue
  → 返回批次统计；问题明细走 GET /api/imports/{id}/issues[.csv]
```

### 分析查询

```text
OverviewView / SettlementView / SettlementComparisonView / SettlementListView
  → GET /api/analytics/overview | /trend | /settlements/{merchant_no} | /settlement-comparison
  → GET /api/settlements | /api/settlements/{merchant_no}/records
  → 分析服务聚合（按日期与商号筛选，按销售日期而非导入时间）
  → normalize.ts 归一化 → SVG 图表渲染
```

## Data Model（`backend/app/models.py`）

| 表 | 职责 |
| --- | --- |
| `user` | 登录账号（用户名唯一，Argon2 哈希） |
| `user_session` | 服务端会话（token 哈希 + 过期时间） |
| `import_batch` | 一张结算单：商号（唯一）、单号、柜号、转运车号与导入计数 |
| `source_file` | 原始文件引用 + 内容哈希 |
| `sale_record` | 销售事实行（含等级、数量、单价、金额） |
| `settlement_summary` | 按结算单（`import_batch_id` 唯一）的汇总结算数据 |
| `data_issue` | 导入过程中的问题明细 |

## Constraints

- 必须保持：API 变更需同步前端 `api/types.ts` + `api/normalize.ts` + `api/client.ts`。
- 已变更（2026-09-10）：柜号维度接口 `/api/analytics/containers*` 已被
  `/api/analytics/settlements*` 取代，前端旧路由 `/containers`、`/container-comparison` 保留重定向。
- 必须保持：`BC` 归入 `C` 的等级口径；报表展示仍为「C 果（含 BC）」。
- 必须保持：日期筛选按销售日期计算，不按导入时间。
- 必须保持：MySQL schema 变更需提供可重复执行的迁移脚本（参考 `backend/scripts/`）。
- 不得提交：`backend/data/`、`.env`、`backend/.env`、真实结算单与业务附件。
- 暂不引入：状态管理库、UI 组件库、图表库、容器化与 CI（如引入需先记录 ADR）。
