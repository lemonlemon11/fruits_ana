# 等级细分分析 · 实施计划

> 日期：2026-09-11 ｜ 状态：已实现，待浏览器端到端验收 ｜ 作者：Codex
> 决策依据：ADR-013（下一阶段主线为等级细分）、ADR-002（A/B/C 主口径不变）

## 目标

把已入库但未使用的 `sale_record.grade_raw` 解析成更细的等级标签，
让果农看到「A5 和 A6 差多少钱」「B6/7 值不值得挑」，而不是只有 A/B/C 三档均价。

## 边界

- 不改 `grade` 字段与 A/B/C 主口径（ADR-002），细分是**叠加维度**。
- 不新增数据库列、不做库迁移；细分在服务层派生。
- 不新增第三方依赖。
- 无法识别的写法归入「其他」并计数暴露，不静默丢弃。

## 口径设计

### 实测原始写法（线上 35 种，节选）

```text
A5  A5（19.5KG）  A5(19.5KG)裂  A5/6（熟）  A5熟
A6  A6（19.5KG）  A6（黄皮）    A6熟/裂
B5  B5（19KG）    B5（19KG）裂  B6  B6（19KG）裂  B6/7(19KG)  B6/7熟  B6熟
B7  B7（19KG）    B7/5(大裂）
BC5  BC5(17KG)   BC5/7/8（17KG）  BC6  BC6(17KG)  BC7/8（17KG）  BC8（17KG）  BC9(17KG)
C6/8熟/裂  C6熟  C8  C8/9大裂
```

### 解析结构

一条 `grade_raw` 拆成 4 个部分：

| 部分 | 规则 | 示例 |
| --- | --- | --- |
| 大等级 | 前缀；`BC` 归入 `C`（沿用 ADR-002） | `BC8` → C |
| 号别 | 字母后、`（`/`(` 前的数字与斜杠 | `B6/7` → `6/7` |
| 箱重 | `NNKG` / `NN.5KG` | `19.5KG` → 19.5 |
| 品质 | `熟` / `裂` / `大裂` / `黄皮` | `A6熟/裂` → 熟、裂 |

### 分桶规则（待确认）

- **方案 A（推荐）**：单号各自成桶（`A5`、`A6`），区间本身成桶（`B6/7`、`C6/8`），
  多号区间保留原样（`BC5/7/8`）。**无损、不替业务做判断。**
- 方案 B：区间拆入相邻单号（`B6/7` 同时计入 B6 与 B7）。
- 方案 C：区间只取最小值（`B6/7` 记为 B6）。

品质后缀不参与分桶，作为可选的第二层筛选/标记。

## 实施步骤

1. 后端新增纯函数模块 `backend/app/parser/grade_detail.py`：`parse_grade_detail(grade_raw)`，
   返回 `{grade, number, box_weight_kg, qualities, label, recognized}`。
2. `backend/app/services/analytics_core.py` 增加 `grade_detail_metrics(records)`，
   按细分标签聚合件数、金额、均价、件数占比、金额占比。
3. `GET /api/analytics/series-comparison` 响应**追加** `grade_details` 字段
   （对外新增，不改已有字段，需同步 `frontend/src/api/types.ts` + `normalize.ts`）。
4. 前端新增 `frontend/src/components/GradeDetailTable.vue`：按大等级分组展示号别阶梯，
   标注均价与价差；接入「系列对比」页。
5. 测试：
   - 后端 `backend/tests/test_grade_detail.py`：覆盖 35 种真实写法、区间、未知写法、空值。
   - 前端 `frontend/tests/grade-detail.test.ts`：分组与排序、空状态。

## 验证方式

```bash
.venv/bin/python -m pytest backend/tests -q --basetemp=backend/.pytest-tmp
npm --prefix frontend run test
npm --prefix frontend run typecheck
npm --prefix frontend run build
```

- 另外用线上 4 单数据人工核对：细分件数之和必须等于该结算单总件数，金额之和一致。

## 风险

- 号别区间归属规则若选错，会产生与业务认知不符的阶梯价，因此**开工前必须确认**。
- 线上仅 4 单 / 35 种写法，未来可能出现新写法；需靠「其他」桶 + 数据质量计数兜底。
- `A5/6（熟）` 这类同时含区间与品质的写法，需明确品质是否也要拆开统计。

## 待确认

1. ~~分桶规则选 A（推荐）/ B / C？~~ 已定：方案 A。
2. ~~品质后缀（熟/裂/黄皮）是否需要单独出一层统计，还是只作为筛选项？~~ 已定：只做标记。
3. 果类：已定「后续可能会有其他水果」，按果类可插拔实现。
4. AI 小结：已定与本期一起交付。

## 实现结果（2026-09-11）

- 后端：`parser/grade_detail.py`、`services/grade_detail_service.py`、
  `services/grade_detail_analysis_service.py`；`series-comparison` 追加 `grade_details`；
  新增 `POST /api/analytics/grade-detail/analysis`。
- 前端：`SeriesComparisonView` 增加视图切换；新增 `SeriesGradeDetail.vue`、
  `GradeDetailAiAnalysis.vue`、通用 `AiAnalysisCard.vue`。
- 验证：后端 208 项、前端 73 项、typecheck、build 全部通过；dev-preview 桌面与移动端视觉验收通过。
- 真实数据：4 张结算单 → 16 个号别桶、0 条未识别，与设计稿数值一致。

## 设计稿（视觉伴侣 53001）

- 文件：`frontend/dev-preview/grade-detail-design.{html,css,js}` + `grade-detail-data.js`。
- 数据：线上 4 张结算单 / 86 行明细只读导出（35 种等级写法全部解析成功）。
- 内容：号别价格阶梯（方案 A/B/C 可切换）、数据表、品质标记（熟/裂/黄皮）、评审待定项。
- 启动：

```bash
python3 -m http.server 53001 --bind 0.0.0.0 --directory frontend/dev-preview
```

- 访问：`http://127.0.0.1:53001/grade-detail-design.html`
- 验收：Playwright 实测桌面 1440px 与移动 390px 均无横向溢出、无控制台报错；
  「元/件」不换行；方案切换后桶数从 16 变为 10 且提示同步更新。
- 设计要点：沿用 `frontend/src/styles.css` 的设计变量；柱状图按全局均价缩放，
  颜色对应 A/B/C；表格作为图表的无障碍替代；触控目标 ≥44px；正文 17px。

## 信息架构与扩展决策（2026-09-11）

### 入口：不新增一级菜单

- 果农版一级导航已收敛为 3 个入口（`frontend/src/AppShell.vue:15`），新增一级菜单会破坏收敛。
- 等级细分的筛选条件与「系列对比」完全一致（勾选结算单 + 到达日期），数据同源。
- 结论：做进「系列对比」页的视图切换（按系列 ↔ 按等级号别），不新建路由与重复筛选控件。
- 触发升级条件：当其需要独立筛选维度（如按果类、按客户）时，再评估拆为独立页。

### 果类维度：当前不做分组，但按果类组织数据结构

- 实测：线上 86 行明细 `fruit_type` 全部为「榴莲」，按果类分组只有一个分组，无分析价值。
- 字段与解析已就绪：`sale_record.fruit_type` 非空，parser 支持「品种 / 水果 / 水果名称」表头列
  （`backend/app/parser/settlement_parser.py:26`）。
- 结论：细分桶的键设计为「果类 + 大等级 + 号别」，当前单果类时退化为「大等级 + 号别」；
  第二种水果进来时自动分组，无需返工。
- 待确认：未来是否会有多种水果；若有，不同水果的号别体系可能不同，解析规则需按果类可插拔。

### AI 分析：复用现有机制，新增「号别小结」

- 复用 ADR-011 的 `ai_analysis` 缓存表、`PROMPT_VERSION` 机制与按需生成模式，新增
  `feature='grade-detail'`。
- 输入必须是细分聚合结果 + 样本量，提示词需明确「样本不足时不得下趋势结论」。
- 缓存键需包含**细分口径版本（方案 A）**、提示词版本、勾选结算单与日期范围；口径变更自动失效。
- 建议输出小标题：这批货的等级结构 / 哪个号最值钱 / 哪个号在拖后腿 / 可以留意的地方。
- 风险：当前仅 4 张结算单，AI 容易把噪声当规律，页面必须显著标注样本量。
