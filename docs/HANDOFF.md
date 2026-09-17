# HANDOFF

Last updated：2026-09-18 (CST)
Written by：Codex（内容由当前工作区实测生成，非对话记忆）

> 2026-09-18 上线前清理：`fruits_ana` 删除旧 `EntryHubView.vue`、将 `tickets/` 加入
> `.gitignore`、页签改为只保留当前会话不跨刷新缓存；`fruits_ana_admin` 已推送 `origin/main`。

## Current Goal

本轮（2026-09-17）收口新结算单模板多文件导入与二次确认：
1) 多文件预览草稿闭环：`POST /api/imports/preview` → `import_job/import_draft` →
   `/import-review` → `confirm_import_job`；确认前不写正式事实；
2) 字段转换与统计口径：`field_conversion.convert_grade()` 按管理端规则生成 `sale_record.grade`，
   `grade_raw` 保留原文；`AB` 默认独立，配置 `BC→C` 后统计归 C；
3) 修改留痕：`settlement_revision` 同时覆盖导入复核修改与手工单覆盖修改；
4) 表结构新增 `import_job` / `import_draft` / `settlement_revision`，并给
   `import_batch` / `import_draft` / `settlement_summary` 增审计列。

历史两条线（2026-09-15）保留：
1) 「手工录单 + 录单字段配置」：`fruits_ana` 新增 `/entry` 录单页与录单 API，
   `fruits_ana_admin` 新增「录单字段配置」页，仅 `fruit_admin` 可维护市场 / 品种字典；
   商号冲突沿用现有导入覆盖语义，手工单支持再次修改和按模板导出；
2) **真实库误删事故的恢复**（ADR-021）：已用留存上传原件重建业务数据并通过快照校验，
   并已补上「非测试库禁止 destructive metadata 操作」的硬保护（ADR-024）；
3) **自然语言数据问答「顺仔」**（ADR-023）：用 Text-to-API 让用户通过提问查数据，
   已从 `53001` 预览页整合进正式外壳（`frontend/src/components/AskWidget.vue`：右下角悬浮
   机器人按钮 + 微信式对话窗），数字全部复用现有分析服务。

## Current Status

**提交收口（2026-09-18）**：工作区功能代码、测试与设计文档已提交到 `dev`；
`tickets/` 为业务源文件，保持未跟踪，不随代码提交。

状态：手工录单与字段配置已完成；真实库已恢复（ADR-021）且已补硬保护（ADR-024）；
新模板多文件导入已代码落地并通过前端 typecheck/test/build 与后端定向 pytest；
仍需用户在运维窗口执行新表/列迁移并配置管理端 `BC→C` 规则。

**新模板多文件导入与二次确认（2026-09-17，ADR-030，未提交）**：

- 新解析器：`backend/app/parser/settlement_template.py`，覆盖基本信息、销售、售后、费用、文件合计；
  销售日期首行填写后向下继承；`variety` / `grade_raw` 保留 `AB` / `BC` 原文。
- 草稿与任务：`ImportJob` 一任务多文件，`ImportDraft` 单文件槽位 JSON + 原文 JSON + 问题清单；
  预览只写草稿，确认接口才写 `ImportBatch/SourceFile/SaleRecord/SettlementSummary/DataIssue`。
- 二次确认页：`frontend/src/views/ImportReviewView.vue` 多页签回填原值、显示系统金额/合计，
  错误红行、提示黄行；保存草稿重新校验；确认有错/冲突时先 409，二段确认后 `force=true` 带错提交。
- 多页签已改为切换前自动保存当前草稿，避免用户只保存当前页导致其他页签修改丢失；
  销售行原始 `amount` 已随草稿回传保留，系统金额与文件金额对账不会失真。
- 草稿校验补充到达日期/来货数量/销售日期/品种格式校验，避免确认入库阶段因非法值触发 500；
  `settlement_revision` 同时记录基本信息字段修改，`manual_edit_count` 按草稿留痕统计。
- 商号冲突：与库内已有 `import_batch.merchant_no` 冲突时 409；同一任务内商号重复也会冲突，
  force 时最后一个草稿生效，早先重复草稿置 `discarded`。
- 金额口径：正式入库以系统计算为准——销售金额=数量×单价，总件数/各项合计全部从明细重算；
  文件写错的原值保存到 `settlement_summary.file_*`。
- 前端二次确认页与手工录单页的“总件数”已统一为销售数量之和，不再按规格头数合计。
- 等级口径：`SaleRecord.grade_raw` 展示原文，`SaleRecord.grade` 动态按
  `admin_field_conversion_rule` 生成；`StandardGrade` 与前端 `Grade` 均支持 `AB`。

**品牌文件 AI 解析的 P0 已落地：规格/头数文本化 + A1~A11 口径（2026-09-16，ADR-027/028，未提交）**：
客户已逐条拍板异常数据处理方案（确认单 `docs/2026-09-16-导入异常数据处理确认单.md`
第二节 A 组），据此把规格与头数从数值列改成**归一后的文本 + 派生 min/max 数值列**：

- 唯一入口 `backend/app/parser/spec_range.py`（`parse_spec_range()` 返回 `canonical/min/max`，
  `split_spec_cell()` 拆等级/头数/KG/后缀），前端镜像在 `frontend/src/utils/specRange.ts`，
  两边同一套规则、同一批用例。
- 口径：`3/4`、`6/8`、`5/7` 保留区间；`B3/B4`→`3/4`、`B7/5`→`5/7`；`5/7/8` 三段原样保留
  （min/max 取 5/8）；`9/10KG`、`10/11KG` 保留且不合并；后缀（熟/裂/尾/硬包…）不参与计算只进备注；
  没有 KG 的行留空并标红人工补全（全品牌 67 行，其中宝贝 47 行）。
- 数据：`sale_record.piece_count` / `spec_kg` 改 `VARCHAR(32)`，新增
  `piece_count_min/max`、`spec_kg_min/max`（`NUMERIC(18,2)`，标量指标取上限）；
  导入链路（`settlement_parser._record`）与手工录单链路（`entry_service._sale_model`）都写这套字段。
- 回归集：`tickets/` 17 个 xlsx 的 501 行销售规格冻结为
  `backend/tests/fixtures/spec_cells_2026-09-16.json`，用例 `backend/tests/test_spec_range.py`
  断言「501 行全部可拆出头数、67 行缺 KG、4 行 KG 区间、头数区间写法集合」。

**待用户执行（我不会自动跑）**：开发库 `fruits_ana` 里 `piece_count` 仍是 `INTEGER`、
`spec_kg` 是 `DECIMAL(18,2)`，需要清库重建后重新导入 `tickets/`：

```bash
cd backend
.venv/bin/python scripts/rebuild_dev_schema.py                       # 演练，只打印目标库与表
FRUIT_ANALYSIS_ALLOW_DESTRUCTIVE=1 .venv/bin/python scripts/rebuild_dev_schema.py --apply
```

重建后由导入页把 `tickets/` 的 17 个 xlsx 重新导入（重复的 638 两份文件、香香目录里的
宝贝单等仍按确认单 C 组的待定口径处理）。`backend/scripts/add_entry_schema.py` 已同步新列定义，
并对旧类型给出「需要重建」提示。

**导入与手工录单合并为一个菜单入口（2026-09-15，ADR-025，未提交）**：侧栏第三项由
「数据导入」改为「录单 / 导入」，指向新页面 `/entry-hub`（方案 C）：先选录入方式——
「文件导入 / 手工录单」两张卡片，再列出最近 3 条导入批次（状态胶囊）与本地未完成的手工单
（「继续录单」跳 `/entry?draft=1`）。`/imports`、`/entry` 路由与页签保持不变，只做分流；
`AppShell.vue` 的导航项扩展为 `ShellNavItem { path; label; icon; matches? }` 并新增
`isNavActive()`，让三个路径共享同一菜单高亮（`/entry-hub` 必须排在 `/entry` 之前）。
手工单草稿只存浏览器 `localStorage`（键 `fruit-entry-draft:v1:<userId>`，防抖 800ms 写入、
保存成功后清除），纯逻辑在 `utils/entryDraft.ts`；无 `entry:view` 的角色只看到「文件导入」
卡片与导入记录，后续新增同级入口沿用 `matches` 沿用本结构。

**录单字段配置改版与录单页收窄（2026-09-15，未提交）**：管理端「录单字段配置」从选项卡
改为左侧字段树 + 右侧选项面板，树按「基本信息 / 销售明细」分组，后续新增字段只需扩展
`FIELD_TREE`；选项排序改为拖拽，新增 `PUT /api/admin/entry-field-options/reorder` 批量持久化。
市场字典当前为「海吉星2 / 江南市场」（`海吉星2` 疑似验收改名残留，已记 TODO 待业务确认）。
业务端录单页去掉 1180px 居中上限和额外左右留白，
品种下拉列增加最小宽度，销售表在移动端改为卡片内横向滚动，消除页面级横向溢出。

**列表通用化与结算单列表现观（2026-09-16，未提交）**：新增通用列表组件
`frontend/src/components/DataTable.vue`——列配置驱动（`columns / rows / rowKey`），
`cell-<key>` 插槽自定义单元格，`numeric` 右对齐 + 等宽数字，`emphasis` 文字列加粗，
`bordered` 完整网格（剩余场景用浅色列分隔线），空数据自动占位行，`footer` 插槽用于内嵌
分页 / 合计行（留在表格外框内侧，与数据区一起构成一个整体，且不随数据区滚动）；
高度交给父级，父级限高时表头吸顶、只有列表内部滚动。`SettlementListView.vue` 由手写
`<table>` 改为该组件，分页条移进 `#footer` 插槽内嵌在表格底部（移动端卡片模式只隐藏数据区，
底栏分页排到卡片下方，`order` 控制顺序），并在桌面端
收紧顶部区块、把整页上限改为 `max-height: max(32rem, calc(100dvh - var(--settle-reserved)))`：
默认每页 10 行在 1440×900 / 1600×900 / 1920×1080 下全部完整显示且整页不滚动；行数超过可视
高度时只压缩列表区域并在内部滚动（吸顶表头 + 常驻分页）。翻页控件靠左排，右下角整块留空，
避免被「顺仔」悬浮入口盖住点不到。其余页面（录单记录、导入记录、结算单详情 trace 表、
系列对比等级表）仍是手写 `<table>` + 全局 `.table-wrap` 样式，可按同一组件继续迁移。

**生产库误删与恢复（2026-09-15，ADR-021）**：调试脚本 `import app.db` 后执行
`Base.metadata.drop_all(bind=engine)`，真实库 `fruits_ana` 的 12 张表被删
（binlog `binlog.000004` 末尾连续 12 条 DROP 为证，随后因 `admin_role` 外键报错中断）。
恢复动作：① 先导出存活 8 表为回滚点
`backend/data/recovery/backup-surviving-tables-20260915-140439.sql`；
② `init_db()` 重建 13 张缺失表（库内 23 表）；③ 用 `backend/data/uploads/` 的 12 个 xlsx
按原顺序重放导入，恢复 12 张结算单 / 364 条销售明细 / 12 条摘要 / 1 条 `data_issue`；
④ 管理端 `seed_admin_data` 重建 `admin_permission`(15) / `admin_role_permission`(43) /
`admin_user_role`(1) / 录单菜单；⑤ 与 09-11 快照逐字段比对 1244 个字段，差异仅为预期元数据。
不可恢复：8 个文件的原始文件名、历史导入/存储时间戳、`ai_analysis` 缓存、
`admin_notification` 通知、全部登录会话（用户需重新登录）。

**同品牌经营分析小标题（2026-09-15，ADR-022）**：结算单详情 AI 卡片原先固定输出 9 个小标题，
导致只有 A/B/C 的单据也渲染「D果 / E果 / F果 / 其他」空小节。现改为按当前结算单实际存在的
等级动态生成小标题，`PROMPT_VERSION` `v1 → v2`，前端 `parseAnalysisSections` 丢弃
「暂无数据」占位行兜底。

**数据问答「顺仔」已整合进正式外壳（2026-09-15，ADR-023）**：新增 `POST /api/ask` 与
`ask_service` / `ask_tools` / `ask_payloads` / `ask_tool_schemas`，只读工具复用现有分析服务；
前端新增 `AskWidget.vue` + `ask-widget.css` + `utils/askWidget.ts`（右下角悬浮机器人按钮 +
微信式左右气泡对话窗，机器人称「顺仔」），挂在 `AppShell.vue`，与「回顶部」按钮用
`askOpen` 状态互斥避让（对话窗打开时隐藏回顶部），z-index 保持 35/40/45 不动。
权限按业务要求收口：新增 `ask:view`（仅 `fruit_admin` 持有），后端 `require_permission` + 前端
`canAsk` 双层拦截，未授权角色连悬浮按钮都不渲染。
按客户反馈收口：不设常见问题、不显示模型名、不显示「本次用到的数据」溯源面板、
输入内容变长不出现滚动条；右下角常驻悬浮按钮（机器人头像 + 名称），点击展开
`min(460px, 100vw-48px)` × `min(720px, 100vh-140px)` 对话窗，Esc 或点关闭可收起。
真实浏览器验证：登录 → 提问 → 答案正常，品牌汇总走 `compare_settlements` 后端合计，
采购成本等系统外数据会明确拒答。详见 Test Status。
移动端遮挡专项修复（2026-09-15）：≤820px 时对话窗改为跟随 `visualViewport` 的「可视视口」
（`--ask-vv-height` / `--ask-vv-top`，取不到有效高度时回落 `100dvh`），软键盘弹出整窗收缩、
输入区始终留在键盘上方；刘海与底部横条按 `env(safe-area-inset-*)` 避让；消息区改
`min-height: 0` 可收缩，短视口不再裁掉发送按钮；站内通知横幅在对话窗打开时不再压住窗口。
悬浮入口视觉改版（2026-09-15，客户反馈）：去掉按钮旁的「顺仔」文字标签；旧 PNG 头像
（白底 + 第三方水印）换成自绘矢量吉祥物 `frontend/public/durian-mascot.svg`——Q 版榴莲
从绿色果壳里探出半个头「在观察」，透明底、缩放不糊；桌面 72px / ≤820px 62px，默认
`ask-peek` 轻微探头呼吸动画（打开时停止，`prefers-reduced-motion` 下关闭）。

本轮新增（2026-09-15，ADR-020）：手工录单沿用商号唯一键与覆盖逻辑；品种只允许单个 A-Z、
本期预置 A-F，市场由 `fruit_admin` 配置；销售数量为录入数字，金额 = 销售数量 × 单价；
固定费用六项 + 动态其他费用；售后填正数并按减项处理；导出只写值不保留公式。

当前进度：
- **顺仔悬浮入口默认收起（2026-09-16，未提交）**：默认缩成小图标贴角待命，鼠标悬停 / 键盘聚焦 /
  打开对话窗时带弹性弹出名字标签，触屏用点击切换。验证见 Test Status。
- **结算单列表按行导出 + 填满可视区（2026-09-16，未提交）**：每行「导出」用
  `结算单模板样式.xlsx` 出单张结算单（手工单与导入件同一入口），列表页去掉分页条下方留白、
  行高放宽、操作列不折行。验证见 Test Status。
- **结算单列表分类明细导出 + 分页与边框（2026-09-15，未提交）**：导出 xlsx 扩为
  「汇总 + 销售明细 / 售后明细 / 支出费用明细 + 说明」5 张 sheet；列表页增加后端分页
  （每页 10 / 20 / 50）与表格单元格边框（`DataTable` 新增 `bordered`），并修掉桌面端
  「顺仔」悬浮按钮遮挡分页按钮的问题。验证见 Test Status。
- **手工录单业务端（2026-09-15）**：`backend/app/api/entry.py`、`services/entry_service.py`、
  `services/entry_export.py`、`frontend/src/views/EntryView.vue`、`utils/entryForm.ts`；
  新增 `source_type/market/arrival_date/arrival_quantity` 与 `piece_count/spec_kg`，
  以及售后 / 费用 / 字段字典三张表；迁移脚本 `backend/scripts/add_entry_schema.py` 幂等。
- **录单字段配置管理端（2026-09-15）**：`fruits_ana_admin` 新增
  `api/entry_field_options.py`、`EntryFieldConfigView.vue`，仅 `fruit_admin` 可见；
  种子写入 `entry:*` 权限、菜单与品种 A-F，市场不预置。
- **登录权限即时返回（2026-09-15）**：`/api/auth/me` 与登录/注册响应均返回 `permissions`，
  避免登录后需刷新才显示手工录单入口。
- **导出行定位修正（2026-09-15）**：动态销售 / 售后 / 自定义费用行会插入行并重建合并单元格，
  导出结果只写值、不含公式。
- **测试（2026-09-15）**：新增后端 `test_entry_service.py` / `test_entry_api.py` 与权限用例，
  前端新增 `entry-form.test.ts`；全量验证见 Test Status。
- **导入记录分页（2026-09-15，未提交）**：数据导入页「导入记录和问题」改为每页 5 批翻页展示；
  `ImportView.vue` 新增 `batchPage` / `batchPageSize` / `totalBatchPages` / `pagedBatches`
  与 `goBatchPage`，批次增删后 `watch` 自动回到第 1 页，页码越界会被钳制；
  分页栏仅在 `totalBatchPages > 1` 时出现，文案「共 N 批 · 第 x / y 页」+ 上一页 / 下一页。
- **品牌与日期筛选（2026-09-14）**：新增 `DateRangeFilter.vue`，五个业务页统一从一个
   面板选择起止日期；结算单详情页新增品牌筛选，商号候选与价格基线随品牌收窄；
   前端用户可见文案的「系列」统一为「品牌」，后端 `UNKNOWN_SERIES` 显示值改为「未识别品牌」；
   AI 数据包字段由「系列」改为「品牌」，`PROMPT_VERSION` `v5 → v6`。
   验证：前端 123 项测试 / `typecheck` / `build` 通过，后端 236 项 pytest 通过。
- **品牌对比同品牌约束与分页选择（2026-09-14，ADR-019）**：选择器改为两步；
   品牌内搜索商号 / 单号 / 柜号并每页 6 张分页；历史 `selected=` 跨品牌链接收敛；
   后端系列对比与两处 AI 分析接口增加同品牌校验，跨品牌返回 422。
   验证：前端 126 项测试 / `typecheck` / `build` 通过；后端 241 项 pytest 通过。
- **AI 分析默认展示与缓存自动复用（2026-09-14）**：`AiAnalysisCard.vue` 默认自动读取缓存，
   只有同条件没有缓存时才请求生成；命中缓存直接展示上次 `generated_at` 与模型信息并标记
   `cached=true`；筛选条件变化用请求版本号丢弃过期响应，避免旧结果覆盖新条件。
   验证：前端 126 项测试 / `typecheck` / `build` 通过；后端 241 项 pytest 通过。
- **结算单详情等级图表（2026-09-14）**：新增 `SettlementGradeBreakdown.vue`，在等级表现
   板块展示 A/B 件数占比环形图、A/B 均价柱状图、A-B 价差与 B 比 A 折价比，以及 A/B/C
   各等级各规格件数横向柱状图；`GradePieChart.vue` 增加可选 `gradeOrder` 以支持按 A/B 展示。
   验证：前端 123 项测试 / `typecheck` / `build` 通过，后端 236 项 pytest 通过。
- **等级文案去枚举化（2026-09-14）**：系统可见描述中的「A/B/C 独立对比」等枚举式文案
   统一改为「等级独立对比 / 各等级」，覆盖品牌对比页、预览页、图表说明、README 与后端
   docstring / AI 提示词；实际等级列、图例与演示数据中的 A/B/C 数值文案保持不变。
   验证：前端 123 项测试 / `typecheck` / `build` 通过，后端 236 项 pytest 通过。
1. 上一批「商号维度重构」已由本会话复核并拆分为 7 个提交（`0160fdf`..`2160b38`），工作区已收口。
2. 系列识别口径落定为「单号中文前缀」，写入 ADR-009；平均每千克售价口径为元/千克（用户确认）。
3. 后端新增 `series_analytics_service` 与 `/api/analytics/series-comparison`，
   `GET /api/settlements` 追加 `series` 字段，新增 13 项后端用例。
4. 前端新增「系列对比」页（勾选业务单 + 总览表 + A/B/C 独立表 + 价差表 + 两张图表），
   新增 8 项前端用例并同步响应式与菜单守卫测试。
5. 真实数据核对：线上 4 张结算单结果与设计稿基线完全一致；其中宝贝01/02/003 三张的
   A/B/C 件数、金额、平均每千克售价、价差与用户手算结果**逐项一致**。
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
13. **认证门户与外壳控制（18:06 交付，未提交）**：登录页删除三组能力说明与演示入口；
    新增默认不勾选的「30 天内免登录」，不勾选保持 7 天、勾选后 Cookie 与服务端会话均为 30 天；
    header 品牌图标跳 `/overview`、增加桌面侧栏收起/展开按钮与本地日期/星期/时分，
    收起为 72px 图标栏并用 `localStorage` 记忆；移动端保留底部导航、只显示时分。
    已完成真实浏览器验收（桌面 1440px / 移动 390px）。
14. **交互与移动端优化（21:59 交付，未提交）**：数据导入增加等待遮罩与 `aria-busy`；
    业务页右下角增加一键回顶悬浮按钮，移动端抬到底部导航上方；header 时间改为时分秒，
    刷新频率改为 1 秒；移动端继续强化 header 窄屏布局、底部导航字号与安全区适配。
15. **无痕首屏资源优化（22:12）**：排查「无痕浏览器打不开/首屏过慢」，根因是
    `main.ts` 静态加载全部业务路由，且 `@lucide/vue` 整包预构建约 1.24 MB；
    改为路由懒加载 + 图标深导入后，登录首屏从 75 个请求 / 3.3 MB 降到
    54 个请求 / 1.28 MB；前端 120 项测试、`typecheck`、`vite build` 均通过。
16. **桌面端自适应缩放（22:35）**：移除固定 `zoom: .9`，改为 `clamp()` 根字号
    随视口平滑缩放，并将主要控件/外壳/表单/卡片尺寸改为 `rem`；移动端保持原布局。
    验证：1366px 笔记本根字号约 15.6px、header 约 58px，1440px 约 16.2px，
    1280/1024px 仍无横向溢出；前端 120 项测试与 `vite build` 通过。
17. **生产部署切到 Nginx（22:53）**：将对外入口从 Vite preview 切换为 Nginx
    静态托管 `frontend/dist`，`/api` 反代到 `127.0.0.1:8000`；`start.sh` 默认
    `FRONTEND_MODE=nginx`，开发与本地预览分别用 `dev` / `preview`。53000 登录页
    实测无 `@vite/client`、无 WebSocket，`/api/auth/me` 经 Nginx 返回预期 401，
    `/assets/` 返回 `public, immutable` 缓存头；后端 236 项、前端 120 项、
    `typecheck` 与 `build` 均通过。
18. **header 字号偏好（23:05，未提交）**：header 增加「小 / 标准 / 大 / 特大」
    四档滑动条，默认停在「小」；写入 `localStorage` 记住用户最近一次修改；
    根字号保持 `clamp()` 视口自适应的前提下再乘用户缩放系数，移动端 header /
    页签 / 底部导航高度同步缩放。验证：前端 123 项测试、`typecheck`、`vite build` 均通过。
19. **手机端 4 核心页卡片化与收折（23:45，未提交）**：在用户确认 A+B 方向后，
    只改移动端（≤560px），不动桌面端与 API 契约；数据明细 / 明细弹窗 / 系列总览 /
    结算单详情销售明细 / 导入问题表均改为纵向卡片，系列对比详细分析默认收起，
    结算单选择器主操作在移动端固定到底部导航上方。前端 123 项测试、`typecheck`、
    `vite build` 均通过；Playwright 实测 5 个关键交互通过。
20. **卖得怎么样「按商号」改倒序（2026-09-13，未提交）**：`SettlementComparison.vue`
    的 `compareMerchant` 改为按适配后商号倒序，仅影响总览页 `mode="identity"` 的
    「结算单销售情况」；默认仍按销售日期排序，品牌 / 销售日期排序规则不变。
    同步更新两份 Word 文档至 V1.3。验证：前端 123 项测试、`typecheck`、`vite build` 均通过。
21. **结算单销售情况等级明细改版（2026-09-13，未提交）**：`SettlementComparison.vue`
    的 A/B/C 等级块由「等级 + 占比」改为「等级 / 等级均价 / 占比」，保留销售额 / 销量 /
    平均每千克售价列，数据沿用 `grades[].weightedAvgPrice` 与 `quantityShare`。
    同步更新两份 Word 文档至 V1.4。验证：前端 123 项测试、`typecheck`、`vite build` 均通过。
22. **售价描述统一为「平均每千克售价」（2026-09-13，未提交）**：前端页面、图表、
    表格、AI 提示词与异常文案中的「平均每件售价 / 平均售价 / 元每件」统一调整为
    「平均每千克售价 / 元每千克」，不改变 `weightedAvgPrice` 字段与计算口径。
    两份 Word 文档同步至 V1.5，并在 ADR-009 追加修订说明。
    验证：后端 pytest、前端 123 项测试、`typecheck`、`vite build` 均通过。

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

header 字号偏好与本地记忆（2026-09-11，代码与自动化验证完成，**未提交**）：

- `AppShell.vue`：header 增加 `app-header-font-size` 原生 `input[type="range"]`
  滑动条，提供「小 / 标准 / 大 / 特大」四档，默认停在「小」，`v-model` 绑定
  `fontSizeIndex` 并映射回 `fontSize`。
- `utils/shellHeader.ts`：新增 `FONT_SIZE_STORAGE_KEY`、`FONT_SIZE_OPTIONS`、
  `restoreFontSize`、`fontScaleFor`；字号状态写入 `localStorage`。
- `styles.css`：根字号保留桌面 `clamp()` 视口自适应，再乘 `--font-scale`；
  移动端与窄屏 header / 页签 / 底部导航高度同步按字号缩放。
- 测试：`shell-header.test.ts` 新增字号偏好与 header 滑动条断言；前端 123 项、
  `typecheck`、`vite build` 均通过。

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

认证门户与外壳控制（2026-09-11，代码与自动化验证完成，**未提交**）：

- 后端：`LoginRequest` 增加 `remember_me: bool = False`；`create_session` / `set_session_cookie`
  接收同一 `session_days`，登录按勾选切 7/30 天，注册保持 7 天；新增默认与记住登录常量。
- 前端：`LoginPayload` 增加 `rememberMe?: boolean`，`client.ts` 映射为 `remember_me`；
  登录页新增默认未勾选的原生复选框；`AuthPortal.vue` 删除三组能力说明和「先看演示效果」入口。
- 外壳：新增 `frontend/src/utils/shellHeader.ts`（`restoreSidebarCollapsed` / `formatHeaderClock`）；
  `AppShell.vue` 品牌图标用 `RouterLink` 指向 `/overview`，增加桌面侧栏收起按钮和本地时钟，
  侧栏状态存 `localStorage`；`styles-shell.css` 增加 72px 收起样式与 ≤820px 隐藏收起按钮/日期。
- 测试：前端新增 `shell-header.test.ts` 4 项，调整 `farmer-ui-copy.test.mjs` 旧入口守卫；
  前端 `npm test` 通过、`typecheck` 通过、`vite build` 成功；后端 236 项 pytest 通过。
- 浏览器验收：登录页复选框默认未勾选、旧能力文案与演示入口已移除；登录后品牌图标跳
  `/overview`、桌面侧栏收起为 72px 且刷新后保持、移动端隐藏侧栏按钮与日期只显示时分，
  均符合预期（临时账号已清理）。

导入等待与移动端交互优化（2026-09-11，代码与自动化验证完成，**未提交**）：

- `ImportView.vue`：上传期间在导入工作区显示等待遮罩、转圈动画和「正在导入，请稍候」，
  同时设置 `aria-busy` / `aria-live`，防止重复提交和误操作。
- `AppShell.vue`：新增右下角「回顶部」悬浮按钮，滚动超过约 320px 后出现；
  `styles-shell.css` 在移动端把按钮抬高到底部导航上方，并补充 header 安全区与窄屏时间字号。
- `shellHeader.ts`：header 时间从「时分」升级为「时分秒」，刷新频率从 30 秒改为 1 秒。
- 测试：`shell-header.test.ts` 更新秒级时间与回顶断言；`import-view-binding.test.mjs`
  新增导入等待遮罩断言；前端 120 项测试、`typecheck`、`vite build` 均通过。

单号命名适配（2026-09-11，代码 + 迁移 + 浏览器验收完成，**已提交 `4823631` / `03dbb6d`**，ADR-015）：

- 统一规则集中在 `backend/app/services/order_no_naming.py`：NFKC 归一 → 取开头连续中文为系列 →
  去分隔符 / 字母大写 → 序号数字左补零 3 位 → `系列-序号`
  （`宝贝003 → 宝贝-003`、`宝贝01 → 宝贝-001`、`宝贝L004 → 宝贝-004`）；识别不出中文系列时原样返回。
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
  导入记录副标题、总览经营异常、结算单详情、系列对比总览与平均每千克售价图统一展示适配后商号，
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
已于 2026-09-11 完成真实浏览器验收（见 Test Status）。

### 品牌化收口与真实浏览器验收（2026-09-11，未提交）

- 登录/注册 Portal 统一为「SLD-水果市场销售分析」，复用一个 `BrandMark`，favicon 与
  apple-touch-icon 已本地化；主图替换为国内 CC零素材网可商用榴莲图，
  来源与许可记录在 `docs/IMAGE_CREDITS.md`。
- 回归测试新增 `frontend/tests/branding.test.mjs`，覆盖品牌名、本地资产、无外链主图与授权记录。
- 真实浏览器 E2E（53000 正式前端 / 8000 后端，临时账号已清理）：桌面 1440px 与移动 390px
  覆盖登录/注册/刷新恢复、总览、数据明细与明细弹窗、结算单对比、结算单详情、系列对比、
  系列 AI 与号别 AI、临时 CSV 上传命名回填；均无横向溢出，仅登录前恢复会话产生预期 401 控制台记录。

新增（2026-09-11，只读分析，无代码改动）：完成全系统走查（前端体验 / 后端数据链路 /
线上库只读盘点），产出优化方案、数据挖掘地图与评审会议方案，见
`docs/superpowers/plans/2026-09-11-system-review-and-meeting.md`。
已确认（2026-09-11）：① 清关费以清关单为准，没有即为没有，单 640 应付 384,740 元为真实值
（ADR-012）；② 下一阶段主线为「等级细分」（ADR-013），实施计划见
`docs/superpowers/plans/2026-09-11-grade-detail-analysis.md`。
仍待确认：细分号别区间（如 `B6/7`）的归属规则。（商号规范化已于 2026-09-11 交付，见 ADR-016。）

## Incidents（已解决）

### 真实库被 `drop_all` 误删 12 张表（2026-09-15，已恢复）

- 现象：远程真实库 `fruits_ana` 的 12 张表整体消失，业务数据（结算单 / 销售明细 / 导入批次）
  全部不可读。
- 根因：临时调试脚本直接 `import app.db`，`backend/.env` 让 `app.db` 指向真实 MySQL，
  随后执行 `Base.metadata.drop_all(bind=engine)`；`tests/conftest.py` 的
  `FRUIT_ANALYSIS_DATABASE_URL` 隔离只覆盖 pytest，不覆盖临时脚本。
  binlog `binlog.000004` 末尾 12 条 `DROP TABLE` 为直接证据，最后一条执行后因
  `admin_role` 被 `admin_role_menu` 外键引用而报错中断，损坏范围因此止于 12 张表。
- 排查手段：`SHOW TABLES` 与模型表清单比对；`SHOW BINLOG EVENTS` 定位删表位点与事件类型；
  `SHOW MASTER STATUS` / `SHOW BINARY LOGS` / `secure_file_priv` 评估 binlog 回放可行性
  （结论：ROW 事件无法通过 SQL 解码，且本机无 `mysqlbinlog`、无 DB 主机 SSH，回放不可行）。
- 处理：见 ADR-021 —— 先导出存活 8 表为回滚点，`init_db()` 重建表结构，用留存上传原件重放导入，
  管理端 seed 重建 RBAC，最后与 09-11 快照逐字段比对确认。
- 遗留：需要补一条「非测试库禁止 destructive metadata 操作」的硬保护，避免同类事件复发。


### 「A/B/C 平均每千克售价对比」柱状图不显示（2026-09-10）

- 现象：系列对比页该图只剩等级标题、金额文字和单据名，柱子看不见（疑似没渲染）。
- 排查：接口侧正常——直接调用 `get_series_comparison` 拿到真实数据，
  `spread.grade_prices` 有 A/B/C 三个平均每千克售价，前端 `gradePrice()` 取值不为空。
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

手机端 4 核心页卡片化与收折（2026-09-11，代码与自动化验证完成，**未提交**）：

- 目标：修复手机端按钮被横向表格甩出屏幕 / 被底部导航遮挡，并减少长页滚动；
  只改移动端（≤560px），不改变桌面端布局、接口字段与数据口径。
- `SettlementListView.vue`：移动端用紧凑结算单卡片替代 900px 宽表，「查看明细」放在卡片头部。
- `SettlementRecordsDialog.vue`：明细弹窗移动端改为底部抽屉式卡片列表，消除 620px 宽表。
- `SeriesOverviewTable.vue`：移动端用单张对比卡片替代 900px 宽总览表。
- `SeriesComparisonView.vue`：移动端默认收起详细分析，点击「展开详细对比」后再显示
  A/B/C 独立表、图表、AI 分析；桌面端仍默认全部展示。
- `SettlementView.vue`：结算单详情的销售明细移动端改为卡片，避免内部 520px 表格横向滚动。
- `ImportView.vue`：导入问题明细移动端改为卡片；历史区标题在手机端吸顶，保证「重新加载」始终可用。
- `SettlementPicker.vue`：移动端新增独立主操作条，固定在底部导航上方，避免「选择结算单 / 清空」被遮挡。
- 验证：前端 `npm test` 123 项、`typecheck`、`vite build` 全部通过；Playwright 390×844
  实测系列选择抽屉、系列详细展开、数据明细弹窗、结算单销售明细卡片、导入重新加载均通过；
  临时验收账号已清理。

手机端第二轮紧凑化（2026-09-12，代码与自动化验证完成，**未提交**）：

- 修复 `styles-responsive.css` 被 `styles.css` 基础规则覆盖的问题：从 `styles.css` 移除
  `@import './styles-responsive.css'`，改在 `AppShell.vue` 的基础样式之后加载，确保移动端
  「隐藏说明 / 两列筛选 / 紧凑卡片」等规则真正生效。
- 手机端隐藏 `how-to` 说明与页面副标题，筛选器统一改为两列紧凑排布，缩小输入控件、
  页面标题与卡片间距；总览 / 结算单详情 / 导入 / 系列对比继续使用「展开更多」收纳次要内容。
- `SettlementComparisonView` / `SeriesComparisonView` 窄屏筛选器改为两列；
  `SettlementComparison.vue`、`SeriesOverviewTable.vue`、`SettlementListView.vue`、
  `SettlementView.vue` 的移动端卡片与 KPI 进一步压缩字号、内边距与行列间距。
- 验证：前端 123 项测试、`typecheck`、`vite build` 均通过；Playwright 390×844 下
  展开 / 收起 / 数据明细弹窗等关键交互通过，横向溢出为 0。页面高度从约 1.8~2.3 屏
  压缩到 1.0~1.7 屏（数据导入约 1.0 屏）。

## Next Steps

下一模型应该按以下顺序继续（不要跳步）：

1. 只读复述当前状态并与用户确认，再决定做哪一项。
2. 候选任务（优先级从高到低）：
   a. **上线前复核 `tickets/` 已忽略**：客户源文件只用于本地导入/回归，不随代码提交。
   b. 多文件导入收尾：确认 `backend/scripts/add_import_draft_schema.py` 与
      `backend/scripts/expand_grades.py` 的 `--apply` 执行窗口；在 `fruits_ana_admin`
      配置 `grade:BC→C` 默认规则并检查 `AB` 是否保持独立；真实浏览器验收
      `/imports` → `/import-review` → 确认带错提交。
   c. 待用户执行清库重建后重新导入 `tickets/`，并核对规格 `3/4`、`9/10` 与导出头数上限口径。
   d. 待客户回复异常数据处理确认单 B/C 组；见 `docs/2026-09-16-导入异常数据处理确认单.md`。
   e. 顺仔生产化收口：频控、问题/工具/耗时审计、结果留档决策（`docs/TODO.md` P0）。
   f. 确认 4 项产品口径：入口页落点、市场字典命名、品牌对比 AI 小标题、`lhp` 角色恢复。
   g. 系列对比后续能力：到港日期字段与一次库迁移、元/KG 口径、Excel 导出、系列别名字典。
   h. 真实业绩数据到位后的整体回归验收（目前线上只有 4 张示例结算单）。
   i. **文档同步（长期约定）**：界面功能、操作流程或指标口径新增/调整时，必须同步更新
      `docs/SLD-水果市场销售分析-功能说明书.docx` 与 `docs/SLD-水果市场销售分析-用户操作手册.docx`。
3. 改完后端记得重启 `./start.sh`（Known Issues 4）；每次改动后运行基线验证，再按功能提交。

## Known Issues

### Issue 1 — 根目录 `.env` 的 AI 配置已确认由后端读取

- 问题：仓库根 `.env` 存在 `FRUIT_ANALYSIS_AI_BASE_URL` / `FRUIT_ANALYSIS_AI_API_KEY` /
  `FRUIT_ANALYSIS_AI_MODEL`，此前文档误写为“无任何引用”。
- 当前判断：`backend/app/ai_settings.py` 会读取这三个配置并注入系列 AI / 号别 AI 调用，
  属于项目运行时配置；`.env` 已被 `.gitignore` 忽略，**严禁提交**。

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
- `frontend/dev-preview/` 预览代码可入库，其中 `fixture.json` / `grade-detail-data.js` /
  `review-data.ts` 已加入 `.gitignore`；提交时仍建议用显式路径、不要 `git add -A`。
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
  平均每千克售价 = 销售金额 ÷ 销量（千克）（元/千克）；一次最多勾选 6 张结算单；不传 `merchant_no` 时返回范围内全部结算单。
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
- 等级映射由 `fruits_ana_admin` 字段转换规则生成，明细保留原文；规则或指标口径变更必须先新增 ADR。
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
backend/app/parser/settlement_template.py      # 新模板解析器（多文件预览）
backend/app/services/import_draft_service.py   # 预览草稿 / 二次确认 / 确认入库 / 留痕
backend/app/services/field_conversion.py       # 管理端字段转换规则读取与等级映射
backend/app/api/entry.py                        # 手工录单；覆盖修改写 settlement_revision
frontend/src/views/ImportReviewView.vue        # 多文件二次确认页
frontend/src/views/EntryView.vue               # 手工录单；默认支持 AB/BC 原文
frontend/src/main.ts                     # 路由与守卫（默认入口 /login）
frontend/src/auth.ts                     # 前端会话状态与 safeRedirect
frontend/src/components/AuthPortal.vue   # 登录/注册共用骨架
frontend/src/api/types.ts                # API 契约
frontend/src/views/ImportView.vue        # 导入页（本轮修复点）
frontend/src/utils/grades.ts             # 前端 Grade 类型含 AB
frontend/src/components/AskWidget.vue     # 顺仔悬浮入口 + 对话窗（ADR-023）
frontend/src/components/ask-widget.css    # 顺仔样式（全局引入，变量回退 --primary；含移动端可视视口适配）
frontend/src/utils/askWidget.ts           # 顺仔纯逻辑（分段 / 耗时 / 错误文案 / 历史裁剪）
frontend/src/AppShell.vue                # 挂载 AskWidget，askOpen 与回顶按钮 / 通知横幅互斥避让
backend/app/api/ask.py                   # POST /api/ask（require_permission("ask:view")）
fruits_ana_admin/backend/app/seed.py     # 权限点 ask:view（FRUIT_PERMISSIONS，仅授予 fruit_admin）
backend/app/services/ask_service.py      # 问答编排（3 轮工具调用上限）
frontend/src/views/PublicPreviewView.vue # 免登录演示页（/preview）
backend/app/services/series_analytics_service.py  # 品牌识别、A/B/C 指标、价差与品牌汇总
backend/app/services/order_no_naming.py           # 单号统一命名（品牌识别 + 适配后单号，ADR-015）
backend/app/services/merchant_no_naming.py        # 商号统一命名（去「单」前缀，ADR-016）
backend/scripts/column_backfill.py                # 通用「加列 + 回填」迁移工具（幂等 / 演练 / --force）
backend/scripts/add_order_no_normalized.py        # 适配后单号加列与回填（基于 column_backfill）
backend/scripts/add_merchant_no_normalized.py     # 适配后商号加列与回填（基于 column_backfill）
frontend/src/utils/orderNo.ts                     # displayOrderNo / rawOrderNo 展示口径
frontend/src/utils/merchantNo.ts                  # displayMerchantNo / rawMerchantNo 展示口径
frontend/src/views/SeriesComparisonView.vue       # 品牌对比页
frontend/src/views/SettlementView.vue             # 结算单详情页（新增品牌筛选）
frontend/src/components/DateRangeFilter.vue       # 五个业务页的统一起止日期选择组件
frontend/src/components/SettlementGradeBreakdown.vue # 结算单详情等级图表（A/B 占比、均价、价差、规格件数）
frontend/src/components/SeriesGradePriceChart.vue # A/B/C 平均每千克售价对比图
frontend/src/components/SeriesGradeShareChart.vue # 等级件数占比图
docs/ARCHITECTURE.md
docs/DECISIONS.md
docs/TODO.md
docs/SLD-水果市场销售分析-功能说明书.docx
docs/SLD-水果市场销售分析-用户操作手册.docx
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

当前测试：定向 PASS / 全量有 4 个已知环境用例失败（2026-09-17 实测）：
- 前端 `npm --prefix frontend run test` 189 项通过、`typecheck` 通过、`build` 成功。
- 后端新增导入相关 `test_settlement_template.py` / `test_import_draft_service.py` /
  `test_imports_api.py` / `test_field_conversion.py` 均通过。
- 后端全量 `.venv/bin/python -m pytest backend/tests -q --basetemp=backend/.pytest-tmp`：
  除 4 个导出用例因缺少 `attachments/结算单模板样式.xlsx` 失败外，其余通过。

### 新模板多文件导入二次确认（2026-09-17，ADR-030，未提交）

- 后端定向：`.venv/bin/python -m pytest backend/tests/test_settlement_template.py
  backend/tests/test_import_draft_service.py backend/tests/test_imports_api.py
  backend/tests/test_field_conversion.py -q --basetemp=backend/.pytest-tmp`：通过。
- 前端 `npm --prefix frontend run test`：189 项通过；`typecheck` 通过；`build` 成功。
- 已覆盖：三份客户样例解析、多文件 preview、草稿保存与版本递增、无 force 阻断、
  force 带错提交、同任务商号重复冲突、文件金额不一致对账、`BC→C`/`AB` 动态映射。
- 未验证：真实 MySQL 执行 `add_import_draft_schema.py --apply` / `expand_grades.py --apply`；
  `fruits_ana_admin` 配置页手工配置 `BC→C` 后的浏览器端到端；新模板三文件真实浏览器复核。

### 规格/头数文本化 + A1~A11 口径（2026-09-16，ADR-027/028，未提交）

- 后端 `.venv/bin/python -m pytest backend/tests -q --basetemp=backend/.pytest-tmp`：
  **332 项全部通过，退出码 0**（新增 `test_spec_range.py` 46 项；同步更新
  `test_entry_service.py` / `test_entry_api.py` / `test_exports.py` 中头数·规格的文本口径断言）。
- 前端 `npm --prefix frontend run test`：**189 项全部通过**（新增 `tests/spec-range.test.ts`）；
  `npm --prefix frontend run typecheck` 通过；`npm --prefix frontend run build` 成功。
- `cd backend && ../.venv/bin/python scripts/rebuild_dev_schema.py`：演练通过，只打印目标库
  （`mysql://root@120.48.117.234:13306/fruits_ana`）与 17 张待重建表，**未执行任何写操作**；
  正式清库重建按交接说明由用户执行。
- 未验证：清库重建后 `tickets/` 的重新导入与浏览器端到端（待用户重建后再做）。
- 说明：`frontend/dev-preview/entry-design.js` 仍是旧设计稿（数值输入），未同步文本口径，
  不影响正式页面，P2 二次确认页改造时一并收敛。

### 顺仔悬浮入口视觉改版（2026-09-15，未提交）

- 改动：`AskWidget.vue` 去掉「顺仔」文字标签、头像换 `durian-mascot.svg`；
  `ask-widget.css` 删除 `.ask-fab__label`、按钮改 72px（≤820px 62px）+ `ask-peek` 探头动画；
  demo 页 `dev-preview/ask-demo.html` / `ask-demo.js` / `ask-widget.css` 同步。
- 前端 `npm --prefix frontend run test`：175 项全部通过，退出码 0。
- 前端 `npm --prefix frontend run typecheck`：通过，退出码 0；`npm --prefix frontend run build`：成功。
- Playwright（`/dev-preview/ask-demo.html`，53001）：桌面 1440×900 → `.ask-fab__avatar` 与
  `.ask-fab__avatar-img` 均为 72×72 且完全重合（图片零裁切）；移动 390×844 为 62×62；
  按钮旁不再有文字标签；截图 `/tmp/shunzai-shots/new-closed-d.png`、`new-closed-m.png`。
- 已按客户确认删除旧图 `frontend/public/durian-fab.png`（白底 + 第三方水印），`dist` 内的同名副本一并清理。

### 顺仔悬浮入口改为「默认收起 + 悬停弹出」（2026-09-16，未提交）

- `components/AskWidget.vue`：按钮内的名字标签改成 `<span class="ask-fab__label">`（视觉隐藏，
  由 CSS 控制展开），结构为「标签在左、头像在右」，容器 `right` 固定，展开时头像位置不动
- `components/ask-widget.css`：收起态由 `--ask-open: 0` 驱动——`translateX(6px) scale(.86)`、
  `opacity .78`；鼠标移入（`@media (hover: hover)` 限定）、`:focus-visible`、`.is-open`
  三处把 `--ask-open` 置 1，标签宽度 `0 → 3.9rem`、内边距与位移同步插值，
  过渡曲线 `cubic-bezier(.34, 1.42, .64, 1)`（弹性收尾）；`prefers-reduced-motion` 仍关闭全部过渡
- 触屏没有悬停：移动端仍靠点击开关对话窗，点击时按钮同时进入展开态；收起态触摸目标
  桌面 53px / 移动 46px，均不小于 44px
- 副作用：收起后不再遮挡结算单列表最后一行的「查看明细」按钮
- 踩坑记录（2026-09-16）：贴边收起 + 悬停展开时，若展开后元素右边缘比收起态更靠左（例如
  收起 `right: 24px` + 右移出血、展开回落 `right: 24px`），元素会从鼠标下方滑走，`:hover`
  反复丢失、宽度在 105~131px 之间抖动。修法是把按钮 `right` 固定为 `0`，只用 `--ask-tuck`
  控制收起时的出血量，保证「展开后的矩形完全覆盖收起时的可见区」，悬停一次到位。
- 验证：前端 180 项测试通过（`ask-widget.test.ts` 新增 1 项守护收起 / 展开与过渡曲线）；
  53001 实测四态——收起贴边（右间隙 0、桌面出血 18px 可见 35px、移动出血 8px 可见 38px、
  `opacity .68`、labelW 0）、悬停 `137x72 / opacity 1 / labelW 57`、
  移开自动收回、点击打开对话窗（标签变「收起」）；移动端收起 `46x46`、点开 `130x62`；
  `console error 0`

### 结算单列表按行导出（模板版式）+ 列表填满可视区（2026-09-16，未提交）

- `services/entry_export.py` 拆成「数据来源 + 模板渲染」两层：新增
  `render_entry_workbook(entry)`、`read_imported_entry(db, merchant_no)`、
  `build_settlement_template_workbook(db, merchant_no)`；`build_entry_workbook` 保持
  「只导手工单、非手工单 404」的既有契约不变
- 导入件映射口径：商号 / 单号走 `merchant_no_display` / `order_no_display` 兜底归一，
  品种取 `grade.value`、规格原文进「备注」，售后取 `abs(after_sale_amount)` 一行，
  费用用 `parse_fee_detail(fee_detail)` 拆项、`customs_tax` 单列「清关税费」，
  件数与规格（KG）整列留空（`_write` 显式写 None，避免模板第 14 行示例值 4 / 10 残留）
- 接口：`GET /api/exports/settlements/{merchant_no}/template.xlsx`（`require_current_user`，
  与其它 `/api/exports/*` 一致），文件名 `{适配商号}-{适配单号}-结算单.xlsx`
- 前端：`api/client.ts` 新增 `settlementTemplateExportUrl`；列表页每行新增「导出」
  （`a.row-action-button`，`download` 直链）与主操作「查看明细」，两者都带 lucide 图标，
  「查看明细」实心绿；操作列固定 `10.5rem` 且不折行；面板标题不再重复「共 N 张 · 第 x / y 页」
  （该信息只在分页条出现一次）；移动端卡片仍为 `a.text-button.export-row-link` + `primary-button`
- 列表样式：桌面端分页条回到 28px 高并贴住面板底部（不再给底部留整块空白，表格高度
  增加约 76px），表格行高 `.4rem .8rem → .45rem .7rem`（本页 scoped 覆盖；`.5rem` 会让
  1440×900 下第 10 行被压掉 5px，只能内部滚动，故取两者之间的值），
  移动端卡片「导出 / 查看明细」同排不折行
- 验证：后端 286 项 pytest 通过；前端 179 项测试 + `typecheck` 通过；
  53001 实测桌面 1440 / 移动 390 均 10 个可见导出入口，下载 `TEST-test-结算单.xlsx`
  12,343 字节（Sheet：结算单 / Sheet1）、`docH` 不超视口、横向溢出 0px、console error 0；
  curl 复核导入件 `单637` 与手工单 `test` 均 200 且模板坐标正确

### 结算单列表分类明细导出 + 分页与表格边框（2026-09-15，未提交）

- 导出：`services/settlement_list_export.py` 由单表改为 5 张 sheet——
  `结算单列表`（汇总，追加 `售后合计` / `费用合计` / `应付贵方总金额(RMB)`，无值留空而非 0）、
  `销售明细`（商号/单号/柜号/销售日期/品种/等级原文/规格原文/规格（头数）/规格（KG）/销售数量/单价/金额/备注）、
  `售后明细`、`支出费用明细`、`说明`；路由 `/api/exports/settlements.xlsx` 未改，权限沿用 `require_current_user`
- 明细来源：手工单读 `SettlementAfterSaleItem` / `SettlementFeeItem`，导入件售后回填
  `SettlementSummary.after_sale_amount`，费用用新增 `parse_fee_detail()` 拆 `fee_detail`
  文本（`代卖佣金 10000: 10000；车位费 600: 600` → 名称 + 金额）；`来源` 列区分
  「录单录入 / 录单自定义 / 结算摘要 / 费用明细」
- 列表页分页：`SettlementListView.vue` 新增 `page` / `pageSize`（10 / 20 / 50）、
  `totalCount` / `totalPages` / `goPage` / `onPageSizeChange`，请求参数 `page` / `page_size`
  走后端；切商号与点「查看结果」回到第 1 页，翻页不重置；等级列按筛选范围累积（翻页不跳变）
- 表格边框：`components/DataTable.vue` 新增 `bordered` 属性（外框由容器提供，单元格只画右线避免
  相邻边框叠成 2px），结算单列表启用；移动端仍走卡片布局
- 顺带修复：桌面一屏高布局下分页行贴在窗口右下角，会被「顺仔」悬浮按钮盖住导致点不到，
  `.list-pagination` 在 ≥861px 预留 `padding-bottom: 4.75rem`
- 验证：后端 284 项 pytest 通过（退出码 0）；前端 175 项测试 + `typecheck` 通过；
  curl 导出 200 / 33,791 字节，sheet 结构 `['结算单列表','销售明细','售后明细','支出费用明细','说明']`；
  Playwright 53001 桌面 1440 / 移动 390 实测：13 张分页 10 + 3、每页 50 显示 13 行、
  下载 `结算单列表.xlsx` 33,810 字节、`console error 0`、横向溢出 0px

### 导入与手工录单入口整合（2026-09-15，ADR-025，未提交）

- 后端 `pytest`：**280 项通过**，0 失败 / 0 错误 / 0 跳过，退出码 0
  （`--junit-xml` 实测 32.8s；本轮未改后端，用于确认基线未被前端改动破坏）
- 前端 `npm --prefix frontend run test`：**162 项通过**，0 失败，退出码 0
  （新增 `entry-hub.test.ts` 4 项 + `entry-draft.test.ts` 5 项；`farmer-ui-copy.test.mjs`
  导航断言改为 `['卖得怎么样','每一单','录单 / 导入']` + `['ChartColumn','Table2','ClipboardPen']`）
- 前端 `typecheck`：通过，退出码 0；`vite build`：成功，产物含
  `EntryHubView-*.js` 4.27 kB 与 `entryDraft-*.js`（已刷新 53000 nginx 托管的 `frontend/dist`）
- Playwright + Chromium（53000 正式前端 + 8000 后端；桌面 1440 与移动 390 各一轮）：
  - 侧栏不再出现「数据导入」；`/entry-hub`、`/imports`、`/entry` 三个路径都点亮「录单 / 导入」
  - 入口页两张方式卡片；最近导入 3 条（香香-006 成功 48 行 / 宝贝-006 成功 20 行 /
    香香-004 需关注 1 行）；页面 `overflow` 0px；**console error 0**
  - 点「继续录单」跳 `/entry?draft=1` 并成功恢复草稿内容
  - 角色 `__ask_perm_viewer`（无 `entry:view`）：只渲染「文件导入」卡片，无草稿区块
  - SPA 内切页再回 `/entry-hub`：草稿卡片出现（`商号 838 测试-838 · 0 行明细 · 最后编辑 刚刚`），
    页签仍为「录单 / 导入」，`isNavActive` 高亮正常
- 数据残留核对：`import_batch` 共 12 条，`source_type='manual'` 手工单 0 条（验收数据已清理干净）

### 导出模板保真 + 结算单详情 422 收敛（2026-09-15，未提交）

- 导出：`services/entry_export.py` 新增 `_snapshot_row` / `_apply_row` / `_restore_row_heights`，
  修掉 `ws.insert_rows()` 不搬样式与行高、`ws.cell(r, c, value)` 重置样式导致的动态行掉格式
  （字号 14→11、边框/日期格式丢失、行高错乱）
- 导出逐格复核：模板同构场景 29 个合并区域与模板一致，B13–I13 / C16 / H16 / C26 / H26 / C27 /
  C33 / B35 / I35 的样式与数字格式逐格相同；动态行场景新增行样式/行高与模板参考行逐项相同
- 回归测试：`backend/tests/test_entry_service.py` 新增
  `test_export_inserted_rows_inherit_template_style_and_height`（本轮 5 项全通过）
- 详情页 422：根因是 `normalizeSettlementComparison` 丢掉后端 `series`，同品牌判断拿不到品牌值；
  已补 `series` 字段并抽出纯函数 `countSameBrandPeers`（`series` 为空时回退单号中文前缀）
- 详情页实测（390×844 isMobile）：修复前 `POST /api/analytics/settlements/999101/analysis` 返回 422
  且页面报错横幅；修复后**不再发起 analysis 请求**、无 console error、显示
  「该品牌暂无其他结算单」空状态、`errorBanner` 为 null
- 前端用例：`settlement-comparison-selection.test.ts` 6 项通过（含 `series` 缺失回退），
  `farmer-ui-copy.test.mjs` 断言 `countSameBrandPeers` 与 `empty-title`

### schema 漂移收敛（2026-09-15，未提交）

- `fruits_ana_admin` 只读映射 `sale_record.grade`：`String(1)` → `String(5)`，与业务端
  枚举映射（`OTHER` 最长 5 字符）对齐
- 两端 `import_batch.source_type` 增加 `server_default=text("'import'")`，
  `create_all` 现在产出与 `add_entry_schema.py` 相同的
  `source_type VARCHAR(16) NOT NULL DEFAULT 'import'`
- 证据：MySQL 与 SQLite 方言 `CreateTable(...)` 编译逐列核对；后端 278 项 pytest 全通过；
  两端 `compileall` + `import app.main` 通过；两端服务重启后 `/health` 200，
  `GET /api/entry/field-options` 返回 `market` 2 项、`variety` A-F 6 项
- 只改模型映射，未执行任何 DDL、未改动线上数据

### 非测试库硬保护 + 录单移动端实机验收（2026-09-15，未提交）

- 后端 `pytest`：全量 **278 项通过**，退出码 0（新增 `backend/tests/test_db_guard.py` 6 项）
- 前端 `npm --prefix frontend run test`：**149 项全部通过**，退出码 0
- 前端 `npm --prefix frontend run typecheck` / `build`：通过，退出码 0
- 两端 `compileall` 与 `import app.main`：通过；两条服务重启后 `GET /health` 均 200，
  `53000/api/auth/me` 与 `54000/api/admin/auth/me` 未登录返回 401（代理链路正常）
- Playwright + Chromium（390×844 isMobile，真实 MySQL + nginx 构建产物）跑通录单全链路：
  填单（来货 100 / 件数 60 / 规格 12 / 销售数量 720 / 单价 6.5）→ 保存 →
  同商号冲突弹窗两个按钮 `disabled=false`、尺寸 68×42 与 145×42 → 确认覆盖 →
  跳转 `/settlement-detail?merchant_no=999001` → `GET /api/entry/999001/export.xlsx`
  返回 200 / `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` / 12,376 字节
- 汇总口径实测：`销售金额 4680.00`（60×12×6.5）、`售后合计 30.00`、`货款合计 4650.00`、
  `费用合计 115.00`、`应付贵方总金额(RMB) 4535.00`，`总件数 60 差异 +40 件` 红字提醒正常，
  页面 `scrollWidth == clientWidth == 390`（无横向溢出）
- 控制台仅 1 条 `409 Conflict`（冲突探测的预期响应，非缺陷）
- 验收产生的 `999001` 手工单已清理：残留 0 / 批次总数 12 / 手工单 0
- 收尾重启后复测（390×844）：`/entry` 加载正常，品种下拉 6 项、市场下拉 3 项（含占位）、
  4 张表单卡片，console 无 error
- 未验证：管理端「录单字段配置」页的浏览器复测本轮未重跑（上一轮已通过）

### 生产库恢复与同品牌分析小标题（2026-09-15，未提交）

- 恢复结果核对：`SHOW TABLES` 23 张；`import_batch` 12 / `source_file` 12 / `sale_record` 364 /
  `settlement_summary` 12 / `data_issue` 1；管理端 `admin_permission` 15 /
  `admin_role_permission` 43 / `admin_menu` 10 / `admin_role_menu` 31 / `entry_field_option` 6
- 快照比对：与 `snapshot-order-no-20260911-082044.sql` 比对 1244 个字段，13 处差异全部为预期
  （重放时间戳、快照更早的 `user` / `user_session` 状态、`宝贝L004 → 宝贝-004` 为 09-11 后的有意修复）
- 服务层读取：`list_settlements` 返回 12 张结算单，`get_settlement_detail('单638')`、
  `get_series_comparison(['单638','单643'])` 均正常返回
- 后端 `pytest`：251 项全部通过（新增 `test_settlement_ai_analysis.py` 小标题用例 1 项）
- 前端 `npm --prefix frontend run test`：133 项全部通过（新增占位行解析用例 1 项）
- **未验证**：管理端浏览器端到端验收、移动端录单 / 导出 / 冲突覆盖实机验收、
  品牌对比页 AI 是否同步「只列实际等级」（待业务确认）

### 导入记录分页（2026-09-15，未提交）

- 前端 `npm --prefix frontend run test`：133 项全部通过，退出码 0
  （`import-view-binding.test.mjs` 新增「导入记录按页展示，批次列表只渲染当前页」1 项）
- 前端 `npm --prefix frontend run typecheck`：通过，退出码 0
- 前端 `npm --prefix frontend run build`：成功，退出码 0
- Playwright 实测（vite dev `53001` + 打桩 12 条批次）：第 1 / 2 / 3 页行数 5 / 5 / 2，
  文案「共 12 批 · 第 x / 3 页」；第 1 页「上一页」与第 3 页「下一页」为禁用态，
  回退上一页正常；展开「查看问题」渲染 6 行明细；移动端 390px 横向溢出 0px、无 console error
- 仅改动 `frontend/src/views/ImportView.vue` 与 `frontend/tests/import-view-binding.test.mjs`，
  未触碰 API 契约与数据口径

### 手工录单与字段配置（2026-09-15，未提交）

- 后端 `pytest`：全量通过，退出码 0；新增 `test_entry_service.py` 4 项、
  `test_entry_api.py` 3 项、`test_auth_api.py` 登录权限 1 项
- 前端 `npm --prefix frontend run test`：131 项全部通过，退出码 0（新增 `entry-form.test.ts` 5 项）
- 前端 `npm --prefix frontend run typecheck`：通过，退出码 0
- 前端 `npm --prefix frontend run build`：成功
- 管理端 `npm --prefix /home/python/workspace/fruits_ana_admin/frontend run typecheck`：通过，退出码 0
- 管理端 `npm --prefix /home/python/workspace/fruits_ana_admin/frontend run build`：成功
- 两端 Python `compileall`：通过
- **未验证**：真实 MySQL 执行 `backend/scripts/add_entry_schema.py --apply`、管理端种子真实入库、
  移动端真机录单 / 导出 / 冲突覆盖的浏览器端到端验收

### 数据问答「顺仔」整合进正式外壳（2026-09-15，未提交）

- 后端 `pytest`：280 项全部通过（退出码 0）；其中新增
  `backend/tests/test_ask_service.py` 12 项 + `backend/tests/test_ask_api.py` 10 项
  （含未登录 401、无 `ask:view` 403）。
- 前端 `npm --prefix frontend run test`：150 项全部通过，退出码 0（整合当时基线；
  移动端遮挡修复后为 162 项，见下节「顺仔移动端遮挡修复」）
  （新增 `frontend/tests/ask-widget.test.ts` 14 项，覆盖 `parseAnswerBlocks` 等纯逻辑、
  `AskWidget.vue` 源码契约与「只对 `ask:view` 显示」断言；
  `frontend/tests/sfc-build-entry.ts` 已加入该 SFC 编译入口）。
- 前端 `npm --prefix frontend run typecheck`：通过，退出码 0。
- 前端 `npm --prefix frontend run build`：成功，退出码 0。
- Playwright + Chromium（53001 demo + 8010 后端，整合前）：真实登录 → 多轮提问 → 答案正常；
  品牌整体表现、结算单排名、单张明细、系统外字段拒答均符合预期，移动端 390px 横向溢出 0px。
- Playwright + Chromium（53000 正式前端 + 8000 后端，整合后）：登录 → 滚动后回顶按钮出现且
  与悬浮机器人按钮不重叠 → 点按钮开窗 → 回顶按钮隐藏 → 欢迎语「你好，我是顺仔」→ 连问两题
  拿到真实数据答案 → 无溯源块 → 输入框 173px 高无滚动条 → 微信式左右气泡 → Esc 收起 →
  桌面 0 横向溢出 → 手机端 390×844 全屏无溢出 → 零 JS 错误。
- Demo 地址（历史预览，仍可用）：`http://127.0.0.1:53001/dev-preview/ask-demo.html`；
  临时账号 `__ask_demo_probe` 已清理（`user_session` / 角色 / 通知均无残留）。
- 权限收口（2026-09-15）：管理端种子 `fruits_ana_admin/backend/app/seed.py` 的 `FRUIT_PERMISSIONS`
  新增 `ask:view`（module=ask，type=action），`fruit_admin` 的权限列表由该常量整表派生，因此自动持有；
  `operator` / `viewer` / `data_entry` 未授予，即当前只有 `fruit_admin` 能看到顺仔。
  权限数据已落真实库：`admin_permission` id=16 `ask:view`，`admin_role_permission` 已授予
  `fruit_admin`(role_id=4)，持有者仅 `test / fruit_admin`。
- Playwright + Chromium（53000 正式前端 + 8000 后端，权限 E2E）：`viewer`（7 项权限、无 `ask:view`）
  → `.ask-fab` 与 `#ask-panel` 均不渲染；`fruit_admin`（16 项权限、含 `ask:view`）→ 悬浮按钮可见、
  对话窗可展开，零 JS 错误。截图 `/tmp/xs-perm-viewer.png`、`/tmp/xs-perm-fruit_admin.png`；
  临时验收账号 `__ask_perm_viewer` / `__ask_perm_admin` 均已清理，无残留。

### 顺仔移动端遮挡修复（2026-09-15，未提交）

- 复现与定位（Playwright + Chromium，53000 正式前端 + 8000 后端）：桌面 1440×900 无遮挡，
  真实缺陷集中在移动端——① 横屏 844×390 时面板底 302px、页脚底 314px，发送按钮被
  `overflow: hidden` 裁掉（`clippedChildren=1`）；② 软键盘弹出只缩小可视视口，`inset: 0` 的固定
  窗口不收缩，输入框被键盘盖住；③ 刘海 / 底部横条贴边；④ 站内通知横幅（z-index 55）压住
  对话窗（z-index 45）。
- 修复：`ask-widget.css` 把 `.ask-panel__scroll` 由 `min-height: 140px` 改为
  `flex: 1 1 auto; min-height: 0`；≤820px 媒体查询改为 `top: var(--ask-vv-top, 0px)` +
  `height: var(--ask-vv-height, 100dvh)`；头部 / 底部补 `env(safe-area-inset-top/bottom)`。
  `AskWidget.vue` 新增 `syncVisualViewport()` 并监听 `visualViewport` 的 `resize` / `scroll`
  （卸载时移除），可视视口不可用或高度非法时清变量回落整屏；`AppShell.vue` 的通知横幅条件
  加 `!askOpen`。
- 前端 `npm --prefix frontend run test`：162 项全部通过，退出码 0（`ask-widget.test.ts`
  由 14 项增至 17 项：视口跟随与监听器、安全区避让 + `min-height: 0`、通知横幅避让；
  其余增量来自并行会话新增的 `entry-*.test.ts`，与本次改动无关）。
- 前端 `npm --prefix frontend run typecheck`：通过，退出码 0；`npm --prefix frontend run build`：成功。
- Playwright 终验：桌面 1440×900 → 面板 720px、零裁切；横屏 844×390 → 面板 250px，
  页脚底 301 ≤ 面板底 302、输入框可点（修复前此项失败）；短视口 360×480 零裁切；
  软键盘桩（`visualViewport` 收缩到 430）→ 面板随之为 430、输入框底 418 可点，收起后恢复 844；
  可视视口异常防护：无 `visualViewport` / 高度为 0 时回落 844px（修复前会塌成 2121px）；
  提问走真实 `/api/ask` 后仍零裁切、零 JS 错误。截图 `/tmp/ask-fix-landscape-844x390.png`、
  `/tmp/ask-fix-short-360x480.png`、`/tmp/ask-fix-keyboard.png`、`/tmp/ask-fix-mobile-chat.png`。
- 边界：`320×568` 极窄屏登录后有 39px 横向溢出，来源不在顺仔组件（疑似
  `frontend/src/styles-responsive.css` 的移动端守卫），本次未处理；真实 iOS Safari 的软键盘
  行为无法在本机复现，本次以 `visualViewport` 桩验证，建议客户真机确认一次。
- 临时验收账号 `__ask_perm_viewer` / `__ask_perm_admin` 已清理（`/tmp/ask_perm_seed.py drop`
  输出残留 0）。

### 品牌口径与统一日期范围（2026-09-14，未提交）

- 后端 `pytest`：236 项全部通过，退出码 0
- 前端 `npm --prefix frontend run test`：123 项全部通过，退出码 0
- 前端 `npm --prefix frontend run typecheck`：通过，退出码 0
- 前端 `npm --prefix frontend run build`：成功
- 运行服务：已重启 `fruits_ana` 后端，`GET /health` 返回 200；Nginx 继续托管最新 `dist`

### 品牌对比同品牌约束与分页选择（2026-09-14，未提交）

- 后端 `pytest`：241 项全部通过，退出码 0
- 前端 `npm --prefix frontend run typecheck`：通过，退出码 0
- 前端 `npm --prefix frontend run build`：成功
- 前端 `npm --prefix frontend run test`：126 项全部通过，退出码 0

### AI 分析默认展示与缓存自动复用（2026-09-14，未提交）

- 前端 `npm --prefix frontend run typecheck`：通过，退出码 0
- 前端 `npm --prefix frontend run build`：成功
- 前端 `npm --prefix frontend run test`：126 项全部通过，退出码 0
- 后端 `pytest`：241 项全部通过，退出码 0

### 导入等待、回顶与移动端优化（2026-09-11，未提交）

- 前端 `npm --prefix frontend run test`：120 项全部通过，退出码 0
  （新增/更新 `shell-header.test.ts` 秒级时间与回顶断言、`import-view-binding.test.mjs` 导入遮罩断言）
- 前端 `npm --prefix frontend run typecheck`：通过，退出码 0
- 前端 `npm --prefix frontend run build`：成功（vite 6.4.3，1943 modules）
- Playwright + Chromium（53000 正式前端 / 8000 后端，临时账号已清理）：
  header 显示 `HH:mm:ss`；桌面与移动端滚动后出现回顶按钮，点击回到顶部；移动端底部导航可见；
  拦截导入请求延迟 3 秒后，`上传中遮罩` 可见且包含「正在导入，请稍候」，请求结束后自动隐藏

### 认证门户与外壳控制（2026-09-11，未提交）

- 前端 `npm --prefix frontend run test`：21 个测试文件全部通过，退出码 0
  （含新增 `shell-header.test.ts` 4 项；`farmer-ui-copy.test.mjs` 的「销售总览」断言已收窄到导航菜单）
- 前端 `npm --prefix frontend run typecheck`：通过，退出码 0
- 前端 `npm --prefix frontend run build`：成功（vite 6.4.3，1943 modules）
- 后端 `pytest`：236 项全部通过，退出码 0
- 后端 7/30 天会话：用 SQLite 测试库直接验证 `create_session` + `set_session_cookie`，
  `remember_me=False` 为 `max-age=604800` / 约 7 天，`remember_me=True` 为
  `max-age=2592000` / 约 30 天，Cookie 与 `expires_at - created_at` 一致
- Playwright + Chromium（53000 正式前端 / 8000 后端，临时账号已清理）：
  登录页无旧能力文案与「先看演示效果」、复选框默认未勾选；登录后品牌图标跳 `/overview`、
  桌面侧栏收起为 72px 且刷新后保持；移动端 390px 隐藏侧栏按钮与日期、保留底部导航和时分

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

### 品牌化收口与系列/号别真实浏览器验收（2026-09-11，未提交）

- 后端 `pytest`：**236 项通过**，退出码 0；存在 2 条 Starlette/anyio 弃用警告，不影响结果。
- 前端 `npm --prefix frontend run test`：**120 项通过**，退出码 0（新增 `branding.test.mjs` 2 项）。
- 前端 `npm --prefix frontend run typecheck`：通过，退出码 0。
- 前端 `npm --prefix frontend run build`：成功（vite 6.4.3，143 modules）。
- 真实浏览器 E2E（53000 正式前端 / 8000 后端，临时账号已清理）：
  - 桌面 1440px / 移动 390px：登录/注册、刷新恢复、总览、数据明细与明细弹窗、
    结算单对比、结算单详情、系列对比均通过；各页 `body/html` 横向溢出均为 0。
  - 系列 AI：默认勾选结算单点击「生成分析」，成功返回并渲染结论。
  - 号别 AI：切换「按等级号别」点击「生成号别小结」，成功返回并渲染结论。
  - 真实文件上传：临时 CSV 上传后，导入记录标题回填为 `验收-E2E`，副标题包含
    `商号 E2E<时间戳>`；临时账号、上传批次、销售明细与上传文件均已清理。
  - 仅有的控制台错误是登录/注册前 `restoreSession()` 对 `/api/auth/me` 的预期 401，不影响页面。

### 手机端 4 核心页卡片化与收折（2026-09-11，未提交）
### 手机端第二轮紧凑化（2026-09-12，未提交）

- 前端 `npm --prefix frontend run typecheck`：通过，退出码 0。
- 前端 `npm --prefix frontend run test`：**123 项通过**，退出码 0。
- 前端 `npm --prefix frontend run build`：成功（vite 6.4.3，145 modules）。
- Playwright + Chromium（53001 开发实例，390×844，真实 MySQL 数据，临时账号已清理）：
  - 总览、结算单详情、数据导入、系列对比的移动端展开/收起按钮均可正常切换；
  - 数据明细「查看明细」可打开底部抽屉并正常关闭；
  - 各页面 `scrollWidth` 均等于 390，无横向溢出。
- 改造后移动端页面高度：
  - 销售总览 1035px（约 1.23 屏）
  - 数据明细 1134px（约 1.34 屏）
  - 结算单对比 1412px（约 1.67 屏）
  - 结算单详情 1181px（约 1.40 屏）
  - 系列对比 1343px（约 1.59 屏）
  - 数据导入 844px（约 1.00 屏）
- 预览截图已重新生成至 `frontend/dev-preview/mobile-review/`，该目录已加入 `.gitignore`；
  临时预览账号 `tmp_mobile_review_20260911` 已从数据库删除。


- 前端 `npm --prefix frontend run test`：**123 项通过**，退出码 0。
- 前端 `npm --prefix frontend run typecheck`：通过，退出码 0。
- 前端 `npm --prefix frontend run build`：成功（vite 6.4.3，144 modules）。
- Playwright + Chromium（53001 开发实例，390×844，真实 MySQL 数据，临时账号已清理）：
  系列选择抽屉开关、系列详细分析展开、数据明细弹窗、结算单销售明细卡片、导入重新加载
  5 个关键移动交互均通过；4 个改造页面未再出现被底部导航遮挡的操作按钮。
- 改造后移动端页面高度：数据明细约 2039px、系列对比约 2056px、结算单详情约 2816px、
  数据导入约 2301px；不再有 5000px+ 的系列对比长页。

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
  4 张结算单合计 3,821 件 / ¥1,654,520 / 平均每千克售价 ¥433.0071，与设计稿基线（¥433.01）一致；
  宝贝01/02/003 三张的 A/B/C 件数、金额、平均每千克售价、价差与用户手算结果逐项一致。
- 浏览器端到端（Playwright + Chromium）：商号维度批次 15 + 23 项检查通过（系列对比页尚未做）。

失败：无

尚未测试：

- 真实业务数据（当前线上只有 4 张示例结算单）覆盖不到的字段组合；
  系列对比页与 AI 分析结论的真实浏览器验收已于 2026-09-11 完成。

## Git State

Branch：`dev`

Latest commits：

```text
dfbd8a3 chore(frontend): 上线前清理旧入口与临时文件
876bd61 docs(handoff): 同步提交与推送状态
de40eca feat(import): 收口多文件导入手工录单与顺仔问答
4903399 feat(analytics): 等级动态展示并新增结算单同品牌AI分析
2c7c5c8 feat(frontend): 完善侧栏分页与系统页脚
d1dd57b chore(backend): 统一环境变量到 backend/.env
0a20e9f docs: 更新README页签与通知说明
b740af4 feat(frontend): 页签右键菜单支持刷新与关闭操作
eeb6681 feat: 品牌化统一日期筛选并优化结算详情与移动端
```

Uncommitted changes（2026-09-18 上线前清理后）：

- `fruits_ana` 工作区干净；`git status` 为 `dev...origin/dev [ahead 1]`，`tickets/` 已忽略。
- `fruits_ana_admin` 已合入 `main` 并推送到 `origin/main`，本地 `main`/`dev` 与远端同步。
- 未改动 `.env`、`backend/.env`、MySQL 配置；`.superpowers/`、`.superpowersigeria/`、
  `attachments/`、`backend/data/` 仍被 `.gitignore` 忽略，不会提交。
