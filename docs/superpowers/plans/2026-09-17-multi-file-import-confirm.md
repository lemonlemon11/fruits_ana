# 计划：新模板多文件导入 + 二次确认 + 核心统计复审

> 2026-09-17 · 状态：实施中 · 相关：ADR-025～028 与
> `docs/superpowers/specs/2026-09-17-settlement-template-review-design.md`

## 结论

1. 旧 `/api/imports` 与 `ImportView.vue` 实际上已支持多文件上传，但它是“上传即入库”，
   没有新模板要求的 `preview → draft → confirm` 二次确认闭环。
2. 新模板解析当前实际不可用：`结算单模板样式-测试数据 1/2/3.xlsx` 因表头
   `数量（件）/ 单价（元）/ 金额（元）/ 规格（头数）/ 规格（KG）/ 品种` 未纳入
   别名映射，`_find_header_row` 找不到销售表头，导致商号解析失败。
3. 后端 `EntrySaleItemCreate.variety` 仍限 `^[A-Z]$`，会拒绝 `AB/BC`，与设计冲突。
4. 统计主链路已统一使用 `sale_record.grade`（动态转换）+ `quantity/amount`，但需要
   重新核对 AI 标题、导出说明、手工录单展示等边缘口径。

## 目标

- 新模板支持**一次选择多个文件**，上传后先解析为草稿，不写正式销售事实。
- 二次确认页复用/对齐手工录单界面，回填用户原值，显示系统计算值，问题行标红。
- 用户可修改；提交时有错误先提示，再次确认后允许带错提交，最终以用户确认值入库。
- `BC` 展示原文，统计按 `fruits_ana_admin` 字段转换规则动态归 C；不硬编码 `BC→C`。
- 单子修改留痕，草稿、版本、原值/最终值、修改人与原因可追溯。

## 表结构设计

| 表 | 变更 |
| --- | --- |
| `import_job` | 新增：一次多文件导入任务的父任务；token、状态、文件数、创建/确认人与时间。 |
| `import_draft` | 扩展：挂到 `import_job`，保存原始解析载荷、当前编辑载荷、版本、文件哈希/路径、问题清单与确认状态；一个文件对应一条草稿。 |
| `import_batch` | 新增 `import_job_id`；继续以 `merchant_no` 作为唯一业务键，保留 `confirmed_by/at/manual_edit_count` 留痕。 |
| `settlement_summary` | 增加文件原值审计列；正式金额列存**确认后自洽计算值**。 |
| `settlement_revision` | 新增：统一修改留痕表，记录草稿版本、分区、来源行、字段、原值、最终值、修改类型/人/时间/原因。 |
| `source_file` | 继续保存确认后的原始文件引用与哈希；草稿阶段由 `import_draft` 保存文件哈希和临时路径。 |

索引：

- `import_job.token` 唯一；`import_job(status, created_by, created_at)`。
- `import_draft.import_job_id`；`import_draft(token)` 唯一；`(import_job_id, status)`。
- `settlement_revision(import_batch_id)`、`(import_draft_id, version, section, source_row)`。

## 接口

- `POST /api/imports/preview`：multipart 多文件；解析并创建 `import_job` + 多条
  `import_draft`，返回 job、draft 列表、每个文件的问题和可编辑载荷；不写 `import_batch`。
- `GET /api/imports/jobs/{job_token}`：读取任务与草稿列表。
- `GET /api/imports/jobs/{job_token}/drafts/{draft_token}`：读取单条草稿详情。
- `PUT /api/imports/jobs/{job_token}/drafts/{draft_token}`：保存人工编辑，版本 +1，
  返回重新计算的问题/对账。
- `POST /api/imports/jobs/{job_token}/confirm`：对任务内每条草稿做最终校验和入库；
  入参带各 draft 的 `version`、`force`、`accepted_issues`。
- `POST /api/imports/jobs/{job_token}/discard`：放弃草稿。

确认入库策略：

- 商号冲突：任一草稿命中原有 `import_batch.merchant_no` 时，默认返回冲突，需要
  用户显式 `force=true`；单任务内多文件出现同一商号时也按冲突处理。
- 行级金额：以用户提交的 `sales_quantity` 与 `unit_price` 重算 `amount`，避免明细与
  汇总错位；文件原金额写入审计字段，差异生成 `data_issue`。
- 汇总：销售金额=Σ行金额、总件数=Σ销售数量、售后/费用=Σ明细、货款=销售−售后、
  应付=货款−费用；文件原合计进入审计字段，差异生成对账问题。
- 阻断项：无商号、日期/数量/等级无法解析、头数/KG 无法解析；提示项：金额不一致、
  汇总不一致、来货量与销量不等、市场名称变体。

## 解析器

- 新增/扩展新模板解析：识别 `商号/柜号/单号/转运公司/市场/到达市场日期/来货数量`；
  销售区 `品种/规格（头数）/规格（KG）/备注/数量（件）/单价（元）/金额（元）`；
  售后区 `内容/摘要/金额`；费用区 `摘要/金额`；合计区。
- 销售日期按用户要求向下继承实际日期，回填每一行。
- 市场按管理端字典做包含匹配，原文保留用于溯源。
- `BC/AB` 原文进入 `grade_raw`，统计等级由 `convert_grade` 动态生成。

## 前端

- 文件选择继续用现有 `ImportView` 的多文件选择逻辑，提交改为调用 `preview` 后跳转
  到二次确认页。
- 二次确认页按任务显示文件页签/列表，复用手工录单的表单结构与样式；行问题标红，
  系统计算值并排显示；有错误提交时弹两次确认。
- `EntryView.vue` 的品种下拉改为动态字段选项 + 允许 `AB/BC` 原文。

## 复审范围

- 统计：总览、趋势、结算单对比、详情、系列对比、等级细分、导出、顺仔问答、AI 提示词。
- 等级：所有分析用 `sale_record.grade`；展示用 `grade_raw`；动态规则替代硬编码。
- 汇总：销售金额、售后、费用、货款、应付统一从明细求和，不允许保存错位合计。
- 留痕：手工修改与导入确认修改均写 `settlement_revision`。

## 验证

- 后端新增 `test_import_template_parser.py`、`test_import_draft_api.py`、`test_import_job_service.py`。
- 前端新增 `import-review.test.ts`、更新 `entry-form.test.ts` 覆盖 `AB/BC`。
- 三份测试文件浏览器端到端：多选上传 → 草稿 → 标红 → 修改/确认 → 看板/明细核对。
- 回归 `pytest`、`npm test/typecheck/build`。

## 风险

- 这是核心表结构、API 契约与持久化变更，先只提供模型、迁移脚本与实现代码，
  不在未授权环境执行线上 DDL。
- 当前工作区有大量未提交改动，实施时保持局部修改，不清理在途内容。
- 新模板表头与现有旧解析器共用别名需小心，优先新增专用解析路径，避免破坏历史导入。
