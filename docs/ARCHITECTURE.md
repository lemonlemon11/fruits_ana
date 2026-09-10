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
        ├── api/analytics.py 总览 / 趋势 / 货柜对比 / 单柜详情
        └── api/exports.py   总览 CSV、单柜 xlsx、原始文件下载
        ▼
services/  analytics_service / overview_service / container_detail_service
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
  货柜汇总与数据问题。
- 幂等：按文件内容哈希识别重复导入，不产生重复销售记录。
- 等级映射：`A/A6 → A`、`B/B6 → B`、`C/C6/BC/BC6 → C`。
- 缺失字段或未知等级的行不写入销售事实，其余有效行继续导入，并生成 `data_issue` 明细。
- 原始文件保存在 `backend/data/uploads/`（不入库、不提交 Git）。

### Analytics（`backend/app/api/analytics.py`、`services/*`）

- 职责：总览指标、A/B/C 趋势、货柜对比、单柜摘要与明细。
- `analytics_service` 为对外门面；`overview_service`、`container_detail_service` 负责具体聚合。
- 指标口径见 `README.md`，任何口径变化必须记入 `DECISIONS.md`。

### Export（`backend/app/api/exports.py`）

- 职责：总览 CSV 导出、单柜 xlsx 导出、单条记录关联的原始文件下载。

### Frontend（`frontend/src`）

- 视图：`OverviewView`（总览看板）、`ContainerComparisonView`（货柜对比）、
  `ContainerView`（单柜诊断）、`ImportView`（导入）、`LoginView` / `RegisterView` / `PublicPreviewView`。
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
  → parser 解析结算单 → SaleRecord / ContainerSummary
  → 校验异常 → DataIssue
  → 返回批次统计；问题明细走 GET /api/imports/{id}/issues[.csv]
```

### 分析查询

```text
OverviewView / ContainerView / ContainerComparisonView
  → GET /api/analytics/overview | /trend | /containers/{id} | /container-comparison
  → analytics_service 聚合（按日期范围筛选，按销售日期而非导入时间）
  → normalize.ts 归一化 → SVG 图表渲染
```

## Data Model（`backend/app/models.py`）

| 表 | 职责 |
| --- | --- |
| `user` | 登录账号（用户名唯一，Argon2 哈希） |
| `user_session` | 服务端会话（token 哈希 + 过期时间） |
| `import_batch` | 一次导入的处理结果与计数 |
| `source_file` | 原始文件引用 + 内容哈希 |
| `sale_record` | 销售事实行（含等级、数量、单价、金额） |
| `container_summary` | 按货柜/批次的汇总结算数据 |
| `data_issue` | 导入过程中的问题明细 |

## Constraints

- 必须保持：现有 API 路径与响应字段的向后兼容；变更需同步前端 `api/types.ts`。
- 必须保持：`BC` 归入 `C` 的等级口径；报表展示仍为「C 果（含 BC）」。
- 必须保持：日期筛选按销售日期计算，不按导入时间。
- 必须保持：MySQL schema 变更需提供可重复执行的迁移脚本（参考 `backend/scripts/`）。
- 不得提交：`backend/data/`、`.env`、`backend/.env`、真实结算单与业务附件。
- 暂不引入：状态管理库、UI 组件库、图表库、容器化与 CI（如引入需先记录 ADR）。
