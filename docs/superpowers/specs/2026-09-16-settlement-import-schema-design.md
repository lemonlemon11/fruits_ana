# 结算单文件导入：表结构与严格解析重设计

- 日期：2026-09-16
- 作者：Codex（与用户逐字段确认后落稿）
- 状态：待用户复核
- 关联：ADR-015（单号命名适配）、ADR-016（商号规范化）、ADR-021/024（真实库保护）、
  ADR-025～028（录单 / 导入合并、品牌文件解析）
- 口径来源：`attachments/结算单模板样式.xlsx`（含单元格批注）

## 1. 背景与目标

业务侧已统一结算单的填写模板，并在模板单元格批注里写死了填写规则。此前导入链路要
「猜结构 + 兜异常」——AI 解析、等级/规格文本归一化、区间 min/max 派生、`needs_review`
人工复核等一整套容错设施，都是为脏数据准备的。

本设计把导入链路整体退化为**按固定模板严格解析**：读不出来就整单拒收并报行号，不再
产生「先记一笔待复核」的中间态。表结构随之收窄，模板之外的字段全部删除。

## 2. 范围

包含：

- 文件导入链路（上传结算单 → 解析 → 落库 → 覆盖旧单）
- 手工录单链路（`/entry`）：与导入共用同一批表，本次一起改成同一套字段
- 表结构、解析器、服务层、接口层、前端跟改、测试重写

不包含：

- 分析页的 AI 分析卡片与右下角「顺仔」问答（继续保留）
- 看板指标口径本身（A/B/C 件数、金额、加权均价、占比的算法不变）

## 3. 模板与填写规则（口径来源）

模板 `结算单模板样式.xlsx` 的 `结算单` 工作表，顶部标题占 `A1:H3`，各区块如下。

### 3.1 表头（标签在 `A` 列，值填在 `B` 列）

| 标签 | 批注规则 |
| --- | --- |
| `商号：` | 无 |
| `柜号：` | 无 |
| `单号：` | 「如香香-001」→ 格式为 `品牌名-序号` |
| `转运公司：` | 填车牌号 |
| `市场：` | 「填写如海吉星市场，江南市场等」 |
| `到达市场日期：` | 「只能填写日期」 |
| `来货数量（件）：` | 「只能填写纯数字」（模板附整数 `>=0` 校验） |

### 3.2 销售明细

表头行八列依次为：销售日期 / 品种 / 规格（头数）/ 规格（KG）/ 备注 / 数量（件）/ 单价（元）/ 金额（元）。

| 列 | 批注规则 |
| --- | --- |
| 销售日期 | 「日期」 |
| 品种 | 「只能填写等级（A-Z）」 |
| 规格（头数） | 「纯数字」 |
| 规格（KG） | 「纯数字」 |
| 备注 | 「填写裂果、熟等例外情况」 |
| 数量（件） | 「纯数字」 |
| 单价（元） | 「纯数字」 |
| 金额（元） | 「自动将该行数字和单价相乘得出结果」 |

### 3.3 售后 / 支出费用 / 汇总

| 区块 | 结构 | 批注规则 |
| --- | --- | --- |
| 售后 | 「内容 / 摘要 / 金额」逐行 + 合计 | 金额合计为售后金额总和 |
| 支出费用 | 「摘要 / 金额」逐行 + 费用合计 | 摘要默认预置代卖佣金、运费、车位费、入场费、搬运费、打冷费六项；金额「纯数字，可输入小数点」 |
| 汇总 | 总件数、销售金额、售后合计、货款合计、费用合计、应付总额 | H15＝全部销售金额之和；H23 货款合计＝销售金额−售后金额；H34 应付金额＝销售金额−售后金额−支出金额 |

### 3.4 用户确认的口径补充

1. 转运公司填车牌号，列名沿用 `vehicle_no`；到港日期不再保留。
2. 品牌**由单号前缀提取**，不再在导入表单里手选。
3. 头数只允许整数，旧的 `7/8`、`5/7/8` 区间写法不再支持。
4. 规格（KG）允许小数。
5. 等级为单个英文字母，**不再做 BC → C 归并**。
6. 销售日期每行都要填，解析时不做向下填充。
7. 金额落库，并强校验等于「数量 × 单价」。
8. 售后金额填正数，语义是扣减额。
9. 清关费不再出现，`customs_tax` 删除；支出费用摘要允许自定义，模板只做六项预填。
10. 售后、支出费用两块允许整块为空（0 行）。
11. 旧的「损/少果」「验果抽检」一类非销售行不再记录。
12. 同商号重复导入＝后覆盖前。
13. 商号会以「单637」和「637」两种写法出现，规范化链路保留。

## 4. 表结构

### 4.1 `import_batch`（一个文件 = 一张结算单）

| 列 | 类型 | 约束 |
| --- | --- | --- |
| `id` | INT PK | |
| `source_type` | VARCHAR(16) | 必填，`import` / `manual`，用于区分导入单与手工单 |
| `file_name` | VARCHAR(255) | 导入单必填（追溯用），手工单为空 |
| `merchant_no` | VARCHAR(64) | 必填，按文件原样保存 |
| `merchant_no_normalized` | VARCHAR(64) | 必填，**唯一索引**，覆盖判定键 |
| `order_no` | VARCHAR(64) | 必填，格式 `品牌名-序号` |
| `brand` | VARCHAR(32) | 必填，由 `order_no` 前缀提取，须命中品牌字典 |
| `container_no` | VARCHAR(64) | 必填 |
| `vehicle_no` | VARCHAR(64) | 必填，车牌号 |
| `market` | VARCHAR(64) | 必填，须命中市场字典 |
| `arrival_date` | DATE | 必填 |
| `arrival_quantity` | INT | 必填，≥ 0 |
| `imported_at` | DATETIME | 必填，导入时间 |

覆盖判定键从原始 `merchant_no` 改为 `merchant_no_normalized`：既然同一个商号会出现
「单637」与「637」两种写法，用原始值做唯一键会导致同一张单重复入库而不触发覆盖。

### 4.2 `sale_record`（销售明细）

| 列 | 类型 | 约束 |
| --- | --- | --- |
| `id` | INT PK | |
| `import_batch_id` | INT FK → `import_batch.id` | 必填，删除级联 |
| `sale_date` | DATE | 必填 |
| `grade` | CHAR(1) | 必填，单个英文字母，入库统一大写 |
| `piece_count` | INT | 必填，> 0 |
| `spec_kg` | DECIMAL(6,2) | 必填，> 0 |
| `remark` | VARCHAR(64) | 可空 |
| `quantity` | INT | 必填，> 0 |
| `unit_price` | DECIMAL(10,2) | 必填，> 0 |
| `amount` | DECIMAL(14,2) | 必填，＝ `quantity × unit_price` |

### 4.3 `settlement_after_sale_item`（售后）

| 列 | 类型 | 约束 |
| --- | --- | --- |
| `id` | INT PK | |
| `import_batch_id` | INT FK | 必填，删除级联 |
| `sort_order` | INT | 必填，保持文件内顺序 |
| `content` | VARCHAR(64) | 可空（对应模板「内容」） |
| `summary` | VARCHAR(64) | 可空（对应模板「摘要」） |
| `amount` | DECIMAL(14,2) | 必填，正数，语义为扣减额 |

### 4.4 `settlement_fee_item`（支出费用）

| 列 | 类型 | 约束 |
| --- | --- | --- |
| `id` | INT PK | |
| `import_batch_id` | INT FK | 必填，删除级联 |
| `sort_order` | INT | 必填，保持文件内顺序 |
| `name` | VARCHAR(64) | 必填，自由文本（对应模板「摘要」） |
| `amount` | DECIMAL(14,2) | 必填，> 0 |

### 4.5 `settlement_summary`（汇总快照，与批次一对一）

| 列 | 类型 | 说明 |
| --- | --- | --- |
| `import_batch_id` | INT FK，唯一 | |
| `sales_piece_count` | INT | 总件数 |
| `sales_amount` | DECIMAL(14,2) | 销售金额 |
| `after_sale_amount` | DECIMAL(14,2) | 售后合计 |
| `goods_amount` | DECIMAL(14,2) | 货款合计 |
| `fee_amount` | DECIMAL(14,2) | 费用合计 |
| `payable_amount` | DECIMAL(14,2) | 应付总额 |

六项均可由明细算出，落库是为了列表页与看板免聚合，并保留「文件写的值」这一事实。

### 4.6 保留不动的表

`source_file`（原始文件留档：文件名、哈希、存储路径，随批次级联删除）、
`entry_field_option`（市场 / 品牌 / 品种字典）、`user` / `user_session` / `admin_*`。

`entry_field_option` 的 `variety` 字典沿用 `A`～`F`；解析不依赖字典校验等级，
只校验「单个英文字母」。支出费用不再用 `is_custom` / `fee_kind` 标记类型，模板预填的六项
改为放进字典（`field_key='fee'`），模板外摘要一律允许。

## 5. 解析与校验规则

### 5.1 定位方式

按**标签文本**定位区块，不写死行号，这样业务在模板里插行不会导致解析错位：

- 表头：在 `A` 列查找 `商号：`、`柜号：`、`单号：`、`转运公司：`、`市场：`、
  `到达市场日期：`、`来货数量（件）：`，取值取同行的 `B` 列
- 明细区：从「销售日期」表头行下一行开始，到 `B` 列为 `总件数` 的汇总行为止
- 售后区：从「售后 / 内容 / 摘要 / 金额」表头行的下一行开始，到「售后合计」行为止
- 费用区：从「支出费用：」行下一行开始，到「费用合计」行为止

明细区内允许空行；非空行必须是合法明细行，否则按行号报错。

### 5.2 行级校验

| 校验项 | 规则 |
| --- | --- |
| 表头必填 | 商号、柜号、单号、转运公司、市场、到达市场日期、来货数量均不得为空 |
| 市场字典 | `market` 必须命中 `entry_field_option(field_key='market')` |
| 单号格式 | 必须能按第一个 `-` 切出「品牌 + 序号」，且品牌命中品牌字典 |
| 销售日期 | 必须是日期 |
| 品种 | 单个英文字母（`^[A-Za-z]$`），入库统一大写 |
| 规格（头数） | 正整数 |
| 规格（KG） | 正数，最多两位小数 |
| 数量（件） | 正整数 |
| 单价（元） | 正数，最多两位小数 |
| 金额（元） | 必须严格等于「数量 × 单价」（按两位小数四舍五入比较） |
| 明细行数 | 至少 1 行 |
| 售后金额 | 必须为正数（填写负数视作错误） |
| 费用金额 | 必须为正数；空视为 0，不落行 |

### 5.3 合计校验

文件里的总件数、销售金额、售后合计、货款合计、费用合计、应付总额，六项都必须与系统
按明细算出的值一致，不一致时报出**具体是哪一项**以及「文件值 / 计算值」。

### 5.4 失败处理

任一校验不通过：**整单拒收，事务回滚，不落批次**，接口返回结构化错误列表
（`区块 + 行号 + 字段 + 原因 + 原始值`）。不再有 `needs_review`、`confidence`、
`data_issue` 这类「先入库再复核」的路径。

## 6. 覆盖与事务

- 唯一键：`import_batch.merchant_no_normalized`
- 同商号再次导入：在同一事务内删除旧批次（级联明细 / 售后 / 费用 / 汇总 / 源文件记录），
  写入新批次，沿用现有 `obsolete_storage_path` 机制清理旧文件
- 解析或写入失败：整单不产生任何记录；并发下的唯一键冲突按「已存在同商号」返回
- 手工录单保持现有交互：命中同商号先返回 `conflict` 让用户确认，确认后再覆盖；导入不询问，
  直接后覆盖前
- 覆盖判定同样改用 `merchant_no_normalized`，避免「单637」与「637」被当成两张单

## 7. 下线清单

**列**：`sale_record` 的 `grade_raw`、`spec_raw`、`suffix`、`sales_region`、`source_row`、
`raw_row_text`、`confidence`、`needs_review`、`review_note`、`piece_count_min`、
`piece_count_max`、`spec_kg_min`、`spec_kg_max`、`fruit_type`（品种即等级，不再冗余固定值
「榴莲」）；`import_batch` 的 `parse_mode`、`parse_profile`、`parse_model`、
`parse_confidence`、`status`、`success_count`、`warning_count`、`failure_count`、
`error_summary`、`confirmed_by`、`confirmed_at`、`manual_edit_count`、
`order_no_normalized`；`settlement_summary` 的 `customs_tax`、`reconcile_status`、
`reconcile_detail`、`fee_detail`、`remark`；`settlement_after_sale_item` 的 `item_type`
（不再有损耗 / 抽检 / 补果等非销售行）；`settlement_fee_item` 的 `is_custom`、`fee_kind`、
`source_row`、`raw_row_text`。

**表**：`data_issue`、`import_draft`。

**模块**：`backend/app/parser/spec_range.py`、`frontend/src/utils/specRange.ts`、
`backend/tests/test_spec_range.py`、`frontend/tests/spec-range.test.ts`、
`backend/tests/fixtures/spec_cells_2026-09-16.json`（501 行区间回归集，随区间写法作废）、
AI 解析相关分支（`parse_mode='ai'` 路径与其调用方）。

`order_no_normalized` 一并删除：单号在新规范里已是固定格式 `品牌名-序号`，无需适配；
商号因为两种写法并存，保留 `merchant_no_normalized`。

## 8. 迁移方式

开发库业务数据已于 2026-09-16 清空，因此**不写数据迁移脚本**：改完 `models.py` 后执行
一次清库重建即可。

```bash
cd backend
FRUIT_ANALYSIS_ALLOW_DESTRUCTIVE=1 ../.venv/bin/python scripts/rebuild_dev_schema.py --business --apply
```

账号、角色、录单字典（`user` / `admin_*` / `entry_field_option`）保留；重建后用
`scripts/load_tickets.py --apply` 或导入页重新灌数据。

## 9. 影响面

- 后端模型：`backend/app/models.py`
- 解析：`backend/app/parser/settlement_parser.py`、`backend/app/parser/settlement_summary.py`
- 服务：`backend/app/services/import_service.py`、`entry_service.py`、
  `settlement_list_service.py`、`settlement_analytics_service.py`、`entry_export.py`、
  `settlement_list_export.py`
- 接口与契约：`backend/app/schemas.py`、`api/imports.py`、`api/entry.py`、`api/exports.py`、
  `api/settlements.py`
- 脚本：`backend/scripts/load_tickets.py`、`add_entry_schema.py`
- 前端：`views/ImportView.vue`（去掉「选品牌」步骤）、`views/EntryView.vue`、
  `utils/entryForm.ts`、`api/types.ts`、`api/normalize.ts`、相关文案与图表取值
- 测试：后端 `tests/test_import_service.py`、`test_entry_service.py`、`test_entry_api.py`、
  `test_settlements_api.py`、`test_exports.py` 等按新字段重写；前端
  `tests/import-view-binding.test.mjs`、`entry-form.test.ts` 等同步

数据口径变更（等级不再 BC→C、规格不再支持区间、清关费取消、覆盖键改用归一后商号、
导入不再有 AI 解析与人工复核）需记入 `docs/DECISIONS.md`（拟 ADR-029）。

## 10. 验证方案

1. 后端：`.venv/bin/python -m pytest backend/tests -q --basetemp=backend/.pytest-tmp`
2. 前端：`npm --prefix frontend run test`、`run typecheck`、`run build`
3. 端到端：需要业务用新模板填一份真实样例（当前 `tickets/` 下 17 份均为旧格式，
   按新规则会被整单拒收），导入后比对总件数、销售金额、售后合计、货款合计、费用合计、
   应付总额与文件一致
4. 负向用例：逐条构造违规文件（缺必填、等级写成 `BC`、金额与数量×单价不符、合计对不上、
   头数写成区间、售后填负数），确认整单拒收且报出行号与字段
5. 覆盖用例：同商号以「单637」与「637」两种写法先后导入，确认是覆盖而非新增
6. 旧格式回归：用 `tickets/` 下的旧文件验证「整单拒收 + 报出行号与字段」，不产生半截数据

## 11. 关键决策

| 编号 | 决策 | 理由 |
| --- | --- | --- |
| D1 | 导入链路去掉 AI 解析，改为严格模板解析 | 模板固定后无需猜结构 |
| D2 | 解析失败整单拒收，不落任何记录 | 业务已规范，错误应即时暴露 |
| D3 | 头数改整数、删除区间与 min/max 派生列 | 客户确认只填整数 |
| D4 | 等级存单个字母，不做 BC → C 归并 | 客户确认新数据不会出现 BC |
| D5 | 删除清关费相关字段 | 客户确认后续不再出现 |
| D6 | 售后金额统一正数语义 | 避免正负混用 |
| D7 | 覆盖唯一键改用 `merchant_no_normalized` | 同一商号存在两种写法 |
| D8 | 支出费用摘要允许自定义，模板只预填六项 | 客户确认 |
| D9 | 保留分析页 AI 与「顺仔」 | 只砍导入解析 |
