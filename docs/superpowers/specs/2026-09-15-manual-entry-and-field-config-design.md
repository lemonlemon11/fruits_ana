# 手工录单与录单字段配置设计

> 日期：2026-09-15
> 状态：需求已确认，待实现
> 关联系统：`fruits_ana`（业务端）、`fruits_ana_admin`（管理端）

## 1. 背景与目标

现有 `fruits_ana` 只能通过上传 Excel/CSV 导入结算单。业务人员需要一套手工录单界面，
按固定模板录入销售、售后与支出数据，并在管理端维护“市场”“品种”两个下拉字典。

目标：

- 在业务端新增手工录单、再次修改和按模板导出。
- 在管理端新增录单字段配置，仅 `fruit_admin` 角色可访问。
- 手工单复用现有 `import_batch`、`sale_record`、`settlement_summary`，
  确保分析、详情、对比页面无需另建数据链路。

## 2. 范围

### 2.1 范围内

- 手工录入结算单，含销售、售后、支出费用动态行。
- 同商号冲突确认与覆盖。
- 从详情页再次修改手工单。
- 按 `attachments/结算单模板样式.xlsx` 导出，导出值不带公式。
- 管理端维护市场、品种下拉字典。
- 业务端角色权限控制。

### 2.2 范围外

- 不新增完整用户/角色管理；复用管理端已有 RBAC。
- 不修改导入解析的存量 `BC → C` 规则。
- 不实现手工单的历史版本或草稿自动保存。
- 不新增依赖。

## 3. 关键决策

- 商号仍是业务唯一键；手工单与导入单同键冲突，最新一次覆盖。
- 手工单只允许 `source_type=manual` 的记录被再次修改；导入单仍走重新导入覆盖。
- 品种下拉只允许配置单个大写英文字母；当前预置 `A-F`，后续可在管理端扩展。
- 新录单不产生 `BC`；存量导入数据继续兼容 `BC → C`。
- 数量与金额自动计算且只读：
  - `数量 = 件数 × 规格(KG)`
  - `金额 = 数量 × 单价`
- 售后金额按正数录入。
- 支出费用固定六项始终显示；自定义支出项由录单员在录单页动态新增/删除，不在后台配置。
- 导出按模板版式，只填值，不保留公式。

## 4. 数据模型

### 4.1 扩展 `import_batch`

- `source_type`：`String(16)`，默认 `import`，取值为 `import` / `manual`。
- `market`：`String(128)`，可空。
- `arrival_date`：`Date`，可空。
- `arrival_quantity`：`Integer`，可空。

### 4.2 扩展 `sale_record`

- `piece_count`：`Integer`，可空，手工单必填。
- `spec_kg`：`Numeric(18, 2)`，可空，手工单必填。

手工单字段映射：

- `fruit_type = 榴莲`
- `grade_raw = 品种值`
- `grade = normalize_grade(品种值)`
- `spec_raw = str(spec_kg)`
- `quantity = piece_count * spec_kg`
- `amount = quantity * unit_price`

### 4.3 新增 `settlement_after_sale_item`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | Integer PK | 主键 |
| import_batch_id | FK | 关联结算单 |
| content | String(255) | 内容 |
| summary | String(255) | 摘要 |
| amount | Numeric(18,2) | 金额 |
| sort_order | Integer | 排序 |

### 4.4 新增 `settlement_fee_item`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | Integer PK | 主键 |
| import_batch_id | FK | 关联结算单 |
| name | String(128) | 费用名称 |
| amount | Numeric(18,2) | 金额 |
| is_custom | Boolean | 是否自定义 |
| sort_order | Integer | 排序 |

### 4.5 新增 `entry_field_option`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | Integer PK | 主键 |
| field_key | String(32) | `market` / `variety` |
| value | String(64) | 选项值 |
| sort_order | Integer | 排序 |
| is_active | Boolean | 是否启用 |
| created_at / updated_at | Datetime | 审计时间 |

唯一索引：`field_key + value`。

## 5. 权限设计

新增业务权限：

- `entry:view`：查看录单页。
- `entry:create`：新建/保存录单。
- `entry:update`：修改手工录单。
- `entry:export`：导出手工录单。

角色授权：

| 角色 | 录单 | 修改 | 导出 | 字段配置 |
| --- | --- | --- | --- | --- |
| fruit_admin | 是 | 是 | 是 | 是 |
| operator | 是 | 是 | 是 | 否 |
| data_entry | 是 | 是 | 是 | 否 |
| viewer | 否 | 否 | 否 | 否 |

业务端后端必须校验权限，不能只靠前端隐藏入口。

管理端字段配置不走管理端 `ADMIN_PERMISSION_CODES`，新增 `require_fruit_admin`
依赖，只允许业务角色 `fruit_admin` 访问。

## 6. 接口设计

### 6.1 业务端

- `GET /api/entry/field-options?field=market|variety`
- `POST /api/entry`
- `GET /api/entry/{merchant_no}`
- `PUT /api/entry/{merchant_no}`
- `GET /api/entry/{merchant_no}/export.xlsx`
- 扩展 `GET /api/analytics/settlements/{merchant_no}`，返回 `source_type` 与录入基础信息。

冲突处理：

- `POST /api/entry` 默认不覆盖；同商号存在时返回 `409`，响应携带已有商号/单号。
- 前端确认后携带 `overwrite=true` 重试。

### 6.2 管理端

- `GET /api/admin/entry-field-options?field=market|variety`
- `POST /api/admin/entry-field-options`
- `PATCH /api/admin/entry-field-options/{option_id}`
- `DELETE /api/admin/entry-field-options/{option_id}`
- 可选排序接口：`PUT /api/admin/entry-field-options/order`

## 7. 计算口径

- 总件数 = Σ 销售行件数
- 销售金额 = Σ 销售行金额
- 售后合计 = Σ 售后行金额
- 货款合计 = 销售金额 - 售后合计
- 费用合计 = 固定六项金额总和 + 自定义支出项金额总和
- 应付贵方总金额 = 销售金额 - 售后合计 - 费用合计

精度：

- 金额、单价、规格、数量：两位小数。
- 件数、来货数量：整数。
- 后端统一使用 `Decimal`。

## 8. 导出

- 模板：`attachments/结算单模板样式.xlsx`。
- 导出文件只写计算后的值，不写公式。
- 固定支出项按固定顺序导出。
- 自定义支出项动态插入。
- 售后行、销售行按录入顺序导出。

## 9. 验证

- 业务端后端 pytest：录入、冲突、覆盖、权限、公式、导出。
- 业务端前端测试：动态行、自动计算、冲突交互、路由权限。
- 管理端前端 `typecheck` / `build`。
- 浏览器手工回归：录单 → 详情 → 修改 → 导出。

## 10. 初始字典

- `variety` 预置：`A`、`B`、`C`、`D`、`E`、`F`。
- `market` 不预置假数据，由 `fruit_admin` 在管理端新增。
