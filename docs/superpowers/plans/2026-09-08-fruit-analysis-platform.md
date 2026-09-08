# 水果等级销售经营分析平台实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建面向管理者的水果等级销售分析工作台，支持结算单导入、A/B/C 等级分析、全局与单柜视图、异常提示和报表导出。

**Architecture:** 采用单仓库前后端分层架构。后端使用 FastAPI + SQLite，负责原始文件、导入批次、标准化销售明细、货柜摘要和聚合指标；前端使用 Vue 3 + Vite，提供全局总览、单柜诊断、导入质量和导出界面。解析规则集中在独立 Python 模块，所有聚合指标由同一服务层计算，保证口径一致。

**Tech Stack:** Python 3、FastAPI、SQLAlchemy、SQLite、pandas/openpyxl、pytest；Vue 3、Vite、TypeScript、ECharts。

---

## 文件结构与职责

- `backend/app/main.py`：FastAPI 应用入口、路由注册、生命周期。
- `backend/app/db.py`：SQLite 引擎、会话和初始化。
- `backend/app/models.py`：导入批次、原始文件、销售明细、货柜摘要、异常记录模型。
- `backend/app/schemas.py`：API 请求/响应 DTO。
- `backend/app/parser/settlement_parser.py`：Excel/CSV 解析、字段提取、BC→C 映射、金额校验。
- `backend/app/services/import_service.py`：文件哈希、批次事务、重复导入和错误明细。
- `backend/app/services/analytics_service.py`：全局/单柜聚合、趋势、对比和异常计算。
- `backend/app/api/imports.py`、`analytics.py`、`exports.py`：HTTP 接口。
- `backend/tests/fixtures/`：脱敏结算单样例和最小 CSV 样例。
- `backend/tests/`：解析、指标、导入幂等、API 测试。
- `frontend/src/views/OverviewView.vue`：全局等级总览。
- `frontend/src/views/ContainerView.vue`：单柜经营诊断。
- `frontend/src/views/ImportView.vue`：上传、批次和数据质量。
- `frontend/src/components/GradeSummary.vue`、`TrendChart.vue`、`ContainerComparison.vue`：可复用看板组件。
- `frontend/src/api/client.ts`：类型化 API 客户端。
- `frontend/tests/`：视图和筛选交互测试。
- `README.md`：本地运行、导入模板、指标口径和数据备份说明。

### Task 1: 初始化工程与运行基线

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/app/__init__.py`
- Create: `backend/app/main.py`
- Create: `backend/app/db.py`
- Create: `frontend/package.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/src/main.ts`
- Create: `README.md`
- Test: `backend/tests/test_health.py`

- [ ] **Step 1: 写健康检查失败测试**：请求 `GET /health`，断言状态 200 且 JSON 为 `{"status":"ok"}`。
- [ ] **Step 2: 运行 `cd backend; pytest tests/test_health.py -q`**，确认因入口不存在而失败。
- [ ] **Step 3: 建立 FastAPI 入口和 SQLite 配置**，注册 `/health`，默认数据库路径为 `backend/data/fruit_analysis.sqlite3`。
- [ ] **Step 4: 创建 Vue 入口和基础路由**，路由包含 `/overview`、`/containers`、`/imports` 三个空页面。
- [ ] **Step 5: 运行后端测试及 `cd frontend; npm run build`**，确认基线可启动、可构建。
- [ ] **Step 6: 提交 `chore: 初始化分析平台工程`**。

### Task 2: 建立数据模型与数据库迁移

**Files:**
- Create: `backend/app/models.py`
- Create: `backend/app/schemas.py`
- Create: `backend/app/db_init.py`
- Create: `backend/tests/test_models.py`

- [ ] **Step 1: 测试模型约束**：创建同一 `file_hash` 两次必须被拒绝；销售明细必须包含 `container_id`、`sale_date`、`grade`、`quantity`、`unit_price`、`amount`。
- [ ] **Step 2: 运行 `cd backend; pytest tests/test_models.py -q`**，确认模型未定义导致失败。
- [ ] **Step 3: 实现 `import_batch`、`source_file`、`sale_record`、`container_summary`、`data_issue` 五张表及索引：`sale_date`、`container_id`、`grade`、`file_hash`。
- [ ] **Step 4: 加入枚举约束：标准等级只能为 `A`、`B`、`C`；原始等级单独保存；销售地区允许为空。
- [ ] **Step 5: 运行 `python -m app.db_init` 创建数据库，并执行模型测试。
- [ ] **Step 6: 提交 `feat: 建立销售分析数据模型`**。

### Task 3: 实现结算单解析与导入幂等

**Files:**
- Create: `backend/app/parser/settlement_parser.py`
- Create: `backend/app/services/import_service.py`
- Create: `backend/app/api/imports.py`
- Create: `backend/tests/fixtures/minimal_settlement.csv`
- Create: `backend/tests/test_parser.py`
- Create: `backend/tests/test_import_service.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: 写解析测试**：输入含 `A6`、`BC6`、缺失日期和错误金额的样例，断言 `A6→A`、`BC6→C`，错误行进入 `data_issue`，有效行仍被返回。
- [ ] **Step 2: 运行 `cd backend; pytest tests/test_parser.py -q`**，确认失败。
- [ ] **Step 3: 实现解析器**：识别工作表中的货柜号、销售日期、品种规格、数量、单价、金额；以 `Decimal` 计算 `quantity * unit_price`，金额误差超过 0.01 记录警告；跳过售后/费用汇总行但写入货柜摘要。
- [ ] **Step 4: 实现文件哈希和事务导入**：相同哈希直接返回既有批次；新批次先写原始文件引用和批次，再一次性写入有效明细；事务失败时回滚全部事实数据。
- [ ] **Step 5: 暴露 `POST /api/imports`、`GET /api/imports`、`GET /api/imports/{id}/issues`、`GET /api/imports/{id}/issues.csv`。
- [ ] **Step 6: 用三份附件执行导入 smoke test，核对三柜均有记录且 BC 均归入 C。
- [ ] **Step 7: 提交 `feat: 支持结算单导入与等级标准化`**。

### Task 4: 实现统一分析服务与异常规则

**Files:**
- Create: `backend/app/services/analytics_service.py`
- Create: `backend/app/api/analytics.py`
- Create: `backend/tests/test_analytics.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: 写指标测试**：给定固定明细，断言销量、销售额、加权均价、销量占比；销量为 0 时返回 `null`；筛选货柜和日期会同时影响分子分母。
- [ ] **Step 2: 运行 `cd backend; pytest tests/test_analytics.py -q`**，确认失败。
- [ ] **Step 3: 实现聚合函数 `get_grade_summary(filters)`、`get_daily_trend(filters)`、`get_container_comparison(filters)`、`get_container_detail(container_id, filters)`。
- [ ] **Step 4: 实现异常规则：字段/等级/金额/重复导入数据问题直接读取 `data_issue`；经营异常按可配置阈值比较同期均价、等级结构和日销量，返回原因、指标和明细 ID。
- [ ] **Step 5: 暴露 `GET /api/analytics/overview`、`/trend`、`/container-comparison`、`/containers/{id}`，统一接受 `start_date`、`end_date`、`container_id`。
- [ ] **Step 6: 用附件导入后的数据做独立计算抽查，并运行全部后端测试。
- [ ] **Step 7: 提交 `feat: 提供等级经营分析接口`**。

### Task 5: 构建管理者看板前端

**Files:**
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/views/OverviewView.vue`
- Create: `frontend/src/views/ContainerView.vue`
- Create: `frontend/src/views/ImportView.vue`
- Create: `frontend/src/components/GradeSummary.vue`
- Create: `frontend/src/components/TrendChart.vue`
- Create: `frontend/src/components/ContainerComparison.vue`
- Create: `frontend/tests/OverviewView.spec.ts`

- [ ] **Step 1: 写组件测试**：模拟 overview API，断言 A/B/C 三组销量、销售额、均价、占比显示；切换日期和货柜会重新请求。
- [ ] **Step 2: 运行 `cd frontend; npm test -- --run`**，确认失败。
- [ ] **Step 3: 实现顶部筛选栏和全局总览：指标区、每日量价趋势、货柜等级结构/均价对比、异常提示入口。
- [ ] **Step 4: 实现单柜诊断：柜级指标、销售周期、量价趋势、全局同期基线、售后/费用/清关摘要、明细下钻链接。
- [ ] **Step 5: 实现导入页：多文件上传、进度、批次列表、成功/警告/失败统计、错误 CSV 下载。
- [ ] **Step 6: 加入响应式布局、空数据状态、加载状态、接口错误提示；BC 标签显示“C 果（含 BC）”。
- [ ] **Step 7: 运行前端测试与 `npm run build`，提交 `feat: 完成管理者等级分析看板`**。

### Task 6: 导出、追溯与交付验证

**Files:**
- Create: `backend/app/api/exports.py`
- Create: `backend/tests/test_exports.py`
- Modify: `backend/app/main.py`
- Modify: `README.md`
- Create: `docs/superpowers/plans/2026-09-08-fruit-analysis-uat.md`

- [ ] **Step 1: 写导出测试**：给定同一筛选条件，导出的等级汇总与 API 汇总一致，并包含筛选范围、生成时间、等级映射说明。
- [ ] **Step 2: 实现 `GET /api/exports/overview.csv`、`/containers/{id}.xlsx`，导出当前筛选范围的汇总、趋势和明细来源 ID。
- [ ] **Step 3: 加入原始文件追溯接口，验证每条明细能回到批次和源文件。
- [ ] **Step 4: 执行验证矩阵：三份真实附件导入；重复导入；缺字段；BC 映射；金额误差；空日期筛选；全局/单柜一致性；导出文件可打开。
- [ ] **Step 5: 运行 `cd backend; pytest -q`、`cd frontend; npm test -- --run`、`npm run build`，记录实际结果。
- [ ] **Step 6: 更新 README 的导入格式、指标口径、备份和启动命令，提交 `docs: 补充平台运行与验收说明`**。

## 覆盖检查

- 数据导入、原始文件保留、BC→C、重复导入与错误隔离：Task 2–3。
- 全局/单柜视图、日期与货柜筛选、四项等级指标、趋势和对比：Task 4–5。
- 售后/费用/清关辅助解释、明细追溯和导出：Task 5–6。
- 数据质量与经营异常提示：Task 3–4。
- 后续详情表格接入：首期不实现，保留 `spec_raw`、`remark`、`sales_region` 及稳定来源 ID，待收到文件后单独制定扩展计划。

