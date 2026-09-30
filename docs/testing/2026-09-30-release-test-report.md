# fruits_ana 上线前全量功能测试报告

- 测试日期：2026-09-30
- 测试对象：`dev` 分支工作区（含未提交在途改动，HEAD=db6e6a4）
- 测试环境：后端 FastAPI `127.0.0.1:8000`（uvicorn，2 workers）；前端 `0.0.0.0:53000`（**vite preview，生产构建 dist**）；数据库为远端真实 MySQL（120.48.117.234:13306/fruits_ana）
- 测试账号：`test`（全权限：14 个权限码 + 两级菜单）
- 测试方式：主持人组织测试团队（T1-T5 共 5 个并行接口测试员）+ 主持人自动化基线 + 前端 HTTP 资产层验证。原计划的浏览器 GUI 端到端测试因本会话无浏览器后端（`__no_browser_backend__` 不可用）**降级**为「前端 HTTP 层验证 + 前端单测覆盖」，已在下文如实记录。
- 数据安全：全部写操作仅限 `T-TEST-` 前缀商号测试数据，真实业务数据（444/650/658 等）未触碰；测试数据测完即清理。

## 一、总体结论

**有条件可上线（无 Blocker 缺陷；3 个 Major 集中在导入校验/待核对语义，建议处理后上线）。**

- 三层验证共执行自动化基线（前端 326 单测+typecheck+build）+ 接口级用例 73 项（70 过 / 3 败 / 1 跳过）+ 前端 HTTP 资产层 6 项，**认证、导入修订与确认、看板分析、结算单列表、6 类导出、手工录单、AI 问答与分析、通知全部核心链路真实走通**，未发现任何数据错账（所有交叉核对偏差为 0）。
- **未提交在途改动回归结论：通过**。三个新字段（`payable_amount`/`market_sales`/`grade_details`）全部落地且数值自洽；导入修订 PUT 实测 1.22s（历史 bug 场景曾为 17-19s）；HEAD 干净对照证明后端 11 个 pytest 失败均为既有问题，与在途改动无关。
- 3 个 Major（D1/D2/D4）均在**导入数据质量防护语义**：含缺漏行的真实单被硬阻断必须逐行人工修订（force 不放行）、未知等级静默归 OTHER、`needs_review` 待核对标记在新链路未实现。三者组合的语义是「新模板导入链路未继承旧解析器的待核对/未知等级提示能力」，需产品确认口径：若「缺漏行必须人工修订后才能入库」正是预期防护，则 D1 属设计行为、D2/D4 仍建议修复。
- GUI 浏览器层已用**系统无头 Chromium（Playwright）补测完成**：只读链路（登录/菜单/总览图表/列表/详情/对比/导入页/通知/顺仔/404/移动端分流/1366 窄屏）与写链路关键交互（上传→复核页→确认弹窗硬阻断禁用→丢弃→列表联动）全部走通，控制台零 JS 异常；仅手工录单的 EP 下拉/日期组件自动化交互受限（页面渲染已截图验证、录入契约由 API 层 18/18 覆盖），建议上线前人工点一遍录单表单。

## 二、测试范围与结果总览

| 层级 | 范围 | 结果 |
| --- | --- | --- |
| 自动化基线-后端 | pytest 全量 | 11 失败，**全部为既有失败**（10 个缺测试附件连带 + 1 个既有断言漂移），非在途改动引入，详见 2.1 |
| 自动化基线-前端 | node:test 326 项 + typecheck + build | ✅ 326/326 通过；typecheck 通过；build 通过（chunk >500kB 警告，观察项） |
| T1 认证与权限 | 登录/会话/登出/注册与找回密码校验/菜单下发 | ✅ 10/10 通过，无缺陷 |
| T2 导入链路 | 上传→草稿→修订→确认→冲突覆盖→问题项→丢弃 | ⚠️ 17 项中 14 过 / 3 败：发现 3 个 Major（D1/D2/D4）+ 2 个 Minor（D3/D5）；核心流程与数据全部走通 |
| T3 看板分析 | overview/trend/等级拆分/对比/单柜详情 | ✅ 10/10 通过，无缺陷；1 个 Minor 观察项（OBS-4） |
| T4 结算单与导出 | 列表分页排序/明细/复核/5 类导出 | ✅ 18/18 通过，无 Blocker/Major；2 个 Minor 观察项（OBS-2、OBS-3） |
| T5 手工录单+AI+通知 | 录单草稿/创建/更新/导出/AI 问答/通知 | ✅ 18/18 通过，无缺陷，测试数据零残留 |
| 前端 HTTP 层 | 资产/路由回退/代理/静态错误页 | ✅ 全部通过，详见 2.3 |
| GUI 浏览器端到端 | 登录后各页面视觉与交互（无头 Chromium 补测） | ✅ 关键交互全通过，控制台零异常；1 项自动化受限如实记录（见 2.4/2.9） |

### 2.1 后端 pytest 基线（11 失败的定性）

失败集合：test_settlement_template ×3、test_import_draft_service ×4、test_imports_api ×2、test_settlements_api(review) ×1、test_exports ×1。

- **10 个失败根因**：缺测试附件 `attachments/结算单模板样式-测试数据 1/2/3.xlsx`（该文件不在仓库且历史上被 gitignore，需业务方补件）。其中 test_settlements_api 的 review 用例与 import_draft_service/imports_api 部分用例是通过「解析该附件构造夹具」连带失败（`FileNotFoundError` 及其下游空值断言）。
- **1 个失败为既有断言漂移**：`test_exports.py::test_settlement_list_xlsx_exports_sales_after_sale_and_fee_details` 断言销售明细第 5 列应为 `—`，实际为 `金枕`。已用 `git worktree` 在**干净 HEAD** 上复跑，同样失败——证明与工作区未提交改动无关，是已提交代码中的既有失败（测试期望与导出实现漂移，需开发定位是测试过期还是导出列变更）。
- **在途改动回归结论（重要）**：HEAD 对照证明 11 个失败均非未提交改动引入；未提交改动的接口级回归由 T2/T3/T4 专项验证（payable_amount/market_sales/grade_details、导入修订耗时）。
- 注：`docs/HANDOFF.md` 此前记录「8 个失败全部因缺附件」与实测不符——实际为 11 个（含上述 exports 既有失败），本报告已修正口径。

### 2.2 前端自动化基线

- `npm --prefix frontend run test`：326/326 通过（含本次在途改动的 data-table / MoneyInput / import-review-copy 用例）。
- `npm run typecheck`：通过。`npm run build`：通过（6.68s；警告：单 chunk >500kB，建议后续 manualChunks 拆分——观察项 OBS-1）。

### 2.3 前端 HTTP 资产层验证（主持人执行）

| 检查 | 结果 |
| --- | --- |
| index.html 资产引用（favicon/js/css） | ✅ 全部 200 |
| SPA 路由回退（/login /overview /settlements /imports /entry /series-comparison /settlement-detail /import-review /preview /error） | ✅ 全部 200 |
| 移动端 UA 重定向内联脚本（含 ?desktop=1 逃生口） | ✅ 存在 |
| error-static.html 静态兜底页 | ✅ 200 |
| :53000 → :8000 的 /api 反向代理 | ✅ 正确转发（未登录返回后端 401 JSON） |
| :53000 服务形态 | vite preview（生产构建 dist，含在途前端改动）；注意 8000 为无 --reload 的 uvicorn，改后端需重启 |

### 2.4 GUI 浏览器端到端测试（无头 Chromium 补测完成）

测试会话内 ZCode 托管浏览器不可用（`__no_browser_backend__`），初版报告曾降级为单测+HTTP 层验证；随后按用户指示改用**系统本机 Playwright + Chromium headless（chromium-1169）**完成补测，覆盖并超越了原计划（真实文件上传、控制台/pageerror 捕获、1440/1920/1366 三档视口截图）。详细结果见 2.9。

### 2.5 T4 结算单列表与导出（18/18 通过，无 Blocker/Major）

覆盖：默认列表字段结构（16 字段）、分页 1/2×10/20/50 全组合不重叠、7 字段×asc/desc 排序全有序、keyword 模糊（商号/柜号/车牌/单号前缀）、品牌筛选零不一致、明细合计与列表**完全相等（差 0）**、只读复核结构完整、6 类导出（overview.csv 含 UTF-8 BOM、列表 xlsx 16 行与 total 一致、单笔 xlsx 行数=record_count、模板 xlsx、模板 PDF 3 页且 %PDF 头尾完整、记录溯源含原文件名+sha1）、Content-Disposition 中文 RFC5987 编码正确、未登录 401、不存在商号 404、7 类非法参数全部 422 且文案明确。

- 在途字段 `payable_amount` 三方一致：API 列表 16 行 ↔ xlsx「应付贵方总金额(RMB)」列 ↔ review 接口，零偏差；无摘要时输出 null（代码路径确认）。
- 观察项 OBS-2（Minor）：**前端列表侧未消费新字段**——`frontend/src/api/types.ts` 的 `SettlementListItem` 无 `payableAmount`（仅详情类型 types.ts:172 有），列表归一化函数将该字段丢弃。属在途改动未完成的前端半边，需前端补齐（列表 UI 如需展示应付金额）。
- 观察项 OBS-3（Minor）：total < pageSize 时请求超出范围的 page（如 page=2&page_size=20）被静默钳制回第 1 页返回 200；前端 pages=1 时不会发出该请求，实际不可触发，仅 API 层语义记录。

### 2.6 T3 看板与分析（10/10 通过，无缺陷）

覆盖：filter-options（品牌/国家/市场/年月）、overview 双窗口数值联动、start>end **422 中文报错**、未来窗口空数据不报错、trend 15 点合计与 overview **精确一致**、grade-breakdown 顶层 `market_sales`、grade-spec-breakdown 等级×规格、settlement-comparison 排名与等级贡献度、单柜详情基础 8 字段+均价精确吻合、series-comparison（含不存在商号 404）、AI 分析 1 次（200，9.8s，deepseek-v4-pro，中文结构化，落缓存符合 ADR-047）、grade-breakdown 合计与 overview 偏差 0。

- 在途字段实测：`total.payable_amount`=8,157,044.99（9 月窗口，数值型）✅；`market_sales` 顶层按市场聚合且合计与 overview 精确相等 ✅；`grade_details`（buckets/unrecognized/total/insights）在单柜详情与系列对比均在位 ✅。
- 总柜数口径确认：container_count = 结算单数（与 ADR-053 一致），非唯一柜号数。
- 观察项 OBS-4（Minor）：空日期窗口下 `payable_amount` 为 `null` 而其余 total 字段为 `0.0`，null/0 口径不一致，前端需判空。
- 观察项 OBS-5（观察）：AI 分析耗时 9.8s，前端需 loading 提示；grade-breakdown 内联返回全量 586 条明细 records，看板场景 payload 偏大（约数百 KB），建议后续瘦身。
- 测试期间并行写入说明：本组两次取数间 overview 从 16 柜变为 17 柜（+2,900 元），恰为并行测试员创建的 T-TEST-MAN-01，口径自洽，非缺陷。

### 2.7 T5 手工录单 + AI + 通知（18/18 通过，无缺陷，数据零残留）

覆盖：字段字典、草稿存/取/删（逐字段一致）、创建 201（source_type=manual）、超来货 422 中文阻断文案、缺商号/缺市场 422、查询/更新/导出 xlsx（PK 魔数+openpyxl 可读+改价生效）、同商号 409 及 `overwrite=true` 覆盖语义（数据真实替换）、结算单列表与总览全局可见、AI ask（3.75s，1 轮 get_overview 工具调用，金额/件数/均价自洽）、单柜 AI 分析缓存命中（cached=true 0.45s）、通知只读结构。

- 手工单 BC 等级入库后 grade_quantities 显示 C=50，再次验证 BC→C 转换口径。
- 清理验证：DELETE 后三次关键词复查（默认窗/显式窗）均为空、entry 草稿为 null、通知未动（unread_count=0 保持）。
- 观察项 OBS-6（观察，供业务确认）：① 结算单列表默认日期窗随库内最新到货日收缩（删除 09-30 数据后窗口变为 08-19~09-19）；② 列表项无 source_type 字段，manual 来源需进详情确认；③ 品种（variety）字典配置值为 A–F，与等级语义接近，建议业务侧确认字典意图。

### 2.8 T2 导入链路（17 项：14 过 / 3 败；发现 3 Major + 2 Minor；数据与流程全部走通）

**走通的部分**（基于 650 真实单的 5 个变体，基准值 `tmp/e2e-test-files/expected.json` 全部比对一致）：
- 多文件 preview（3 文件 0.73s）→ job/draft 读取 → 文件合计核对（A/B 文件合计 1977 件/569,120 元与 expected 完全一致；C 文件「文件值 vs 系统计算」对账触发 4 条 summary_mismatch warning）。
- 草稿修订 PUT 200、版本号递增、**修订留痕逐字段正确**（`sales,row14,old.unit_price,"260"→"265",二次确认页人工修改`），耗时 **1.22s**。
- confirm 409 分流结构 `{blockers, conflicts, hard_blockers}` 清晰：商号冲突类 force 可覆盖（覆盖后数据真实替换且留痕 `full_batch: 导入覆盖同商号结算单`）；硬阻断类 force 不放行。
- **BC→C 转换实测通过**：B 单入库后 grade=C / grade_raw=BC，AB 独立保留，无 BC 原文落库。
- 边界值：规格区间 9/10 正确落 `piece_count_min/max`、小数单价 25.5、999 件大数量、25 字超长备注完整。
- discard 后无新结算单；issues 列表/resolve（warning_count 4→3）/issues.csv 均正常。
- 在途字段 `payable_amount`（列表+详情）、`grade_details`（单柜详情 buckets）在测试数据上均在位。

**失败的部分**（详见第三节 D1/D2/D4/D3/D5）：含缺漏行的「正常单」无法确认且 force 无效；未知等级 XX 无问题项静默归 OTHER；缺单价+缺金额行静默 0 元入库；`needs_review` 待核对标记在导入链路全为 0；修订留痕噪音大（一次 PUT 77-95 行，真实变更仅 2-4 行）。

- 报告口径修正：T2 初报「E 边界单 confirm 200」实为 **409→force→200**（API 对照实验证实同一文件不带 force 必 409，`sales_exceed_arrival` 位于可 force 的 `blockers` 段）；不影响结论，记录以本节为准。
- 观察项 O1：confirm 6.99~16.15s、DELETE 6.2~7.7s（远程 MySQL + 52 行逐条写入 + 并行测试环境），建议后续对 confirm 做批量写优化（与修订 PUT 同款 bulk 思路）。

### 2.9 GUI 无头浏览器补测结果（G1/G2/G3）

**环境**：Playwright + Chromium headless（本机 `~/.cache/ms-playwright`），1440×900 为主、1920 与 1366×768 抽查，全程捕获 console.error / pageerror / >=400 响应。

**G1 只读链路（21 项，20 过 + 1 项补测通过，无缺陷）**

| 验证 | 结果 |
| --- | --- |
| 登录页渲染、「登录经营台」按钮、「30 天内免登录」、登录跳转 /overview | ✅ |
| 侧栏两级菜单（销售总览/销售单管理/销售分析/录单·导入） | ✅ |
| 总览 4 个 canvas 图表渲染、关键指标文案 | ✅（「应付」未在总览展示，与 OBS-2 同源：前端未消费新字段） |
| 每一单列表 25 行表格、导出/操作入口、表头排序点击 | ✅ |
| 销售详情（444）：基础信息/来货数量/应付贵方/同品牌经营分析 AI 卡、图表 | ✅ |
| 品牌对比选择抽屉（品牌/确定文案） | ✅ |
| 导入页三区块（手工录单/导入记录/等级口径） | ✅ |
| 通知面板打开 | ✅ |
| 顺仔问答 UI 闭环（fab→面板→提问→3.0s 数字回答 8,577,382.99） | ✅（初测因 fab 按钮动画稳定性超时，JS 点击补测通过） |
| 404 落错误页 | ✅ |
| 移动 UA 整站分流 → 独立移动版 `8.134.219.84:54001`（ADR-052）；`?desktop=1` 逃生口留在桌面站 | ✅ |
| 1366×768 总览/列表抽查 | ✅ 截图无布局破坏 |
| UI 退出登录回 /login | ✅ |

**G2/G3 写链路与聚焦验证（关键交互全通过，无新增缺陷）**

| 验证 | 结果 |
| --- | --- |
| 真实文件上传（2 个 xlsx）→ 自动跳 `/import-review?job=` | ✅ |
| 复核页整页渲染：文件切换、需先补全红条、锚点导航、8 字段回填、50 行可编辑销售表、金额列自动计算（绿色加总）、删除行 | ✅ 截图验证，无错位 |
| fit-width 回归：11 列销售表无横向滚动条（el-table__body 6px 差值为滚动条预留，视觉不可见） | ✅ 在途改动视觉通过 |
| 复核面板宽度：1920 视口实测 **1560px** cap | ✅ 在途改动视觉通过 |
| 确认弹窗：标题「存在问题需修正后才能提交」、错误行红字表格 + 待核对项黄字表格（在途三列表格）、**硬阻断时「确认提交」按钮实测 disabled=true** | ✅ 在途改动视觉通过 |
| 被拦截文件不入库（API 复查为空）、丢弃任务 | ✅ |
| 手工录单页渲染：五分区、公式提示、6 固定费用项、结算核对汇总、空态文案、等级说明侧栏 | ✅ 截图验证 |
| 手工录单端到端填写 | ⚠️ 自动化受限（EP 下拉/日期组件交互超时，疑似草稿 800ms 防抖重渲染加剧）；页面渲染与录入契约（T5 API 18/18）均已覆盖，建议上线前人工点一遍 |

**控制台健康**：三轮脚本全程 console.error 仅登录前预期的 `/api/auth/me` 401（未登录会话探测），**pageerror（未捕获 JS 异常）为 0**。

**新增观察项**：
- OBS-7（观察，语义记录）：`sales_exceed_arrival` 在 API confirm 409 中位于 `blockers` 段（带 force 可放行入库，采用系统计算值修正），UI 确认弹窗则直接禁用提交——**UI 严于 API，方向安全**；交接时请知悉两端语义差异。
- OBS-8（观察）：顺仔 fab 按钮存在持续动画，自动化稳定性检查超时（人工点击不受影响）；如后续做 E2E 可考虑 `prefers-reduced-motion` 支持。

## 三、缺陷与观察项清单

### 缺陷（0 Blocker / 3 Major / 5 Minor）

| 编号 | 严重级 | 标题 | 现象与证据 | 建议 |
| --- | --- | --- | --- | --- |
| D1 | Major | 含缺漏行的真实单无法确认入库，force 也不放行 | 650 原样单（含烂皮行缺等级/规格、损霉行缺数量、销售 1977>来货 1970）confirm 409 hard_blockers；force=true 仍 409（`import_draft_service.py` 在 force 判断前先抛硬阻断）；必须逐行人工修订后才可入库 | 需产品确认口径：若「缺漏行必须人工修订」为预期防护则属设计行为；否则应允许 warning 级行带确认入库 |
| D2 | Major | 未知等级静默归 OTHER，无任何问题项 | 等级 XX 行 draft 无 unknown_grade 问题项，入库 grade=OTHER/grade_raw=XX；旧解析器有 unknown_grade 校验，新链路 `validate_draft_payload` 未实现（`field_conversion.py` 无规则时静默返 OTHER） | 上线前修复：validate 阶段对「转换后为 OTHER 且原文非 OTHER」的行产生问题项（至少 warning） |
| D3 | Minor | 缺单价且缺金额的行不产生问题项 | C 文件 46 行（有数量无单价无金额）无 issue，入库为 0 元销售（旧解析器有「单价和金额不能同时缺失」校验） | validate 阶段补校验 |
| D4 | Major | `needs_review` 待核对标记在导入链路未实现 | 烂皮/验果等待核对行 review 快照无逐行标记、payload.issues=[]；DB `sale_record.needs_review` 全 0（仅旧解析器场景置 1）——「待核对行」概念在新链路悬空 | 与 D1 同一口径决策：确认产品形态后实现或移除 |
| D5 | Minor | 修订留痕噪音大 | 一次 PUT 产生 77-95 行 settlement_revision，raw_row_text×53、is_custom×7 等归一化噪音占绝大多数，真实业务变更仅 2-4 行 | 留痕前做字段白名单/变更差集过滤 |
| OBS-2 | Minor | 前端列表与总览侧均未消费新字段 payable_amount | 列表：`types.ts` `SettlementListItem` 无 `payableAmount`（仅详情类型 L172 有），归一化丢弃；总览：`OverviewView`/`GradeSummary` 零引用 payableAmount（GUI 补测实证总览页无「应付」字样）；后端与 xlsx 导出已就绪且三方一致 | 在途改动前端收尾：列表类型+归一化+总览指标卡补齐 |
| OBS-3 | Minor | 分页越界请求被静默钳制回第 1 页 | total=16 时 page=2&page_size=20 → 200 返回第 1 页；前端实际不会发出该请求，不可触发 | 可保持现状，记录语义 |
| OBS-4 | Minor | 空窗口 payable_amount 为 null，其余 total 字段为 0.0 | overview 空日期窗口径不一致 | 统一为 0 或前端判空 |

### 观察项（非缺陷，供上线检查单/后续优化）

- OBS-1：前端单 chunk >500kB（build 警告），建议 manualChunks 拆分。
- O1：导入 confirm 6.99~16.15s、结算单 DELETE 6.2~7.7s（远程库逐行写入），建议参照修订 PUT 同款批量写优化（后者已优化至 1.22s）。
- OBS-5：AI 单柜分析 9.8s（前端需 loading 提示）；grade-breakdown 内联返回全量 586 条明细 records，看板场景 payload 偏大。
- OBS-6：① 结算单列表默认日期窗随库内最新到货日收缩；② 列表项无 source_type 字段（manual 需进详情确认）；③ 品种（variety）字典配置值为 A–F、与等级语义接近，建议业务确认字典意图。
- T1 组：logout 返回 204（语义正确）；会话 Cookie 无 `Secure` 标志（本地 HTTP 所限，**上线走 HTTPS 时务必开启**）。
- 残留说明：T-TEST 导入任务/草稿/修订留痕的历史行保留在 import_job/import_draft/settlement_revision（UI 导入记录读 import_batch，已级联删除，用户不可见）。

### 基线问题（非产品功能缺陷，需处理）

- 后端 pytest 11 个既有失败：10 个因缺测试附件 `attachments/结算单模板样式-测试数据 1/2/3.xlsx`（需业务方补件），1 个为 test_exports 断言漂移（HEAD 上即失败，需开发定位是测试过期还是导出实现变更）。`docs/HANDOFF.md` 原记录「8 个失败全部因缺附件」口径不准，本报告已修正。
- 手册 md/docx 手机端章节与「销售详情」菜单名未同步等文档债已在 TODO 记录，本轮未重复验证。

## 四、在途改动（未提交）回归专项结论

工作区两条并行在途线（后端字段扩展 + 导入确认页体验修复）已全部加载进运行中的服务（8000 后端、53000 vite preview 的 dist 构建产物），专项回归**全部通过**：

| 回归点 | 结论 | 证据 |
| --- | --- | --- |
| `overview.total.payable_amount` | ✅ 数值型、随窗口联动；空窗口为 null（OBS-4） | 9 月窗口 8,157,044.99 |
| 列表项 `payable_amount` | ✅ 后端落地，与 xlsx「应付贵方总金额(RMB)」列 16 行零偏差；**前端列表类型未消费**（OBS-2，收尾项） | T4 三方一致性验证 |
| `grade-breakdown.market_sales` | ✅ 顶层字段、按市场聚合、合计与 overview 精确相等 | 海吉星 6,997,477.99 / 江南 1,579,885.00 |
| 结算单详情 `grade_details` | ✅ buckets/insights 结构完整、均价精确吻合 | A 级 408,020/1335=305.633 |
| 导入修订 PUT 耗时（历史 17-19s bug） | ✅ **1.22s**，批量写修复生效，留痕逐字段正确 | `(sales,row14,old.unit_price,"260"→"265")` |
| 确认弹窗 fit-width / MoneyInput / 待核对三列表格 | ✅ **无头浏览器视觉实测通过**：1560px 面板、表格无横滚、硬阻断禁用提交、待核对三列表格渲染正确；逻辑层前端单测 326/326 | 截图 + G3 实测 |
| pytest 全量 | ✅ 11 失败均为既有（HEAD worktree 对照证实），在途改动零回归 | git worktree 对照 |

## 五、测试数据清理记录（主持人独立复核）

| 项 | 结果 |
| --- | --- |
| T-TEST 结算单（650-A/B/E、MAN-01、覆盖后 A） | ✅ 已删；`keyword=T-TEST` API 复查为空 |
| import_batch / sale_record / settlement_summary 的 T-TEST 行 | ✅ DB 只读复查 0 行（DELETE 级联清理） |
| T-TEST 导入任务 | ✅ 2 个 pending（被 409 阻断的 job1/job3）已由主持人补 discard；终态 5 discarded + 4 confirmed（纯历史行） |
| 手工录单草稿 | ✅ T5 复查 draft=null |
| 真实数据（444/650/658 等 16 单 + 12 条既有 pending 草稿） | ✅ 全程零写操作，未受影响 |
| test 测试账号 | ✅ 保留（用户资产）；通知已读状态未动（unread_count=0） |
| 仓库文件 | ✅ 仅新增 `docs/testing/`（本报告）与 `tmp/e2e-test-files/`（生成脚本 + 5 个测试 xlsx + expected.json，可复用）；未执行任何 git 写操作 |
