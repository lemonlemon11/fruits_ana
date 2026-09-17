# 手工录单 Implementation Plan（fruits_ana）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在业务端新增手工录单、修改、导出，并接入现有 RBAC 权限。

**Architecture:** 手工单复用 `import_batch`、`sale_record`、`settlement_summary`；
新增售后/费用明细表与录单字段字典表；业务端新增权限依赖与 `/api/entry` 接口；
前端新增 `EntryView.vue` 和详情页修改/导出入口。

**Tech Stack:** FastAPI + SQLAlchemy 2.0 + MySQL；Vue 3 + Vue Router + Vite；openpyxl；pytest。

---

## File Structure

**Modify:**
- `backend/app/models.py`
- `backend/app/schemas.py`
- `backend/app/auth.py`
- `backend/app/api/auth.py`
- `backend/app/main.py`
- `backend/app/api/exports.py`
- `frontend/src/api/types.ts`
- `frontend/src/api/client.ts`
- `frontend/src/auth.ts`
- `frontend/src/main.ts`
- `frontend/src/AppShell.vue`
- `frontend/src/views/SettlementView.vue`
- `frontend/src/styles-dashboard.css`

**Create:**
- `backend/app/services/entry_service.py`
- `backend/app/services/entry_export.py`
- `backend/app/api/entry.py`
- `backend/scripts/add_entry_schema.py`
- `frontend/src/views/EntryView.vue`
- `frontend/src/utils/entryForm.ts`
- `backend/tests/test_entry_service.py`
- `backend/tests/test_entry_api.py`
- `backend/tests/test_entry_permissions.py`
- `frontend/tests/entry-form.test.ts`
- `frontend/tests/entry-routing.test.mjs`

---

## Task 1: 数据模型与迁移

**Files:**
- Modify: `backend/app/models.py`
- Create: `backend/scripts/add_entry_schema.py`
- Test: `backend/tests/test_entry_service.py`

- [ ] **Step 1: 扩展模型**

在 `ImportBatch` 增加：

```python
source_type: Mapped[str] = mapped_column(String(16), default="import", nullable=False)
market: Mapped[str | None] = mapped_column(String(128), nullable=True)
arrival_date: Mapped[date | None] = mapped_column(Date, nullable=True)
arrival_quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)
```

在 `SaleRecord` 增加：

```python
piece_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
spec_kg: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
```

新增 `SettlementAfterSaleItem`、`SettlementFeeItem`、`EntryFieldOption`。

- [ ] **Step 2: 新增迁移脚本**

创建 `backend/scripts/add_entry_schema.py`，使用 SQLAlchemy 检查列是否存在后 `ALTER TABLE`；
新表依赖 `init_db()` 的 `create_all`。脚本必须幂等。

- [ ] **Step 3: 添加模型级测试**

断言新列可保存手工单，新表可插入售后、费用、字段选项。

- [ ] **Step 4: 运行后端测试**

```bash
.venv/bin/python -m pytest backend/tests -q --basetemp=backend/.pytest-tmp
```

- [ ] **Step 5: 提交**

```bash
git add backend/app/models.py backend/scripts/add_entry_schema.py backend/tests/test_entry_service.py
git commit -m "feat(entry): 增加手工录单数据模型"
```

---

## Task 2: 业务端 RBAC 权限

**Files:**
- Modify: `backend/app/models.py`
- Modify: `backend/app/auth.py`
- Modify: `backend/app/api/auth.py`
- Modify: `backend/app/schemas.py`
- Test: `backend/tests/test_entry_permissions.py`

- [ ] **Step 1: 增加只读 RBAC 模型**

映射 `AdminRole`、`AdminUserRole`、`AdminRolePermission`、`AdminPermission`。

- [ ] **Step 2: 增加权限查询与依赖**

在 `auth.py` 增加：

```python
def get_permission_codes(db, user_id) -> set[str]
def require_permission(permission_code: str) -> Callable
```

只读查询现有 `admin_*` 表，不写管理端数据。

- [ ] **Step 3: 扩展 `/api/auth/me`**

返回 `user.id`、`display_name`、`permissions`，供前端隐藏录单入口。

- [ ] **Step 4: 权限测试**

验证 `data_entry`、`operator`、`fruit_admin` 可访问录单，`viewer` 返回 403。

- [ ] **Step 5: 运行并提交**

```bash
.venv/bin/python -m pytest backend/tests/test_entry_permissions.py -q --basetemp=backend/.pytest-tmp
git add backend/app/models.py backend/app/auth.py backend/app/api/auth.py backend/app/schemas.py backend/tests/test_entry_permissions.py
git commit -m "feat(auth): 业务端接入RBAC权限"
```

---

## Task 3: 录单字段选项只读接口

**Files:**
- Create: `backend/app/api/entry.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_entry_api.py`

- [ ] **Step 1: 实现 `GET /api/entry/field-options`**

按 `field_key` 返回启用项，按 `sort_order` 排序。

- [ ] **Step 2: 注册 `/api/entry` 路由**

- [ ] **Step 3: 测试与提交**

```bash
.venv/bin/python -m pytest backend/tests/test_entry_api.py -q --basetemp=backend/.pytest-tmp
```

---

## Task 4: 录单保存与修改服务

**Files:**
- Modify: `backend/app/schemas.py`
- Create: `backend/app/services/entry_service.py`
- Modify: `backend/app/api/entry.py`
- Test: `backend/tests/test_entry_service.py`

- [ ] **Step 1: 定义 Pydantic DTO**

包含基本信息、销售行、售后行、支出项、`overwrite`。

- [ ] **Step 2: 实现公式校验**

```python
quantity = piece_count * spec_kg
amount = quantity * unit_price
```

使用 `Decimal` 量化到两位小数。

- [ ] **Step 3: 实现保存服务**

- 校验必填字段和至少一条销售行。
- 按商号查找既有批次。
- 未确认覆盖时返回冲突信息。
- 覆盖时在同一事务内删除旧批次及级联数据，再写入手工单。
- 归一化商号、单号。
- 写 `SettlementSummary` 汇总。

- [ ] **Step 4: 实现 `GET` 与 `PUT`**

- `GET` 读取手工单全部录入数据。
- `PUT` 只允许 `source_type=manual`。

- [ ] **Step 5: 测试与提交**

覆盖新建、冲突、覆盖、修改、校验失败、权限失败。

---

## Task 5: 模板导出

**Files:**
- Create: `backend/app/services/entry_export.py`
- Modify: `backend/app/api/entry.py`
- Test: `backend/tests/test_entry_service.py`

- [ ] **Step 1: 实现模板填充**

使用 `openpyxl` 读取 `attachments/结算单模板样式.xlsx`。

- [ ] **Step 2: 动态行处理**

- 销售行从第 14 行开始。
- 售后行从第 18 行开始。
- 自定义支出项插入在“打冷费”和“费用合计”之间。
- 合计写入计算值，不写公式。

- [ ] **Step 3: 增加导出接口与测试**

```bash
.venv/bin/python -m pytest backend/tests/test_entry_service.py -q --basetemp=backend/.pytest-tmp
```

---

## Task 6: 前端契约与权限

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/auth.ts`
- Modify: `frontend/src/main.ts`
- Modify: `frontend/src/AppShell.vue`
- Test: `frontend/tests/entry-routing.test.mjs`

- [ ] **Step 1: 增加类型与 API**

- `EntryPayload`、`EntryRead`、`FieldOption`。
- `getEntryFieldOptions`、`saveEntry`、`getEntry`、`updateEntry`。

- [ ] **Step 2: 扩展当前用户权限**

`AuthUser` 增加 `permissions: string[]`。

- [ ] **Step 3: 路由与导航**

- 新增 `/entry`，`meta.requiresAuth` + `meta.permission = 'entry:view'`。
- 有 `entry:view` 时显示“录单”导航。

- [ ] **Step 4: 前端测试与提交**

```bash
npm --prefix frontend run test
npm --prefix frontend run typecheck
```

---

## Task 7: 录单页面

**Files:**
- Create: `frontend/src/utils/entryForm.ts`
- Create: `frontend/src/views/EntryView.vue`
- Modify: `frontend/src/styles-dashboard.css`
- Test: `frontend/tests/entry-form.test.ts`

- [ ] **Step 1: 实现纯函数**

动态行增删、自动计算、合计计算。

- [ ] **Step 2: 实现页面**

基本信息、销售/售后/费用动态表、实时合计、冲突确认。

- [ ] **Step 3: 保存跳转**

保存成功后跳转 `settlement-detail?merchant_no=...`。

- [ ] **Step 4: 测试与构建**

```bash
npm --prefix frontend run test
npm --prefix frontend run typecheck
npm --prefix frontend run build
```

---

## Task 8: 详情页修改与导出入口

**Files:**
- Modify: `frontend/src/views/SettlementView.vue`
- Modify: `frontend/src/api/client.ts`
- Test: `frontend/tests/entry-routing.test.mjs`

- [ ] **Step 1: 详情响应增加 `sourceType`**

- [ ] **Step 2: 手工单显示“修改”“导出”**

- 修改跳转 `/entry?merchant_no=...`。
- 导出打开 `/api/entry/{merchant_no}/export.xlsx`。

- [ ] **Step 3: 测试并提交**

```bash
npm --prefix frontend run test
npm --prefix frontend run typecheck
```

---

## Task 9: 文档与总验证

- [ ] 更新 `docs/ARCHITECTURE.md`
- [ ] 更新 `docs/DECISIONS.md`
- [ ] 更新 `docs/TODO.md`
- [ ] 更新 `docs/HANDOFF.md`
- [ ] 运行全量验证并如实记录

```bash
.venv/bin/python -m pytest backend/tests -q --basetemp=backend/.pytest-tmp
npm --prefix frontend run test
npm --prefix frontend run typecheck
npm --prefix frontend run build
```
