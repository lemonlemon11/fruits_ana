# HANDOFF

Last updated：2026-09-14 (CST)
Written by：Codex（内容由当前工作区实测生成，非对话记忆）

## Current Goal

本轮（2026-09-14）完成「品牌口径统一 + 结算单详情品牌筛选 + 全站统一日期范围组件」：
界面可见的「系列」统一改为「品牌」，结算单详情页新增品牌下拉，五个业务页的起止日期
改由 `DateRangeFilter.vue` 一个面板选择；AI 系列数据包字段同步改名并提升 `PROMPT_VERSION` 到 `v6`。
相关代码、测试、文档已完成，见 Current Status / Test Status。

单号与商号命名适配（ADR-015 / ADR-016）均已交付：**原始写法 + 适配后写法双写落库，
页面统一展示适配后写法，原始写法保留可追溯**；线上 MySQL 迁移已执行、真实浏览器验收通过，
代码与文档已提交到 `dev`（尚未 push）。工作区剩余的未提交改动属并发会话的品牌化与预览页改造，见 In Progress。

本轮另完成「认证门户精简 + 可选 30 天免登录 + 工作台外壳控制」：登录/注册能力说明与
「先看演示效果」入口已移除，`remember_me` 控制 7/30 天会话；header 增加品牌首页链接、
桌面侧栏收起、本地时间显示，移动端保留底部导航。相关代码与文档尚未提交，见 In Progress。

随后补上导入等待遮罩、右下角一键回顶、header 秒级时间和手机端展示优化，并计划提交到 `dev`。
最新一轮已完成手机端 4 个核心页面的卡片化与收折改造；随后又完成第二轮手机端全局紧凑化与关键组件压缩，见 In Progress。

## Current Status

状态：P0-1 / P0-2 / P0-3 / P0-4 均已完成 / COMMITTED

当前进度：
- **品牌与日期筛选（2026-09-14）**：新增 `DateRangeFilter.vue`，五个业务页统一从一个
   面板选择起止日期；结算单详情页新增品牌筛选，商号候选与价格基线随品牌收窄；
   前端用户可见文案的「系列」统一为「品牌」，后端 `UNKNOWN_SERIES` 显示值改为「未识别品牌」；
   AI 数据包字段由「系列」改为「品牌」，`PROMPT_VERSION` `v5 → v6`。
   验证：前端 123 项测试 / `typecheck` / `build` 通过，后端 236 项 pytest 通过。
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
   a. 与并发会话确认品牌化改动的处理（`AGENTS.md` / `backend/app/main.py` / `backend/app/__init__.py` /
      `frontend/index.html` / `AuthPortal.vue` / `RegisterView.vue` / `styles-auth.css` /
      `dev-preview/**` / `public/**` / `BrandMark.vue` / `PublicPreviewView.vue`）：
      这些**不属于命名适配**，不要混进命名相关提交，先确认归属再提交。
   b. 系列对比后续能力：到港日期字段与一次库迁移、元/KG 口径、Excel 导出、系列别名字典。
   c. 真实业绩数据到位后的整体回归验收（目前线上只有 4 张示例结算单）。
   d. 已确认：`FRUIT_ANALYSIS_AI_*` 由 `backend/app/ai_settings.py` 读取，不再视为未使用配置。
   e. 已完成：品牌化收口、真实浏览器验收与文档同步；剩余事项是确认这些未提交改动如何拆提。
   f. **文档同步（长期约定）**：界面功能、操作流程或指标口径新增/调整时，必须同步更新
      `docs/SLD-水果市场销售分析-功能说明书.docx` 与 `docs/SLD-水果市场销售分析-用户操作手册.docx`；
      改动说明可顺带在 `docs/TODO.md` 或 `docs/DECISIONS.md` 留痕，不视为独立提交阻塞项。
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
- 等级映射（`BC → C`）、指标口径（金额 ÷ 数量、按销售日期筛选）：变更必须先新增 ADR。
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
frontend/src/main.ts                     # 路由与守卫（默认入口 /login）
frontend/src/auth.ts                     # 前端会话状态与 safeRedirect
frontend/src/components/AuthPortal.vue   # 登录/注册共用骨架
frontend/src/api/types.ts                # API 契约
frontend/src/views/ImportView.vue        # 导入页（本轮修复点）
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

当前测试：PASS（2026-09-14 实测：后端 236 项 pytest、前端 123 项测试、
`typecheck`、`vite build` 全通过；服务已重启，`/health` 返回 `{"status":"ok"}`。）

### 品牌口径与统一日期范围（2026-09-14，未提交）

- 后端 `pytest`：236 项全部通过，退出码 0
- 前端 `npm --prefix frontend run test`：123 项全部通过，退出码 0
- 前端 `npm --prefix frontend run typecheck`：通过，退出码 0
- 前端 `npm --prefix frontend run build`：成功
- 运行服务：已重启 `fruits_ana` 后端，`GET /health` 返回 200；Nginx 继续托管最新 `dist`

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
4823631 feat(backend): 单号商号双写并增加回填迁移
294cf2f feat(frontend): 统一图表图例与悬浮提示
03dbb6d feat(frontend): 页面统一展示适配后单号与商号
668f572 feat(frontend): 外壳增加顶部 header 与页签栏
bbbce09 docs: 修正导入文件类型与日期接口参数口径
09dfb4b fix(frontend): 修复系列对比移动端横向溢出
168f126 docs: 记录果农版简化设计并更新交接与待办
a1e8bfd test(frontend): 更新界面与筛选交互守卫
4dbe9b8 style(frontend): 全站字号统一并修正表格文字对齐
c773dd8 fix(frontend): 修复系列对比均价柱状图高度塌缩
fe586aa fix(frontend): 单日趋势图增加参考线与提示
d2d8a3e fix(frontend): 商号下拉默认选中并切换立即刷新
9f7bb11 fix(frontend): 总览页结算单销售情况跟随商号筛选
48b4ed5 feat(frontend): 果农版主导航收敛并增加移动端底部导航
3e50d9f fix(frontend): 下拉框改为商号在前展示避免误选
58d164b docs: 记录系列对比口径与实现范围
7703981 feat(frontend): 增加系列对比页面与图表
57468ee feat(backend): 增加按系列组织的结算单对比分析
2160b38 docs(agent): 更新交接状态
e0ce64b chore(project): 忽略本地工具状态与业务附件
9270c4b docs: 记录商号维度设计与迁移决策
bbcd09e refactor(frontend): 页面口径切换到商号维度
72e6d66 chore(frontend): 补充 test 与 typecheck 脚本
aaea0f8 feat(auth): 认证页接入本地榴莲主图
0160fdf refactor(backend): 以商号替换柜号作为结算单唯一键
```

Uncommitted changes（2026-09-11 22:53 实测，待随本次提交落到 `dev`）：

- 部署切换：`start.sh`、`frontend/vite.config.ts`、`deploy/fruits_ana.nginx.conf`、
  `README.md`、`docs/ARCHITECTURE.md`；`start.sh` 默认改为 Nginx 生产模式。
- 前端展示与测试：四个 `styles-*.css`、`frontend/tests/shell-header.test.ts`、
  `frontend/tests/farmer-ui-copy.test.mjs`。
- 文档与规则同步：`AGENTS.md`、`docs/HANDOFF.md`、`docs/TODO.md`。
- `.superpowers/`、`.superpowersigeria/`、`attachments/`、`backend/data/` 仍被 `.gitignore`
  忽略，不会提交；未改动 `.env`、`backend/.env`、MySQL 配置。
