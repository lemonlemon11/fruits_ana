# TODO

> 已完成（2026-09-30）：**「查看明细」销售明细合并展示 + 居中**——只读态销售明细按
> 导出同口径（同日/品种/等级/规格头数/KG/单价/备注）合并为一行、数量汇总（金额随数量
> 重算，合计不变）；销售/售后/支出费用三表只读态表头与单元格居中；编辑态（导入二次
> 确认）保持逐行与默认对齐。前端 315/315 test / typecheck / build 通过，dist 已重建。
> 详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-30）：**「查看明细」整页形态收紧**——内容列铺满页签页面宽度（去掉
> 1280px 居中窄列，宽屏不再两侧留白），销售明细表只读态启用列宽自适应（窄屏压缩铺满
> 不横滚、悬浮看全值），编辑态（导入二次确认）不受影响。前端 314/314 test / typecheck /
> build 通过，dist 已重建。详见 `docs/HANDOFF.md` 顶部同日记录。

> 待办（看板回退，可随时恢复）：**销售总览「一屏看板」已按用户指令回退**——真实页面
> 恢复为 demo 改造前版式；完整布局存档于
> `docs/superpowers/specs/2026-09-30-overview-one-screen-layout.md`，代码备份于分支
> `backup/overview-one-screen-dashboard`（恢复：`git cherry-pick 64f0d92 3f7c9f2`）。
> 若用户日后要恢复看板，按存档 spec cherry-pick 即可（dev-preview 53005 演示稿仍在）。

> 待办（数据清理，需用户明确指示）：导入待确认（pending）草稿堆积 12 条——10 条为已
> 入库 650 单同一文件 09-28~09-29 反复上传的残留，1 条 658 结算单（88 项问题）从未确认。
> 清理涉及删除数据库记录，待用户确认后再动；也可考虑为复核页补「放弃」入口。

> 已完成（2026-09-30）：**「查看明细」只读页改整页展示**——去掉全屏遮罩 + 居中弹窗卡片
> （`.review-modal`/`.review-dialog`），只读态随页签页面正常排版滚动（不限高、页面滚动），
> 编辑态（导入二次确认）保持弹窗不变。前端 315/315 test / typecheck / build 通过，dist
> 已重建。详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-30）：**「查看明细」定为应用内页签新开（终态）**——点「查看明细」在
> 外壳页签栏新开「查看明细」页签（列表页签保留可切换，同页签复用不堆积）；此前一日
> 的浏览器新窗口方案（window.open）经用户澄清后收回，恢复 `router.push` 页内跳转。前端
> 314/314 test / typecheck / build 通过，dist 已重建。详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-30）：**结算单列表「单号看不全」修复**——单号列标记 `noShrink` 退出
> fitWidth 压缩（下限＝理想宽，不再省略号截断）；小屏放不下时整表回退横向滚动而非截断
> 关键列。前端 314/314 test / typecheck / build 通过，dist 已重建。**待办（视用户反馈）**：
> 若 1366 屏不想滚动，需用户定夺删列（如录单时间）或单号去系列前缀（口径变更须记
> DECISIONS）。详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-30 凌晨）：**「查看明细」只读态改纯文本记录展示**——`/import-review`
> 只读模式不再满屏灰色禁用输入框：基本信息 8 字段改文本块、销售/售后/费用三表单元格改
> 纯文本（数量/单价/金额带格式化）；导入二次确认的编辑态控件与校验高亮不变。前端
> 311/311 test / typecheck / build 通过。详见 `docs/HANDOFF.md` 顶部同日记录。

> 待办（静态稿 v4 已出，待确认）：**销售总览「一屏看完」改版落地真实页面**——视觉伴侣
> 静态稿 **v4**（v2 通栏大数带+流体字号+三档自适应；v3 满高布局+等级卡明细弹层；v4 每日
> 趋势更名 + KPI 四格点击联动切换趋势指标 + 直线折线全点数值标注）已完成并跑在 53005
> （`frontend/dev-preview/overview-one-screen.html`）。三档视口页高恰一屏 + 四指标态视觉
> 审图全过。待用户确认 v4 后按计划文件
> `docs/superpowers/plans/2026-09-29-overview-one-screen-spec-detail.md`（含 v2/v3/v4 设计
> 语言章节）落 `OverviewView.vue` / `SettlementGradeBreakdown.vue` 并更新
> `overview-filters.test.ts`。

> 已完成（2026-09-29 晚）：**dev 回退至 `83678eb`（保留 styles.css 基础类块修复）**。
> 撤销其后 5 提交（`fb84276` 四页面「老板浏览序」重排版、`515ca88`/`ea4f20a` revert
> 往返、`08c20d8`、`0c86f14`），原样备份于分支 `backup/pre-rollback-0c86f14`；
> styles.css 30 行全局基础类块（`.page-stack`/`.filter-bar`/`.primary-button` 等）已从
> `0c86f14` 带回（`f3109c8` 事故丢失、83678eb 时本就缺失）。前端 310/310 test /
> typecheck / build 通过，dist 已重建。详见 `docs/HANDOFF.md` 顶部同日记录。

> 待办（设计已确认，待用户通知）：销售总览「一屏看完」改版——KPI 4 格+覆盖小注、双栏
> 紧凑网格、规格级（等级+头数+KG）占比+均价摘要（含等级小计）、「查看明细」页内手风琴
> 展开规格明细长表。计划文档随本次回退移出主分支，实施前从 `backup/pre-rollback-0c86f14`
> 取回 `docs/superpowers/plans/2026-09-29-overview-one-screen-spec-detail.md`。

> 已完成（2026-09-29）：第三场布局评审会（数据看板 O/P/Q）+ 误删事故恢复。用户定调
> 「数据看板思维、突出重点数据」→ 三套看板方案：O「通栏大数带」、P「答案卡阵」、
> Q「结论长卷」（重点数据 hero 化/图表优先/明细后置，菜单左侧、仅桌面、实测数据）。
> 同日发生 frontend 误删事故（清理嵌套符号链接目录跟随链接误删），git/构建/artifact/
> /tmp 快照多路恢复：线上 53000 已恢复，设计稿 i–q 与纪要齐（A–H 历史存档不可恢复，
> 入口已移除），详情见 HANDOFF 同日事故条目。**待办（设计）：用户从 O/P/Q 选型后落地
> （仅桌面端）**。

> 规则：只保留尚未完成的事项；完成后删除条目并在此留下简短留档。
> 最后更新：2026-09-29

> 已完成（2026-09-29）：侧栏一级菜单分组**支持收起 / 展开，默认展开**——分组标题改为
> 可点击按钮（箭头指示、aria-expanded），折叠状态仅会话内记忆；图标收起模式与无标题
> 一级入口行为不变。308 test / typecheck / build 通过（本会话无浏览器后端，交互以
> 53001 实开点检为准）。详见 `docs/HANDOFF.md` 顶部同日记录。

> 待办（设计）：用户从第四轮 Logo 方案（`design/logo/round4/preview.html`，专业质感系列；
> 前三轮归档于 design/logo/ 与 round2/、round3/）中选定后落地——重写 `BrandMark.vue`
> （solid/inverse 同步）、替换 `public/favicon.svg`、字标换授权字体转曲线、补单色/反白版、
> 登录页 hero 视方案调整；apple-touch-icon 遵循 ADR-052 默认不恢复；53003 静态服务用后即停。

> 已完成（2026-09-29，第四轮）：**专业质感系列四方案 Logo**（`design/logo/round4/`：8 SVG +
> preview.html）——去卡通/去塑料（深绿色阶+米白+香槟金，金色只给重点数据元素）。推荐「负形
> 锯冠」为主标。导航 index.html 与 MEETING.md 已同步；53003 端口在线呈现。未改任何代码，
> 详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-29）：结算单列表**全列居中 + 分页靠右**——所有列（含动态等级列、
> 操作列按钮组）表头与内容居中；分页 footer 与 ElPagination 改 flex-end（推翻旧
> 「靠左避让顺仔」决策，实测仅 4px 角部相蹭不影响点击）。308 test / typecheck /
> build 通过；浏览器：表头 12/12、单元格 120/120 居中，1440/1366/1280 复检全过。
> 详见 `docs/HANDOFF.md` 顶部同日记录。

> 待办（设计）：用户从第三轮 Logo 方案（`design/logo/round3/preview.html`，数据看板思维×
> 视觉伴侣；前两轮归档于 `design/logo/` 与 `round2/`）中选定后落地——重写 `BrandMark.vue`
> （solid/inverse 同步）、替换 `public/favicon.svg`、中文授权字体转曲线、补单色/反白版、
> 登录页 hero 视方案调整；apple-touch-icon 遵循 ADR-052 默认不恢复。

> 已完成（2026-09-29，第三轮）：**「数据看板思维 × 视觉伴侣」四方案 Logo**（
> `design/logo/round3/`：8 SVG + preview.html 主角-伴侣对照表）。重点数据做主角（箭头/
> 高亮点/仪表/¥），榴莲+物流+顺立达字标做伴侣。推荐方案二「高光折线」为主标。未改任何
> 代码，详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-29）：结算单列表**移除「柜号」列**（caption 同步；腾出 ~146px，
> 1920~1366 全档铺满零溢出）+ 顺带修复 fitWidth 多轮分配压破表头下限的回归
> （每轮按剩余可压量封顶，新增真实输入回归测试）。308 test / typecheck / build
> 通过；浏览器 8/8；element-plus 桌面 21 项全过。详见 `docs/HANDOFF.md` 顶部同日记录。

> 待办（设计）：用户从第二轮 Logo 方案（`design/logo/round2/preview.html`，顺立达×榴莲×
> 物流三合一；第一轮已归档）中选定后落地——重写 `BrandMark.vue`（solid/inverse 同步）、
> 替换 `public/favicon.svg`、中文授权字体转曲线、补单色/反白版、登录页 hero 视方案调整；
> apple-touch-icon 遵循 ADR-052 默认不恢复。

> 已完成（2026-09-29，第二轮）：**按「顺立达 × 榴莲 × 物流」重做四方案 Logo**（
> `design/logo/round2/`：8 SVG + preview.html 三要素对照表）。第一轮被用户整体否决后归档
> 于 `design/logo/` 根目录。推荐方案一「顺达航线」为主标、方案三「达字果标」为门头/商标
> 组合。未改任何代码，详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-29）：第二场布局评审会议 · L/M/N 三套（线上内容重排版）。内容基准＝
> tmp/live53000/ 线上 53000 实测（11 份 JSON+README，gitignore）+ views 源码；铁律＝菜单
> 保留左侧、只做排版样式、禁止外来叙事。产出 variant-l「贴线精修」（低风险保底）、
> variant-m「紧凑工作台」（密度推广全站）、variant-n「舒展分区」（大胆重排：深墨绿侧栏
> +三层底色+答案数字放大）；三稿已按用户要求移除手机端切换（手机端有单独项目）；
> 选型页默认 variant-l；纪要 review-meeting-20260929-round2.md。机器检查+质检内容基准
> 一致性均通过。**待办（设计）：用户从 L/M/N 选型后落地到 frontend/src（仅桌面端）**。
> 详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-29）：第二场布局评审会议 · L/M/N 三套（线上内容重排版）。内容基准＝
> tmp/live53000/ 线上 53000 实测（11 份 JSON+README，gitignore）+ views 源码；铁律＝菜单
> 保留左侧、只做排版样式、禁止外来叙事。产出 variant-l「贴线精修」（低风险保底）、
> variant-m「紧凑工作台」（密度推广全站）、variant-n「舒展分区」（大胆重排：深墨绿侧栏
> +三层底色+答案数字放大）；三稿已按用户要求移除手机端切换（手机端有单独项目）；
> 选型页默认 variant-l；纪要 review-meeting-20260929-round2.md。机器检查+质检内容基准
> 一致性均通过。**待办（设计）：用户从 L/M/N 选型后落地到 frontend/src（仅桌面端）**。
> 详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-29）：第二场布局评审会议 · L/M/N 三套（线上内容重排版）。内容基准＝
> tmp/live53000/ 线上 53000 实测（11 份 JSON+README，gitignore）+ views 源码；铁律＝菜单
> 保留左侧、只做排版样式、禁止外来叙事。产出 variant-l「贴线精修」（低风险保底）、
> variant-m「紧凑工作台」（密度推广全站）、variant-n「舒展分区」（大胆重排：深墨绿侧栏
> +三层底色+答案数字放大）；三稿已按用户要求移除手机端切换（手机端有单独项目）；
> 选型页默认 variant-l；纪要 review-meeting-20260929-round2.md。机器检查+质检内容基准
> 一致性均通过。**待办（设计）：用户从 L/M/N 选型后落地到 frontend/src（仅桌面端）**。
> 详见 `docs/HANDOFF.md` 顶部同日记录。

> 待办（设计）：用户从四个 Logo 方案（`design/logo/preview.html`）中选定后落地——重写
> `BrandMark.vue`（solid/inverse 同步）、替换 `public/favicon.svg`、中文字标换授权字体并
> 转曲线、补单色/反白版、登录页 hero 视方案调整；apple-touch-icon 遵循 ADR-052 默认不恢复。

> 已完成（2026-09-29）：**品牌 Logo 设计讨论会产出四方案设计稿**（`design/logo/`：8 个
> SVG + preview.html + MEETING.md 会议纪要）。四角色评审（设计师/产品经理/果农用户代表/
> 前端）；推荐方案三「榴莲切面占比环」为主标、方案四「顺仔徽章」为营销资产；SLD 字母
> 不进主标。未改任何代码，详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-29）：结算单列表**操作按钮被裁修复**——并行改动把操作列拆成两枚
> 按钮（自然宽 ~134px）超出 136px 列宽被裁；列宽 136→184px，全屏宽按钮零裁切，
> 宽屏铺满无滚动、窄屏（≤1440）回退滚动+冻结。307 test / typecheck / build 通过；
> 浏览器 6/6 + fit-width 复检 15/15（verify_element_plus 旧脚本 21/24，3 项 390px
> 移动检查在 ADR-052 后过时非回归）。详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-29，ADR-052）：**删除本站全部手机端功能**（手机端由独立移动版承担，
> 保留 index.html UA 跳转桥接）。删 styles-mobile.css/底部 tabbar/「更多」面板/
> DataTable 窄屏卡片回退/顺仔软键盘适配/各页 ≤820px 断点/apple-touch-icon；保留全部
> ≥860px 窄桌面断点与 821 侧栏收起。前端 307 test（-17 纯手机断言）/typecheck/build
> 通过；1920+1440 双宽度 12 页改前后截图像素比对零布局变化（差异仅时钟与吉祥物动画）。
> 详见 `docs/HANDOFF.md` 顶部同日记录。

> 待办（用户侧，手册收口时一并处理）：功能说明书/用户操作手册（md + docx）中关于
> 手机端底部导航、手机卡片视图、手机分区折叠的章节需同步删除/改写为「手机端跳转
> 独立移动版」（本轮按既有惯例未改 docx）。

> 已完成（2026-09-29）：销售对比页紧凑化——总览表单行居中紧凑（商号+单号、件数+占比条
> +占比单行，行高 42→34px）、等级独立对比卡内零横向滚动条（栅格
> `minmax(min(600px,100%),1fr)` 随分辨率自动增减列数）、DataTable 新增 `center` 对齐与
> `compact` 模式并修复插槽列被 EP 弹性分配挤压截断（doLayout 后 + 有界延迟复测）、对比
> 筛选栏改自适应模板修 900 档日期占位符切字（编辑器 158→374px）。前端 324 test /
> typecheck / build 通过；浏览器 22/22 + 视觉验收 agent 两轮全过。详见 `docs/HANDOFF.md`
> 顶部同日记录。

> 已完成（2026-09-29）：结算单列表**列宽自适应**——DataTable 新增 fitWidth（opt-in）：
> 内容超宽时按「理想宽→表头下限（克隆表头实测）」平方加权压缩恰好铺满容器，被压单元
> 格省略号+悬浮提示；表头也放不下（≤1280）才回退滚动+冻结列；分配算法抽
> `utils/tableColumnFit.ts` 纯函数。列表页启用 fit-width，操作列 176→136px。前端 324
> test / typecheck / build 通过；浏览器 16/16（1920/1600/1440 铺满溢出 0、1280 回退）
> + 回归 24/24。详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-29）：手机浏览器整站跳转独立移动版。`index.html` `<head>` 内联
> 脚本 UA 识别（Android/iPhone/iPad/iPod/HarmonyOS/Mobile）→ `location.replace`
> 跳 `http://8.134.219.84:54001/`，`?desktop=1` 逃生口；新增
> `mobile-redirect.test.mjs` 5 项。前端 314 test / typecheck / build 通过；真实浏览器
> 5/5。详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-29）：结算单列表**恢复操作列冻结**（用户要求，推翻同日早前「去冻结
> 对齐 admin」的决定）——操作列 `fixed: 'right'`，横向滚动时操作按钮钉在面板右缘，
> EP 原生滚动阴影分隔。前端 309 test / typecheck / build 通过；浏览器 7/7 +
> element-plus 回归 24/24。详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-29）：结算单列表对齐 admin 用户管理形态——删除「销售日期」列、
> 操作列去掉冻结（不再遮挡任何列，超宽整体横向滚动）、列宽自适应防蠕动（仅溢出采信
> DOM 测量 + canvas 裕量 1.12/下限 80），零截断稳定。前端 309 test / typecheck /
> build 通过；浏览器 13/13 + 24/24。详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-29）：布局设计评审会议 · 三套新方案（dynamic workflow 多智能体：
> 主持人开题 12 痛点 → UI/UX/PM 三方两轮交锋 53 条意见 → 收敛三套任务书 → 设计师落地
> +机器检查+质检回修）。产出 `redesign-20260929/`：variant-i「掌柜账单」（微信账单
> 心智·大数字少层级·果农友好）、variant-j「打印台账」（全边框密表·黑白可对账）、
> variant-k「图表报告」（三段式·自带基准·专业高效），均五屏+双端+真实数据；
> 会议纪要 review-meeting-20260929.md；选型页默认切到方案I。**待用户选型**（I/J/K
> 或与 A–H 杂交）后再展开全页面与落地。详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-29）：查看明细改页签展示 + 销售明细聚合。/import-review 去 modal
> meta、ShellTab 支持自定义标题（查看明细/导入确认）、ImportReviewView 遮罩弹窗改
> 普通页面；只读销售明细按「同日/同品种/同等级/同头数/同KG/同单价/同备注」聚合
> （utils/salesAggregation.ts，与后端导出 _merge_sales_rows 同规则，52 行 → 32 行，
> 文件行显示 13~15 区间）；列宽测量加防蠕动护栏（仅溢出时采信 DOM 测量）+
> doLayout 重排。前端 309 test / typecheck / build 通过；浏览器 13/13 + 24/24。
> 详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-29）：结算单操作列合并 + 只读回填黑字。「查看明细」并入操作下拉
> （操作 ▾：查看明细/Excel/PDF，列宽 176px）；查看明细只读页回填数据全局改墨色黑字
> （覆盖 EP 禁用态 text-fill-color）。前端 304 test / typecheck / build 通过；
> 浏览器 13/13 + 只读页颜色探针。详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-29）：结算单列表三项修复——行内导出改 ElDropdown（修「点不动」：
> 子菜单曾被单元格 overflow hidden 裁掉）、fillHeight + fixed-height-list 撑满面板
> （分页条钉底）、横向滚动条常驻可拖 + fit 纳入表头测量（表头零截断）。前端 304
> test / typecheck / build 通过；浏览器 13/13 + 全页面回归 24/24。详见
> `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-29）：「卖得怎么样」规格件数与均价表新增**品牌/等级筛选**（仅
> overview 版式，聚合前过滤、小计/合计/占比随筛选重算；详情页不受影响）；「每日
> 销售金额」确认现状即折线图未改。前端 303 test/typecheck/build 通过；Playwright
> 实测品牌/等级/叠加/重置与详情页隔离全部通过。
> 详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-29）：结算单列表 ElTable 化后的换行/留白/截断修复。单元格默认
> nowrap、列宽改为「canvas 估算 + 挂载后读 scrollWidth 二次校准（rAF 重试 + fitEpoch
> 重建）」、操作列 288px + fixed right、受控排序态 header-cell-class-name 上色。前端
> 302 test / typecheck / build 通过；浏览器 9/9 + 全页面回归 24/24。14 列内容总宽
> 约 2100px，宽屏仍有少量表内横向滚动（与管理端行为一致）。详见 `docs/HANDOFF.md`
> 顶部同日记录。

> 已完成（2026-09-29）：布局重设计 **方案H · 系统图表版** demo——
> `dev-preview/redesign-20260929/variant-h.html`：方案A 侧栏精修骨架 + 系统同款
> ECharts 图表（GradePieChart 环图 / DailySalesTrendChart 灰调折线带金额件数切换 /
> MarketSalesAnalysis 市场环图+品牌柱 / SettlementDailyPriceChart 柱线双轴 /
> SettlementGradeBreakdown 规格七列表全量 56 组），数据 53000 实测；SSR 渲染验证
> 6 图全过。详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-29）：**移除「品牌对比」页「按等级号别」视图**——删切换按钮与
> grade 面板、删除 SeriesGradeDetail / GradeDetailAiAnalysis 组件与 gradeDetails
> 前端数据链路（types/normalize/client/utils）及 grade-detail.test.ts；后端接口
> 按规则保留未动。前端 302 test 中 301 过（1 失败＝并行在途）、typecheck/build
> 通过；Playwright 验证无按钮、品牌视图直接渲染。详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-29）：「品牌对比 · 等级均价对比」横轴标签完整显示——
> `overflow: 'truncate', width: 90` 改 `overflow: 'break', width: 150`（放不下换行、
> 不截断成「…」；全站唯一 truncate 用点）。前端 305 test/typecheck/build 通过；
> Playwright 用单号最长的三张单实测完整显示无省略号。
> 详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-29）：用户端自研 UI 组件全量替换 Element Plus。弹窗×4→ElDialog、
> 局部 toast×2→ElMessage、原生 select→ElSelect、分页→ElPagination、表单输入→
> ElInput/ElCheckbox/ElDatePicker、SettlementPicker→ElDrawer、DataTable 内部→ElTable
> （对外 API 不变；窄屏卡片/data-label 模式保留手写表格回退）；全局 ElConfigProvider +
> styles-element.css 主题令牌。前端 304 test / typecheck / build 通过，dist 已重建；
> Playwright 24/24 + AI 视觉验收通过（截图 `tmp/element-plus/`）。admin 端 DataTable
> 拷贝未同步、两端自此分叉。详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-29）：每日销售折线图（金额/件数）补 Y 轴——浅色刻度 + 万级缩写标签，
> 两个模式共用。前端 303 项 test、typecheck、build 通过，dist 已重建。
> 详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-29）：结算单导出（xlsx/PDF）销售明细同键行合并（同一天+同规格头数+
> 同 KG+同单价，品种/等级/备注一致才并），数量与金额汇总、合计不变。真实单 650 52→32 行、
> 单653 46→22 行。详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-29）：「品牌对比 · 等级均价对比」Y 轴不再从 0 开始——按数据
> 最小/最大各放宽 15% 后取整到 5 的倍数（下限不越过 0）。前端 303
> test/typecheck/build 通过；Playwright 实测 Y 轴 190~290 与预期一致。
> 详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-29）：「卖得怎么样」区块标题「等级销售分析」改名「销售分析」（仅
> `OverviewView.vue` title prop + 测试断言）。前端 303 项 test、typecheck、build 通过。
> 详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-29）：清理区块标题下的静态辅助说明（section-note 类，9 个稳定文件）；
> 状态类提示（加载/空态/计数/notice）与样式保留；4 个并行在途文件的同类说明由该会话清理。
> 前端 302 项 test、typecheck、build 通过。详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-29）：「卖得怎么样」每日销售金额标题加稳定 id
> `daily-sales-trend-title`（根容器 aria-labelledby + h3 id，同
> settlement-grade-breakdown-title 约定，不随金额/件数切换变化）；同步并行会话的
> overview-filters 断言。前端 302 test/typecheck/build 通过；Playwright 实测 id 与
> 接线生效。详见 `docs/HANDOFF.md` 顶部同日记录。

## 进行中

> 已完成（2026-09-29）：「品牌对比 · 等级均价对比」换成**柱线双轴组合图、折线黑色**
> （demo 方案B 落地）：柱=件数（左轴、等级色）+ 黑色折线=每件均价（右轴、15% 放宽
> 不从 0）；图例 4 项、悬浮给 件数+均价；移动端两轮修复标签叠压（标签列宽 64 +
> grid 边距 6，仍换行不截断）。前端 302 test/typecheck/build 通过；Playwright 9/9
> （像素断言+提示数值与库一致）+ 视觉验收双端通过，截图 `tmp/series-price-combo/`。
> 详见 `docs/HANDOFF.md` 顶部同日记录。

- [ ] 「品牌对比 · 等级独立对比」图表化：评估 demo 已出并切换**真实库数据**
  （`frontend/dev-preview/grade-tables-chart-demo.html`，推荐 A 分面小图：柱=件数 +
  折线=每件均价），**待用户在 A/B/C 三方案中拍板**后替换 `SeriesGradeTables.vue`
  表格主体（原表折叠进「查看数据表」；「其他」等级建议与均价图一致隐藏）。

> 已完成（2026-09-29）：demo 方案B 加均价折线——分组柱改双轴（柱=件数左轴 + 同色
> 折线=均价右轴，系列名「A果·件数/均价」），y 轴去轴名避免与图例叠压；Playwright +
> 视觉验收双页通过（折线数值逐点与真实库一致）。详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-29）：图表化 demo 数据切换**真实库**——`grade-tables-chart-demo.data.js`
> （本地不入库，已加 .gitignore）由 `tmp/grade-tables-chart-demo/gen_data.py` 直连
> get_series_comparison 生成（香香全部 14 单，等级仅 A/B 无 C，其他占 0.2% 剔除）；
> 三方案全部真实数据，>8 单 x 标签斜排、提示给适配单号+日期+真实占比。node --check +
> URL 200 + Playwright 双端 + 视觉验收（y 轴名改短名「元/件」）双页通过，截图
> `tmp/grade-tables-chart-demo/`。详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-29）：「品牌对比 · 等级独立对比（grade-tables）」图表化评估 demo——
> 三方案静态稿（A 分面小图 推荐 / B 分组柱状 / C 量价散点，同份虚构数据可对照，
> A 支持统一/各自刻度切换）；已登记 dev-preview/README；node --check + 4 URL 200 +
> Playwright 双端渲染 + 视觉验收三轮修复后双页通过，截图 `tmp/grade-tables-chart-demo/`。
> 详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-29）：导出等待遮罩收口——「每一单」导出 xlsx/PDF 期间整个结算单列表盖
> 遮罩防重复点击，「销售详情」导出模板整页内容盖同款遮罩；其余等待点（导入遮罩/问题明细
> 下载/查询骨架屏）排查后已达标。前端 301 项 test、typecheck、build 通过，dist 已重建。
> 详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-29）：按日均价走势图改为**柱线组合（量+价）**——浅色圆角柱=当日
> 件数（左轴），平滑折线+圆点+价格标注=每件均价（右轴）；tooltip 同给两值，面积渐变
> 移除，标题/单行说明/等高对齐不变。前端 300 test/typecheck/build 通过；Playwright
> 验证全过（柱高比与线点价与库内一致）。详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-29）：「市场销售分析」块移到「等级销售分析」上方（页面顺序：销售情况 →
> 市场销售分析 → 等级销售分析）。仅模板调序，数据流不变；前端 300 项 test、typecheck、
> build 通过。详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-29）：每日销售折线图增加「金额 / 件数」切换（右上角分段按钮，件数画
> salesQuantity、标题/悬停/aria 联动），组件改名 DailySalesTrendChart.vue。前端 300 项
> test、typecheck、build 通过。详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-29）：按日均价走势图换样式（平滑曲线+渐变面积填充）+ 提示语压成
> 固定一行（多天=口径 / 单天=「本单销售集中在 1 天」），与右侧规格表标题区精确对齐
> （底边差 0px）。前端 300 test/typecheck/build 通过；Playwright 单行/对齐/无溢出
> 验证通过。详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-29）：结算单导出 xlsx 与 PDF 加「顺立达SLD」斜向半透明水印（28°、
> 浅灰绿、PDF 每页中央约 42% 页宽 / xlsx 表格中央 PNG 嵌入）。后端 15 项 test 通过 +
> 视觉验收 + 在线 单GZ-003 双格式 200；8000 已重启。详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-29）：「卖得怎么样」等级销售分析第一行新增每日销售金额折线图（与饼图
> 同行，参考稿样式：灰调平滑线+面积渐变+隐 Y 轴+末点空心圆），数据走 trend 接口独立
> loading/error，经 overview-aside 插槽挂入。前端 300 项 test、typecheck、build 通过，
> dist 已重建。详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-29）：销售日期筛选改「快捷下拉 + 常驻日历」。`DateRangeFilter`
> 单个快捷下拉（自定义时间 / 近七天 / 近十四天 / 近三十天 / 近九十天 / 按年度组 /
> 按月度组）+ 右侧日历常驻，选中快捷选项自动填充起止并触发查询；起止匹配边界时
> 下拉回显、手动改日历回自定义；对外契约不变、四页零改动。前端 299 test /
> typecheck / build 通过，dist 已重建；Playwright 12/12 + AI 视觉验收通过。
> 详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-29）：「销售详情」按日均价走势/规格表同行与上方「销售表现」的
> 间隔拉开（`detail-row-layout` 加 margin-top 24px；面板内区块分隔线被清零是贴死
> 根因）。前端 299 test/typecheck/build 通过；Playwright 实测间距 24px、移动端无
> 溢出。详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-29）：按日均价走势图**随规格表等高撑满**（用户反馈同行布局下 250px
> 太矮）——图容器 flex 拉伸 + `height="100%"`（ResizeObserver 跟随），`detail-row-layout`
> 改 stretch；≤1079px 单列/移动端回落 280px 兜底。Playwright 5/5（长表 662px 等高、
> 短表跟随、单列 280、无溢出）；前端 295 test/typecheck/build 通过。
> 详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-29）：结算单导出 xlsx 与 PDF 内容全部居中（区块标题、售后内容/摘要、
> 费用名、各合计与应付金额，由左/右对齐改居中）。仅 `entry_export.py` 双渲染器对齐调整；
> 后端 408 过（11 失败为既有基线）、xlsx 在线逐格全居中、PDF 视觉验收通过、8000 已重启。
> 详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-29）：侧边导航升级为管理端目录驱动的**两级菜单**（销售单管理 /
> 销售分析分组，卖得怎么样独立一级）。后端 `SidebarMenuRead` 扩 `id/parent_id/
> menu_type` 且目录随 `/api/auth/me` 下发；前端 `buildMenuGroups()` + `AppShell`
> 两级侧栏与移动端分组「更多」面板。后端仅存量 3 失败（并行在途、与本改动无关）、
> 前端 293 test / typecheck / build 通过，三角色真实浏览器验证通过。ADR-051 见
> `docs/DECISIONS.md`。详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-29）：「销售详情」按日均价走势与规格件数与均价**同行排版**——
> `.detail-row-layout` 栅格（图左窄 .6fr / 表右宽 1.4fr、顶部对齐），≤1079px 回落
> 单列。前端 295 项 test、typecheck、build 通过，dist 已重建；Playwright 1440/1079/
> 390 三断点验证通过（截图 `tmp/daily-price-chart/`）。另排查留档：1440px 存在
> 1px 全站既有横向溢出（wechat-qr-popover / sr-only，与本次无关，未处理）。
> 详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-29）：「品牌对比」等级均价对比图不再显示「其他」等级。
> `SeriesGradePriceChart.vue` gradeOrder 过滤 OTHER（折线+图例同步，悬浮提示随
> series 自动同步）；总览表「其他」列保留不动。新增
> `frontend/tests/series-grade-price-chart.test.mjs` 2 项回归断言。前端 295 项
> test、typecheck、build 通过，dist 已重建。详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-28）：「销售详情」新增按日均价走势折线图（用户从 6 图评估稿中只保留
> 此一张）。新组件 `SettlementDailyPriceChart.vue`（DeferredEChart 异步分片），数据由
> 详情 `records` 前端按销售日期聚合（每件均价=当日金额÷当日件数，跟随上方等级筛选），
> 区块插在「销售表现」与「规格件数与均价」之间、标题带单号前缀，单日单提示「本单销售
> 集中在 1 天」；纯前端改动，无后端/依赖变化。前端 293 项 test 中与本改动相关的全部
> 通过（3 项 shell-menu 失败属并行会话在途）、typecheck、build 通过、dist 已重建；
> Playwright 真实浏览器 9/9 通过（含数值与库内一致），截图 `tmp/daily-price-chart/`。
> 详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-28）：修复「每一单」导出 PDF 报错。根因＝环境重建后无 LibreOffice；
> 按用户指示改为 PIL 渲染图片→PDF（`render_entry_pdf`，A4 横向分页 + 表头重画），删除
> LibreOffice 路径；本机装 `google-noto-cjk-fonts`、镜像 Dockerfile 加 `fonts-noto-cjk`、
> `pyproject` 声明 pillow。后端 408 过（11 失败为既有基线）；8000 已重启，在线 PDF 200 +
> AI 视觉验收通过。ADR-050 见 `docs/DECISIONS.md`。详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-28）：修复销售详情「国家 未登记 / 未识别品牌」。详情接口补返回
> `country` 与 `brand`（batch_brand 口径），前端类型/normalize 同步，规格表品牌列优先用
> 整单品牌；后端 31 项 + 前端 287 项 test/typecheck/build 通过，8000 已重启，真实库直查
> 单650=越南/香香、单653=越南/晴牌。详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-28）：「品牌对比」页四组调整——总览表删「每件均价」「销售日期」列与
> 合计行、各等级件数/占比合并为一列（件数+占比条+百分比）；「等级均价对比」改折线图
> （横轴=结算单、每等级一条线）；「等级件数占比」图删除；AI 分析结论改用适配后单号
> 称呼（香香-001，提示词 v11 + 数据包「称呼」字段）。前端 287 test/typecheck/build、
> 后端 33 项、Playwright 16/16、真实 DeepSeek 调用均通过。
> 详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-28）：「销售详情」页面再调整五项——settlement-banner 删除（商号收进
> 基础信息条第一位、手工录单按钮改为信息条下方操作行）、经营指标条移到「销售表现」标题
> 正下方（GradeSummary after-heading 插槽）、删除等级件数结构饼图与等级均价图、规格件数
> 与均价改用与卖得怎么样同一张七列居中表格（品牌/等级/头数/KG/备注/总件数/每件均价）、
> 区块标题「等级图表」改「规格件数与均价」。前端 287 项 test、typecheck、build 通过。
> 详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-28）：「卖得怎么样」规格件数与均价表按件数降序——类别（品牌×等级）按
> 小计件数、类别内行按总件数从多到少排，同件数回退原字典序。仅
> `SettlementGradeBreakdown.vue` 排序逻辑；前端 287 项 test、typecheck、build 通过。
> 详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-28）：「销售详情」页筛选栏「销售日期」移到第一位（销售日期 → 品牌 → 商号）。
> 仅 `SettlementView.vue` 模板内元素顺序调整；前端 287 项 test、typecheck、build 通过。
> 详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-28）：「每一单」页筛选栏「销售日期」移到第一位（销售日期 → 商号 → 品牌）。
> 仅 `SettlementListView.vue` 模板内元素顺序调整；前端 287 项 test、typecheck、build 通过。
> 详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-28）：修复「各品牌分市场柜数对比」tooltip 与图例颜色。市场色由数据级
> itemStyle 提升到系列级（tooltip marker / 图例只认系列颜色），补防回归断言；前端 287 项
> test、typecheck、build 通过，dist 已重建。详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-28）：环境修复 + 全量验证 + checkpoint 提交。重装 git（本机二进制丢失）；
> `.venv` 断链修复（重链系统 python3.11 + 重建 pyvenv.cfg，依赖无需重装）；前端验证改用
> ZCode node v22.16.0。修复 2 项 spec_kg 过期断言（13→11 失败）；前端 287 test /
> typecheck / build 通过；后端 406 过 / 1 skip / 11 失败均为既有基线。`.gitignore` 收口
> 本地运行产物与真实数据演示（tmp/、demo-*、截图、镜像 tar、.env.docker 等）后，
> 将 2026-09-28 全部在途改动 checkpoint 提交。详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-28）：结算单导出按用户实测反馈二次修改 + PDF 改为 xlsx 直转。信息行
> 两行×4 字段跨列自适应（单号不换行）、表格列收窄（备注 4 汉字宽、表头可两行）且内容
> 全居中、灰色字体全改墨色、售后/费用/货款/应付对齐 I 列、总件数标签居右去重数字、
> 删除脚注与生成时间行、应付标签居右金额紧邻；PDF 不再单独渲染（删 fpdf2），由 xlsx 经
> LibreOffice 另存（部署机需装 LibreOffice）。相关 pytest 通过、视觉评审两轮通过、在线
> xlsx/PDF 均 200。详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-28）：新增「市场销售分析」块（卖得怎么样·等级销售分析下方）。跟随市场
> 筛选：全部市场时同一图表分市场对比（市场占比饼图+品牌×市场分组柱图），单市场时按参考稿
> 样式（{期间} {市场}档口销售柜数统计（合计 N 柜），品牌饼图+柱图、柱顶数量标签、Y 轴柜数）；
> 旧「销售柜数统计」移除统一到新块，等级销售分析改为饼图独占行+规格长表全宽。
> `grade-breakdown` 返回 `market_brand_containers`。前端 287 项 test、typecheck、build 通过；
> 后端 31 项通过；8000 已重启；Playwright 13/13 + AI 视觉验收通过。交付文档按指示未更新。
> 详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-28）：「结算单详情」页面九项调整（菜单改名「销售详情」、区块标题带单号
> 前缀、等级表现→销售表现、删趋势图/同期均价对比/需要关注/查看结算与明细抽屉、6 项经营指标
> 挪入销售表现区并隐藏总柜数/销售金额汇总条、单号后加国家）。前端 286 项 test、typecheck、
> build 通过，dist 已重建；Playwright 15/15 项验证通过；DB `admin_menu` 菜单名已同步 UPDATE。
> 详见 `docs/HANDOFF.md` 顶部同日记录。

> 待办（2026-09-28，按用户既有指示延后）：手册 md/docx 尚未同步「销售详情」菜单名（12 处）
> 与第 9 章已删区块描述（每日趋势 / 销售明细与来源追溯 / 13.6 来源追溯），功能说明书 API 表
> 该页已不再调用 trend；待手册统一收口时处理（手册另有并行会话在途修改）。

> 已完成（2026-09-28）：「规格件数与均价」按用户选定的 demo 方案A 落地到「卖得怎么样」。
> 一行 = 等级+规格+备注（相同组合合并统计），五列表格（等级徽章/规格/备注胶囊/总件数+
> 占比条/每件均价）+ 等级小计 + 底部合计（加权均价）；布局重排为 饼图+销售柜数统计同排、
> 规格长表独占下一行全宽；移动端顺序 饼图→柜数→表格。结算单详情页保持原样。
> 前端 284 项 test、typecheck、build 通过；Playwright 数据逐项核对与库一致、AI 视觉验收通过。
> 交付文档按用户指示未更新。选型 demo 仍在 54004 供对照。详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-28）：「卖得怎么样」销售日期默认「自定义时间」+ 预填当年起止。
> `DateRangeFilter` 新增 `autoMatchMode` 开关（默认开，保持日期=年/月边界自动回显方式），
> 仅 Overview 关闭：方式默认停在自定义、挂载预填当年 1-1 ~ 12-31；其余三页回显行为不变。
> 前端 284 项 test、typecheck、build 通过，dist 已重建；Playwright 真实浏览器 6/6 项验证
> 通过（含切按年度/切回自定义交互）。详见 `docs/HANDOFF.md` 顶部同日记录。

> 进行中（2026-09-28，待用户选型）：「规格件数与均价」展示方式重构。口径已定：一行 =
> 等级+规格+备注，每行单独统计总件数与每件均价。Demo 已挂出（demo-spec-table/，54004 端口），
> 三个方案：A 增强版（徽章+占比条+小计合计，推荐）/ B 极简还原 / C 加占比列。用户选定后
> 落地到「卖得怎么样」页（结算单详情不动）。详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-28）：销售日期下拉宽度固定 + 每一单删除统计周期。年/月下拉改为吃满
> 剩余行宽，与自定义日期框同宽，切选项/切方式输入框长度恒定（组件级修复，四个时间筛选页
> 一并生效）；「每一单」的统计周期下拉（本月/本季度/本年/上月/上季度/去年）整体移除。
> 前端 283 项 test、typecheck、build 通过；Playwright 实测四页宽度逐像素恒定、移动端无溢出。
> 按用户指示交付文档未更新。详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-28）：结算单导出模板改版（每一单行导出 Excel/PDF 与手工录单导出）。
> 基本信息改为一字段一单元格（商号｜单号｜国家｜市场｜到达日期｜来货数量｜柜号｜转运
> 公司），文本居中、微软雅黑统一、合并格逐格补边框、列宽按内容自适应收紧空白；PDF 同步
> 并修复中文字体路径回落。后端 417 项 pytest 相关全过（11 项失败均既有）；在线导出冒烟
> 200；PDF 视觉评审 7/7。详见 `docs/HANDOFF.md` 顶部同日记录与 Test Status。

> 已完成（2026-09-28）：卖得怎么样追加改版 + 时间筛选三方式。① 销售情况区块移除等级卡片
> （仅总览，详情页不变）；② 规格表备注含重复逐条平铺；③ 等级件数结构饼图加大、列占比收窄；
> ④ 卖得怎么样默认展示今年；⑤ DateRangeFilter 重构为按年度/按月度/自定义时间并推广到
> 四个时间筛选页（无需数据库改动）。顺手修复 normalizeFilterOptions 丢失年/月选项的 bug
> 与移动端下拉撑满溢出。按用户指示本轮不更新交付文档（docs md 待统一补写）。
> 前端 281 项 test、typecheck、build 通过；Playwright 全项验证通过。
> 详见 `docs/HANDOFF.md` 顶部同日记录。

> 待办（用户侧）：功能说明书/用户操作手册（md + docx）及 DECISIONS/ARCHITECTURE 中
> 关于「销售情况移除等级卡片、备注平铺口径、饼图加大、默认今年、时间筛选三方式」的
> 描述由用户后续统一补写（本轮按指示未写）。

> 已完成（2026-09-28，ADR-049）：「卖得怎么样」页面改版。区块改名「销售情况」/
> 「等级销售分析」、删「等级均价」图、等级项不展示 AB/OTHER（总量仍全量）、筛选商号→
> 国家+新增市场、规格表与饼图同行并新增备注列（一致才显示）、新增「销售柜数统计」
> （品牌柜数饼图+柱图，柱顶标数量；柜数=按品牌统计结算单数）。结算单详情页共用组件
> 以 variant 区分、保持原样。顺手修复在途快捷年月 filter-options 被默认窗口截断的问题。
> 前端 277 项 test、typecheck、build 通过；后端相关 58 项 pytest 通过；8000 已重启，
> Playwright 24/24 通过（截图 `tmp/overview-redesign/`）。详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-28，ADR-048）：录单/导单「销售数量合计不得超过来货数量」校验。导单
> 二次确认页与手工录单页在合计超出时标红来货数量字段与总件数并红字提示；导入确认为
> 硬阻断（force 也提交不了），录单前后端均拦截（422 + toast）。后端 414 项 pytest 中
> 本次相关全部通过（12 项失败均既有/在途，stash 对照确认）；前端 275 项 test 274 过
> （1 项属并行在途改动）、typecheck、build 通过；Playwright 端到端 12/12 通过。详见
> `docs/HANDOFF.md` 顶部同日记录与 Test Status。

> 已完成（2026-09-28）：全站下拉筛选输入框点击（聚焦）时隐藏提示语。`SearchableSelect`
> 覆盖的 6 处筛选下拉（商号/品牌/排序）聚焦时提示语置空、失焦恢复，已选值展示不受影响；
> 品牌对比选择器三个搜索框聚焦时提示语透明。原生 `<select>` 无提示语、日期选择器非下拉框，
> 均不适用未改。前端 275 项 test、typecheck、build 通过，dist 已重建；Playwright 真实浏览器
> （桌面 + 390px 移动端）8/8 项验证通过。详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-28，ADR-047）：品牌对比放开结算单勾选张数上限。前端选择器移除
> 6 张上限（max 属性、到限禁用、上限提示、全选截断全部取消），后端 `GET /series-comparison`
> 与两个 AI 分析接口、顺仔问答 `compare_settlements` 的 6 张 422 拦截同步移除；
> 「至少 2 张」「同品牌」校验保留。前端 typecheck / build 通过、275 项 test 中 274 过
> （1 失败属「快捷年月筛选」在途任务）；后端相关用例全部通过（全量套件既有漂移失败
> 与本次无关，详见 `docs/HANDOFF.md` 同日记录）。

> 已完成（2026-09-28）：「总销量」页面字面统一为「总柜数」。仅改字面（`GradeSummary.vue`
> 汇总条标签与 tooltip 注释 + 用户操作手册/功能说明书 md、docx），数值与全部逻辑不变；
> 前端 274 项 test、typecheck、build 通过，53000 已更新。详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-29，ADR-053）：「总柜数」口径拍板为**结算单数**（`container_count`，
> 与单量/市场销售分析柜数/趋势接口一致，一柜两单不去重柜号）。overview `total` 新增
> `container_count`，前端「销售情况」总柜数改显该值（不再显示件数合计）；GradeSummary
> 占比注释更正为「÷ 总件数」。详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-28）：demo 升级为可交互多页版。新增共享 `app.js`/`assets.css`，三个桌面
> 方案页菜单全部可点击切换 8 个真实数据内容页（含结算单详情经营结果、650 vs 651 对比、品牌
> 聚合、导入记录），看板补均价走势 / 品牌占比 / 明细抽样；移动端底栏可切换。Playwright 点击
> 流测试通过。业务代码零改动。详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-28）：demo 对接真实数据。新增 `tmp/fill_demo_data.py` 直连业务库取数
> 填充 demo 插槽（KPI/柱图/等级占比/每一单 8 行/门户问候/登录统计），可重复执行刷新；
> demo 服务由 54003 改挂 54002（公网可访问）。业务代码零改动。详见
> `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-28）：菜单布局重设计 Demo 交付（待用户选型后实施）。为系统全部菜单
> （7 项主导航/更多 + 欢迎访问 + 游客门户 + 移动端导航）制作 3 个桌面方案（A 侧栏精修 /
> B 顶部导航 / C 门户卡片）与移动端 2 案（M1 三入口+更多 / M2 五格常驻），产物为纯静态
> HTML `demo-menu-redesign/` + Playwright 截图 `screens/`，AI 视觉验收两轮通过。业务代码
> 零改动。详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-28）：修复本地启动环境。`.venv` 解释器符号链接失效（原 miniconda
> python3.11 已不存在），用 uv 安装独立 CPython 3.11.16 并重链 `.venv/bin/python3`，
> 依赖无需重装；本机无 Nginx，`./start.sh` 以 `FRONTEND_MODE=dev` 启动，前后端分别
> 监听 8000 / 53000。未改动代码。详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-27）：新增《SLD-水果市场销售分析-录单人操作手册》（md + docx）。面向一线
> 财务录单人员，聚焦上传导入、二次确认、重复商号覆盖、导入记录问题处理、手工录单、录后自查
> 六大场景；附录含字段填写速查表与口径依据（ADR-043/044/045/046）。docx 由脚本从 md 生成，
> 含真实目录域（打开时更新域即可生成页码）。未改动任何代码；文档口径依据当日 `frontend/src/
> views`（ImportView / ImportReviewView / EntryView / main.ts 路由）与 `docs/DECISIONS.md`
> 实测核对。验证：docx postcheck 9/9 通过。

> 已完成（2026-09-25）：结算单列表改用 admin 用户管理列表同款形态。复用同源 `DataTable`，
> 改为 `fixed-height-list` + `min-width="880px"`，行内操作改用 `.table-action` 边框按钮；
> 列宽随分辨率自适应，超宽时内部滚动。响应式修复：`DataTable.vue` 与结算单页容器补
> `grid-template-columns: minmax(0, 1fr)`，修复 grid 子项不收缩导致的换行 / 飞出单元格 /
> 列表填不满等问题；并对齐 admin 端语义：单元格默认 `white-space: nowrap`，长文本列用 `wrap`
> 显式折行，结算单操作列 `flex-wrap: nowrap`，解决缩放时内容 / 按钮换行。
> 前端全量 274 项 test、`typecheck`、`build` 均通过。
> 详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-25）：交接文档收口。`docs/HANDOFF.md` 将 3 条已完成的 2026-09-24 项
> 从 `## In Progress` 移除并改为 `## Completed` 勾选项；本文件补齐「国家/等级序列化丢失修复」的已完成留档。仅文档校正，未改代码。
> 详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-25）：导入二次确认问题行底色加深。`.row-invalid` 底色由 `#fff1f0`
> 调深为 `#ffd9d6`，内描边同步调深；问题行/单元格判定逻辑抽为
> `frontend/src/utils/importReviewIssues.ts`，并新增模拟 issue 数据的边界测试
> `frontend/tests/import-review-issues.test.ts`。前端全量 273 项 test、`typecheck`、
> `build` 均通过。详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-24）：导入记录操作按钮排版修复。「查看问题 / 确认无误 / 下载问题明细」
> 三按钮由 `.batch-row` 第 4 个 `auto` 列改为独占整行，三列网格承载文件信息 / 状态徽标 /
> 统计，`flex-wrap: nowrap` + 按钮 `white-space: nowrap` 保证单行不换行；`.batch-error`
> 同样独占整行。前端 typecheck 与 build 均通过。详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-24，ADR-046）：销售明细两种通过规则。正常单：销售日期、品种、等级、头数、
> KG、数量、单价 7 项均非空；异常单：销售日期、品种、备注、数量、单价 5 项有值，且等级/头数/
> KG 必须为空，等级入库记 OTHER（“其他”）。判定优先级：等级/头数/KG 任一项非空即按正常单，
> 备注仅作说明；三者全空且备注非空才按异常单。不满足逐字段报错，二次确认页高亮并禁用强制提交，
> 确认弹窗以表格列出未通过行。验证见 `docs/HANDOFF.md` Test Status「销售明细两种通过规则」。

> 已完成（2026-09-24，ADR-045）：等级列不向上继承。`settlement_template.py` 移除等级向下
> 填充，空等级保持空；`variety` 继续向下填充。正常销售行等级为空时报 `missing_field`
> （`field=grade`），二次确认页高亮等级列并由 `hard_blockers` 阻断强制提交。
> 验证见 `docs/HANDOFF.md` Test Status「等级列不向上继承」。

> 已完成（2026-09-24，ADR-044）：销售数量必填且不得自动补 0。前端录入草稿 `salesQuantity`
> 改为 `number | ''`，空行默认值由 0 改为空字符串；`entryPayloadBody` 序列化保留空值；
> 归一化不再把空数量回填 0。后端解析器空数量生成 `""` 而非 `"0"`，汇总使用安全解析。
> 空数量仍由 `invalid_quantity` 与 schema `gt=0` 拦阻，不给强制提交。验证见
> `docs/HANDOFF.md` Test Status「销售数量必填且不得自动补 0」。

> 已完成（2026-09-24）：销售明细两条提交规则。每行销售数据满足其一才可提交：① 完整明细行：
> 销售日期、品种、等级、头数、KG、数量、单价全部填写；② 备注行：备注、数量填写（单价不填
> 默认 0）。不满足任一规则 → 报错，二次确认页按字段高亮，且不允许带错强制提交
> （`confirm_import_job` 新增 `hard_blockers`，force 也拦）。保留头数/KG 格式校验与金额差异
> warning；品种/等级向下填充沿用解析器既有逻辑。另：规格（KG）改为只允许单个数值，区间写法
> （如 9/10）在 schema / 手工录单 / 导入校验三处拒绝，占位文案去掉 9/10 示例。
> 口径见 `docs/DECISIONS.md` ADR-042 / ADR-043，验证见 `docs/HANDOFF.md` 最新 Test Status。

> 已完成（2026-09-24）：导入二次确认「国家 / 等级」字段序列化丢失修复。
> `frontend/src/api/client.ts` 的 `entryPayloadBody` 补齐顶层 `country` 与销售行
> `grade` 序列化，避免保存/提交后国家与等级被清空；数量校验文案改为「销售数量必填」。
> 前端 typecheck / test / build 通过，后端已重启；新增
> `frontend/tests/client-entry-payload.test.mjs` 防回归。详见 `docs/HANDOFF.md` 顶部同日记录。

> 已完成（2026-09-24）：日期筛选恢复「单选择器」。`DateRangeFilter` 由两个原生
> `input[type=date]` 改回单个 `ElDatePicker type="daterange"`，一个选择器同时选择开始与
> 结束；对外 `v-model:start-date / end-date` 契约不变，五个业务页无需改动。
> 同步更新 `frontend/tests/date-range-filter.test.ts` 与架构文档；Element Plus 共享分片
> 回升至约 256.51 KB / gzip 83.02 kB。验证：前端 263 项测试、typecheck、build 均通过。

> 已完成（2026-09-24）：结算单新模板「国家 / 品种 / 等级」字段链路改造。后端新增
> `import_batch.country`、`sale_record.variety`（`grade_raw` 继续存等级原文），解析器、
> schema、手工录单、导入二次确认、结算单导出（XLSX/HTML/PDF）与列表明细导出同步扩展；
> 历史数据迁移脚本 `backend/scripts/add_country_variety_schema.py`（回填国家=越南、品种=金枕）。
> 口径见 `docs/DECISIONS.md` ADR-041，验证见 `docs/HANDOFF.md` 最新 Test Status。

> 已完成（2026-09-24）：录单记录、导入记录、结算单详情 trace 表、系列对比等级表已统一迁移至通用 `DataTable`，统一表头、列对齐与空数据占位。

> 已完成（2026-09-23，前端性能/可靠性）：登录后首屏减重与菜单反馈收口。
> 日期筛选移除 Element Plus DatePicker；ECharts 图表改为异步加载并预留高度；总览核心指标、
> 等级明细、商号候选独立结束 loading；菜单点击增加 100ms 内目标高亮与顶部进度反馈；
> JS/CSS/Safari 分片错误统一刷新一次，持续失败进入默认错误页。前端 263 项 test、
> typecheck、build 和 Chromium 桌面/移动定向验收通过，详见 `docs/HANDOFF.md`。

> 已完成（2026-09-23）：统一补齐耗时操作等待反馈。导出、服务端排序、商号/品牌下拉查询、
> 手工录单暂存/保存/覆盖保存、导入复核切换/还原/提交、问题明细 CSV 下载、品牌对比更新均有
> 局部 loading、明确动作文案和重复点击保护；排序期间保留原表格，下载失败显示后端错误文案。
> 未改后端接口、数据口径和导出内容。验证见 `docs/HANDOFF.md` Test Status「异步操作等待反馈」。

> 已完成（2026-09-23，ADR-040）：现有系统增加统一默认错误页与静态部署兜底。页面级读取的
> 服务故障、网络/超时、运行时异常、路由分片失败进入 `/error`；未知地址为 404，权限不足为 403，
> 401 返回登录页；写请求、业务校验、冲突和通知等局部错误留在原页面。错误页支持按来源重载、
> 按角色菜单返回首页、折叠安全详情；`public/error-static.html` 可挂入 Nginx `error_page`。
> 同时修正登录/注册/验证码 401 与未登录会话恢复 401 的全局事件误报，避免登录页和错误页竞态跳转。
> 53002 预览已停用，不再使用其 SPA 回退。验证见 `docs/HANDOFF.md` 最新 Test Status。

> 已完成（2026-09-23，前端）：角色登录默认入口改为当前角色实际分配菜单中的第一个，
> 不再因残留权限默认打开未分配的「卖得怎么样」；所有业务页签均可关闭，同一路由不重复建页签，
> 关闭全部或无业务菜单时进入 `/welcome` 极简门厅。欢迎页仅作空状态，打开业务菜单后自动移除；
> 无菜单账号显示联系管理员授权提示。验证见 `docs/HANDOFF.md` Test Status
> 「角色菜单默认入口与极简欢迎页」。

> 已完成（2026-09-23）：每一单「结算单列表」在每件均价后新增「录单时间」，桌面表格与
> 手机卡片同步展示；到达市场日期、总件数、A 果件数、B 果件数、销售金额、每件均价、
> 录单时间支持升降序排序。排序由后端在分页前执行，避免只重排当前页；表头提供方向标记、
> 键盘按钮与 `aria-sort`；录单时间使用 `confirmed_at`，排序请求保留当前表格，仅替换行数据。
> 验证见 `docs/HANDOFF.md` Test Status「结算单列表录单时间与排序」。

> 已完成（2026-09-22）：用户端离线部署脚本全链路验证。镜像清空后实测
> `check.sh`、`configure-env.sh`、`load-images.sh`、`start.sh`、`status.sh`、
> `stop.sh`、`start.sh`、`build-images.sh` 与修复后的 `package.sh`；
> 两端容器健康，`/health` 与 53000 首页均通过。修复 `package.sh` 打包时混入
> `images/config/.env.docker` 的泄密风险，并确认新部署包不含该文件。

> 已完成（2026-09-21，ADR-038）：引入 ECharts，并完成 `TrendChart`、
> `GradePieChart`、`SeriesGradePriceChart`、`SeriesGradeShareChart` 四个图表组件迁移；
> 新增 `components/BaseEChart.vue` 与 `utils/echartTheme.ts`；`SearchableSelect` 与
> `DateRangeFilter` 内部试点 Element Plus，页面与 API 契约不变。
> 验证：前端 211 项 test、`typecheck`、`build` 通过。

> 待评估：是否继续用 Element Plus 替换更多表单控件。ECharts 动态拆分与本轮涉及的
> 移动端日期/导航反馈验收已完成；后续若要进一步降低首次进入图表板块的 190.64 KB gzip，
> 再评估按图表类型拆 ECharts 注册模块，避免为拆分而增加重复代码。

> 待确认（报价与交付文档）：腾讯会议沟通与演示的计费方式（按次 / 按小时 / 打包 / 并入
> 人日）；阿里云 ECS、RDS、域名、安全服务 3,299.28 元是否需单列；预留测试服务器 4C8G
> 的最终规格、期限与实际报价。报价单 V0.3 及系统架构图已产出，见 `docs/HANDOFF.md`。

> 已完成（2026-09-21）：修复用户端与管理端菜单点击偶发无响应。根因是懒加载路由旧哈希
> 分片在部署后可能失效，nginx `/assets/` 缓存 30 天 `immutable` 时 Vue Router 报
> `Failed to fetch dynamically imported module` 且无兜底。两端 `frontend/src/main.ts`
> 已加 `router.onError` + `sessionStorage` 防重入 + `_route_reload` 整页重载，并在
> `afterEach` 成功后清理标记。验证见 `docs/HANDOFF.md` Test Status「菜单点击偶发无响应修复」。

> 已完成（2026-09-21）：用户端与管理端补齐运行时日志模块。后端统一
> `logging_config.py`（控制台 + 轮转文件 + request_id + 请求/异常日志），前端统一
> `utils/logger.ts`（分级输出 + 敏感字段脱敏）；关键认证、导入确认与结算单删除补业务日志。
> 验证见 `docs/HANDOFF.md` Test Status「日志模块」。

> 已完成（2026-09-20）：全站「平均每件售价」改为「每件均价」；用户端登录页隐藏底部
> 等级口径 / 核算维度 / 导入格式说明；禁用账号登录提示改为「该用户已被禁用」
> （用户端与管理端同步）；日期范围弹层改为单行起止日期输入。

> 已完成（2026-09-20，ADR-036）：管理端菜单改名在业务端生效。
> `fruits_ana_admin` 种子按权限码 / 路由匹配菜单，改名后重启不再补建重复菜单；
> `fruits_ana` `/api/auth/me` 返回 `menus`，`AppShell.vue` 用管理端菜单覆盖侧栏
> 名称与图标（导航位置仍由前端槽位决定），停用菜单整项隐藏。
> 同时修复两系统共用 `fruit_session` Cookie 导致的登录态互相覆盖。
> 已同步 `fruits-ana-admin.service` 的 `FRUIT_ADMIN_SESSION_COOKIE=fruit_admin_session`
> 并重启管理端后端；`backend/app/auth.py` 增加对旧值 `fruit_session` 的兜底。
> 验证：前端 206 项 test、typecheck、build 通过；真实浏览器实测侧栏显示「卖的怎么样」。

> 已完成（2026-09-20，ADR-037）：手工录单「暂存」由浏览器 `localStorage` 改为数据库存储。
> 新增 `entry_draft` 表与 `GET/PUT/DELETE /api/entry/draft`；`/entry` 普通刷新自动恢复草稿，
> 保存成功后清除；`/imports` 的继续录单卡片改为读服务端草稿。
> 验证：后端 `test_entry_api.py` 7 项、`test_entry_service.py` + `test_models.py` 14 项通过；
> 前端 `entry-form` / `entry-draft` 11 项 test、`typecheck`、`vite build` 通过。

> 待确认：管理端新增菜单不会自动出现在业务端侧栏，需前端补路由与槽位；
> 是否需要支持在管理端配置「哪个菜单进主导航 / 更多」，见 ADR-036 Consequences。

> 未完成盘点（2026-09-18）：
> - P0：待用户执行清库重建/迁移并重新导入 `tickets/`；待客户回复异常数据 B/C 组；
>   顺仔生产化收口、入口落点、市场命名、品牌对比 AI 小标题、`lhp` 角色恢复待确认。
> - P1：果农版简化第二层、到达日期表头别名、系列对比后续能力、真实结算单浏览器回归。
> - P2/Blocked：销售地区、利润测算、测试覆盖率提升。
> - 测试团队统一修复（2026-09-18）：代码修复与可执行验证已完成；管理端
>   `expand_notification_content.py --apply` 已执行；真实浏览器核心页面 E2E 已完成；待补真实 MySQL 数据流回归 / 性能压测。
> - 导入复核/记录 7 项 UI 修复（2026-09-18）：1~6 已完成并验证；第 7 项
>   「删除支出费用行后提交 500」本地未复现，等待现场后端日志继续定位。
> - 手工录单/文件导入区分与销售明细可选字段（2026-09-18）：代码、测试、构建与
>   后端重启已完成；待用户在真实页面验收。
> - 全站均价文案改为「平均每件售价 / 元/件 / 销量（件）」（2026-09-18）：
>   代码、全量测试、构建与后端重启已完成；待用户在真实页面验收。
>
> 已完成（2026-09-19，ADR-033）：结算单详情新增基础信息条、移除销售金额排名；
> 规格图更名“各等级各规格件数/均价”，新增占比/总件数/平均每件售价；等级表现取消整单均价；
> 等级图表压缩“等级件数结构”与“各等级平均每件售价”空间，规格表完整展示且不横向移位。
> 基础信息前六项调整为“市场、单号、到达市场日期、销售日期、柜号、转运公司”，
> 售后金额与售后比合并为“售后金额/售后比”，展示为“金额 / 百分比”。
> 全站统一“销售金额 / 销售日期 / 到达市场日期”文案。后端全量 pytest、前端 199 项 test、
> typecheck、build 均通过。

> 已完成（2026-09-19，前端）：`OverviewView.vue` 移除“结算单销售情况”“每日销量和平均每件售价”
> “需要关注”三个板块；保留日期/商号筛选与等级汇总，并停止 `getTrend` 请求，
> `getSettlementComparison` 继续用于商号下拉候选。前端 199 项 test、typecheck、build 均通过。

> 已完成（2026-09-19，ADR-034）：新增 `GET /api/analytics/grade-breakdown` 全量明细聚合接口，
> `OverviewView.vue` 复用 `SettlementGradeBreakdown`，在“卖得怎么样”页面展示等级件数结构、
> 各等级平均每件售价、各等级各规格件数/均价三个图；支持全部结算单和单商号两种范围。
> 后端全量 pytest、前端 200 项 test、typecheck、build 均通过。

> 已完成（2026-09-19，前端）：等级图表三块改为紧凑布局——饼图与均价横条并排，
> 规格件数表全宽展开并新增占比列；`SettlementGradeBreakdown.vue` 与 `GradePieChart.vue`
> 同步调整，53001 视觉稿见 `grade-breakdown-compact.html`。前端 200 项 test、typecheck、build 均通过。

> 已完成（2026-09-19，前端/接口）：结算单列表新增“到达市场日期”列；
> `GET /api/settlements` 的 `SettlementListItem` 增加 `arrival_date`，桌面表与移动卡片同步展示。
> 后端 `test_settlements_api`、前端 200 项 test、typecheck、build 均通过。

> 已完成（2026-09-19，ADR-035）：文件导入售后明细内容支持向上填充；内容为空但摘要/金额非空时
> 继承最近一条非空内容，整行空白跳过；金额与汇总口径不变。后端全量 pytest 通过。

> 已完成（2026-09-19，前端 bug）：`SearchableSelect` 选择选项后自动失焦，避免结算单详情等页面的
> 下拉框选中后仍保持文本输入焦点并拦截后续键盘操作。前端 200 项 test、typecheck、build 均通过。

> 已完成（2026-09-19）：结算单列表「查看明细」改为复用导入二次确认页的只读模式。
> 后端新增 `GET /api/settlements/{merchant_no}/review`，前端跳转
> `/import-review?merchant_no=...&readonly=1`，禁用所有修改入口。
> 后端全量 pytest、前端 200 项 test、typecheck、build 均通过。

> 已完成（2026-09-18）：「每一单」菜单下的结算单列表增加删除按钮；
> 后端新增 `DELETE /api/settlements/{merchant_no}`，按商号删除整单及其明细、
> 售后/费用、汇总与留痕，并在原始文件不再被引用时清理上传文件。

> 已完成（2026-09-18）：品牌对比页结算单选择器增加「品类」前置步骤，
> 改为「品类 → 品牌 → 同品牌结算单」三步选择；`GET /api/settlements` 返回
> `fruit_type`，前端按品类分组，空值归入「未识别品类」。同品牌校验与对比接口不变。

> 已完成（2026-09-20，前端）：手机版全站改版设计落地。外壳瘦身（隐藏页签栏、顶栏 48px、
> 底部导航 76px）、筛选栏单行横向滚动、规格表改两行式（消除 520px 最小宽度溢出）、
> 结算单列表卡片四段式重构、等级卡片纵向堆叠。新增 `frontend/src/styles-mobile.css`。
> 后端 pytest 全量、前端 198 项 test、typecheck、build 均通过；
> 390×844 实测 7 个业务页面无页面级横向溢出。视觉稿见
> `frontend/dev-preview/mobile-20260920/index.html`。

> 已完成（2026-09-20，前端，手机版第二轮）：手工录单紧凑化（基本信息两列、费用行压成一行、
> 销售/售后行改网格卡片）、手工录单五个分区手机端可折叠（默认只展开基本信息、折叠头带小计、
> 点锚点自动展开、校验失败自动全展开）、AI 结论手机端折叠（详情页高度 4174px → 2896px）、
> 筛选栏查询按钮 sticky 常驻右侧、页脚留白躲开「回到顶部」；底部导航 92px → 80px。
> 验证：前端 198 项 test、typecheck、build 通过；390×844 实测无页面级横向溢出。
> 视觉稿见 `frontend/dev-preview/mobile-20260920/index.html`。
>
> 已完成（2026-09-21，前端，手机版第三轮）：补齐 `/import-review`（导入二次确认 + 结算单只读查看）
> 手机端——弹窗改整屏、只读提示去重、头部收成一行；抽出共享类 `.mobile-form-page`，
> 手工录单与二次确认共用同一套字段两列 / 明细卡片 / 锚点胶囊样式；`DataTable` 单元格新增
> `data-col`，手机端排版改为按列名定位（二次确认页多一列「文件行」，序号定位会错位）；
> 修掉定高 grid 里滚动型锚点栏被压成 9px 的布局坑。
> 验证：前端 202 项 test、typecheck、build 通过；390×844 实测 12 个页面无页面级横向溢出。
> 视觉稿见 `frontend/dev-preview/mobile-20260920/index.html`。
>
> 已完成（2026-09-21，前端，手机版第四轮）：`/imports` 上传区改成「能力与文案一致」。
> 手机端没有拖拽能力，文案由「拖入文件会自动解析…」改为「选择文件上传后会自动解析…」；
> 上传面板整块可点（原来只有按钮一小块能点），按钮全宽 44px；多文件选择后队列摘要
> 显示「已选 N 个文件 · 首个文件名等 · 共 X 兆字节」（原来只显示第一个文件名，容易以为漏选），
> 并把「文件名 ↔ 大小」的两端对齐改成上下两行，长文件名不再折行错位。
> 验证：前端 206 项 test、typecheck、build 通过；390×844 实测 12 个页面无页面级横向溢出。
> 视觉稿见 `frontend/dev-preview/mobile-20260920/index.html`（新增 `imports-queue.png`）。
>
> 待办（2026-09-21，前端）：手机端「按等级筛选」入口（优先级最低）。

## P0 — 当前必须完成

> 专业测试团队修复（2026-09-18，未提交）：已完成 59 项问题中的 P0 与可落地 P1，
> 详见 `docs/testing/2026-09-18-测试问题汇总.md` 第九节；剩余运维迁移与真实环境验收。

> 已完成（2026-09-17）：新模板导入二次确认的字段转换配置与留痕已落地。
> 业务侧 `field_conversion.py` 动态生成 `grade`；`AB` 默认独立，若配置 `AB→A` 则统计动态按 A。
> 新增多文件预览草稿闭环：`POST /api/imports/preview` → `import_job/import_draft` →
> `/import-review` 二次确认 → `confirm_import_job`；`settlement_revision` 同时覆盖导入复核修改与手工单覆盖修改留痕。
> 待运维执行：`backend/scripts/add_import_draft_schema.py --apply` 增列/建新表，
> `backend/scripts/expand_grades.py --apply` 扩 `sale_record.grade` 约束含 `AB`；管理端种子由 `init_db()/seed_admin_data()` 完成。

> 已完成（2026-09-17）：二次确认页切页签前自动保存当前草稿，避免多文件编辑丢失；
> 销售行原始金额 `amount` 已回传并保留，导入复核不会误报金额不一致；
> 基础信息补充到达日期/来货数量校验，销售日期与品种补充格式校验；
> 前端“总件数”改为销售数量求和，并同步手工单 `SettlementSummary.sales_quantity`；
> `settlement_revision` 现在同时记录基本信息修改，`manual_edit_count` 按草稿留痕统计；
> 两个迁移脚本补充幂等索引，留痕大字段改为 `MEDIUMTEXT`。
> 验证：前端 193 项测试、`typecheck`、`build` 通过；后端相关测试通过，全量仅 4 个
> 缺少 `attachments/结算单模板样式.xlsx` 的导出用例失败（环境缺失，非本次改动）。

> 待用户执行（2026-09-16）：开发库规格列改文本需要清库重建，然后重新导入 `tickets/`。
> `cd backend && .venv/bin/python scripts/rebuild_dev_schema.py`（演练）→
> `FRUIT_ANALYSIS_ALLOW_DESTRUCTIVE=1 .venv/bin/python scripts/rebuild_dev_schema.py --apply`。
> 重建后核对：销售明细页规格显示 `3/4`、`9/10`，导出 xlsx 头数合计取区间上限。

> 待客户回复（2026-09-16）：异常数据处理确认单 B 组（损耗/抽检/补果/硬包行是否进售后明细、
> `霉果 100` 怎么处理）与 C 组（C2 商号以内容为准、C4 重复文件覆盖、C6 宝贝清关费），
> 见 `docs/2026-09-16-导入异常数据处理确认单.md` 第六节。

> 已完成（2026-09-17）：品牌文件 AI 解析 P1~P3 的导入预览与二次确认闭环已落地，
> 计划见 `docs/superpowers/plans/2026-09-17-multi-file-import-confirm.md`；
> 当前版本使用新模板解析器，模型/品牌解析器接入时复用同一草稿与确认链路。

> 已完成（2026-09-16）：顺仔悬浮入口改为「默认收起 + 悬停弹出」。
> 收起时只留一个缩小、半透明、贴边的图标（贴住屏幕右边缘并出血约三分之一：桌面可见 35px、移动 38px），不再压住列表最后一行的按钮；
> 鼠标移入、`Tab` 聚焦、对话窗打开三处触发都会弹出「顺仔 / 收起」名字标签（桌面展开后 137px），
> 数值统一由 `--ask-open` 插值，收回与展开共用一条 `cubic-bezier(.34, 1.42, .64, 1)` 弹性过渡；
> 触屏无悬停，靠点击开关对话窗切换，`@media (hover: hover)` 只把悬停展开限定在鼠标设备。
> 验证：前端 180 项测试通过，53001 实测收起 / 悬停 / 移开 / 打开四态数值与 `console error 0`。

> 已完成（2026-09-16）：结算单列表按行导出（模板版式）+ 列表填满可视区。
> 每行新增「导出」，命中 `GET /api/exports/settlements/{merchant_no}/template.xlsx`，
> 用 `attachments/结算单模板样式.xlsx` 渲染：手工单直接读录单数据，导入件把
> `SettlementSummary` + `SaleRecord` 映射成同一结构（售后取 `after_sale_amount` 绝对值、
> 费用用 `parse_fee_detail` 拆 `fee_detail`、清关税费单列一行，件数/规格整列留空而不是写 0）；
> 顺带修掉 openpyxl `cell(r, c, None)` 不清空模板示例值导致导入件残留「4 / 10」的问题。
> 列表样式：桌面端去掉分页条下方留白（分页条回到 28px 高、贴面板底），表格行高放宽、
> 操作列固定 8.5rem 不折行、移动端卡片「导出 / 查看明细」同排。验证：后端 286 项 pytest、
> 前端 179 项测试 + `typecheck` 通过；53001 实测两端各 10 个导出入口、下载
> `TEST-test-结算单.xlsx` 12,343 字节、overflow 0、console error 0。

> 已完成（2026-09-15）：结算单列表导出补齐分类明细 + 列表分页与表格边框。
> 导出 xlsx 由 1 张表扩为 5 张：`结算单列表`（汇总，追加「售后合计 / 费用合计 / 应付贵方总金额(RMB)」）
> + `销售明细` + `售后明细` + `支出费用明细` + `说明`；导入件用 `parse_fee_detail` 拆 `fee_detail`
> 文本、手工件直接读 `SettlementFeeItem` / `SettlementAfterSaleItem`，来源列区分「录单录入 / 录单自定义 /
> 结算摘要 / 费用明细」。列表页新增分页（每页 10 / 20 / 50，`page`/`page_size` 走后端，
> 切商号与点「查看结果」回到第 1 页）、`DataTable` 新增 `bordered` 属性给结算单列表打开单元格边框；
> 顺带修掉桌面一屏高布局下「顺仔」悬浮按钮盖住分页按钮的问题（分页行预留 4.75rem 底部空间）。
> 验证：后端 284 项 pytest、前端 175 项测试 + `typecheck` 全通过；53001 实测桌面 1440 / 移动 390
> 分页 13 张（10 + 3）、每页 50 显示全量、导出下载正常、console error 0、横向溢出 0。

> 已完成（2026-09-15，方案 C / ADR-025）：数据导入与手工录单合并为侧栏「录单 / 导入」一个入口，
> `/entry-hub` 为「选择录入方式」页（文件导入 / 手工录单两张卡片 + 最近导入 3 条 + 未完成手工单
> 「继续录单」）；`/entry-hub`、`/imports`、`/entry` 三个路径共享同一菜单高亮，后两者各自保留页签。
> 手工单草稿存浏览器 `localStorage`（`fruit-entry-draft:v1:<userId>`，防抖 800ms 写入、保存后清除）；
> 无 `entry:view` 的角色只看到文件导入。验证：后端 280 项 / 前端 162 项测试、`typecheck`、
> `vite build` 通过，Playwright 桌面 1440 与移动 390 实测（横向溢出 0px、console error 0）通过。
> 已完成（2026-09-15）：手工录单 + 录单字段配置代码与浏览器端到端验收。
> 两后端重启后在 390×844 移动端实测：填单 → 保存 → 同商号冲突弹窗可操作 → 确认覆盖 →
> 跳详情页 → `GET /api/entry/999001/export.xlsx` 200（12,376 字节 xlsx）；
> 四项汇总占满一行、应付居右，`总件数 60 差异 +40 件` 红字提醒正常，页面横向溢出 0px。
> 验收数据已清理（批次 12 / 手工单 0）。
> 已完成（2026-09-15）：真实库 12 张被误删的表现在已用留存上传原件重建并校验（ADR-021）；
> 表结构由 `init_db()` 建齐，`add_entry_schema.py --apply` 已无需补列。
> 已完成（2026-09-15）：自然语言数据问答「顺仔」（ADR-023）——`/api/ask` + 5 个只读工具，
> 已从 53001 预览页整合进正式外壳（`AskWidget.vue` 右下角悬浮按钮 + 对话窗，挂在 `AppShell.vue`，
> 与「回顶部」按钮互斥避让）；权限收口为 `ask:view`（仅 `fruit_admin`，后端 401/403 + 前端不渲染
按钮双层拦截）；后端 280 / 前端 162 项测试通过，53000 + Chromium 端到端验收通过。
> 已完成（2026-09-15）：顺仔移动端遮挡修复——对话窗跟随 `visualViewport` 可视视口（软键盘弹出
> 时整窗收缩、输入区不被盖住）、避让刘海与底部横条、消息区可收缩不再裁掉发送按钮、
> 通知横幅在对话窗打开时不再压住窗口；遗留 `320×568` 极窄屏 39px 横向溢出（非顺仔组件）。
> 已完成（2026-09-15）：顺仔悬浮入口视觉改版——去掉「顺仔」文字标签，头像换成自绘矢量
> Q 版榴莲「果壳探头」吉祥物（`frontend/public/durian-mascot.svg`，透明底无水印，
> 桌面 72px / 移动 62px，含探头呼吸动画）。

> 已完成（2026-09-15）：非测试库 destructive 硬保护（ADR-024）。`Base` 改用
> `GuardedMetaData.drop_all`，引擎挂 `before_cursor_execute` 拦截 `DROP TABLE / DROP DATABASE /
> DROP SCHEMA / TRUNCATE`；逃生口仅 `FRUIT_ANALYSIS_ALLOW_DESTRUCTIVE=1`；判库口径为
> SQLite 或库名含 `test`（fail-closed）。业务端与管理端 `backend/app/db.py` 同实现。
> 验证：新增 `backend/tests/test_db_guard.py` 6 项，后端全量 278 项通过；
> 两端 `compileall` 与 `import app.main` 通过；两端服务重启后 `/health` 均 200。

> 已完成（2026-09-15）：两条 schema 漂移已收敛，只改模型映射、未动线上数据。
> ① `fruits_ana_admin` 的只读映射 `sale_record.grade` 由 `varchar(1)` 改为 `varchar(5)`，
> 与业务端枚举映射（含 `OTHER`）一致；② 两端 `import_batch.source_type` 增加
> `server_default=text("'import'")`，让 `create_all` 与迁移脚本产出同一份
> `VARCHAR(16) NOT NULL DEFAULT 'import'`。验证：MySQL/SQLite 方言 `CreateTable` 编译
> 逐列核对通过，后端 278 项测试全通过，两端 `compileall` + `import app.main` 通过，
> 两端服务重启后 `/health` 200、字段字典接口返回 `market 2 项 / variety A-F 6 项`。

- [ ] **品牌对比页 AI 小标题口径确认**：品牌对比页仍是固定 9 个小标题，
      需业务确认是否同步为只列实际存在的等级。

> 已完成（2026-09-24）：顺仔增加问答调用审计（用户 / 问题 / 工具调用 / 模型 / 耗时，
> 成功与失败均留痕），不做频控；入口页 `/entry-hub` 已重定向至 `/imports`；
> 市场字典「海吉星2」已改为「海吉星」；`lhp` 不再恢复管理端角色，仅保留 `admin` 访问。

> 已完成（2026-09-15）：数据导入页「导入记录和问题」改为每页 5 批翻页展示（末页 / 越界钳制、
> 批次增删回到第 1 页），仅改 `ImportView.vue` 与其测试；前端 133 项测试、`typecheck`、
> `vite build` 通过，Playwright 实测 12 批分页 5 / 5 / 2 与移动端 390px 无溢出。

> 已完成（2026-09-11）：工作台外壳增加顶部 header（右侧当前用户名 + 退出登录）与页签栏。
> 页签记录本次会话打开过的页面，首页固定不可关闭，其余可单个关闭 / 「关闭其他」，
> 关闭当前页签跳右侧邻居，状态存 `sessionStorage`；纯逻辑在 `utils/shellTabs.ts`。
> 验证：前端 104 项 + typecheck + build 通过，后端 233 项通过；53002 + Chromium 实测
> 桌面与移动端（360 / 390px）行为与布局均符合预期。

> 已完成（2026-09-10）：拆分并提交工作区在途改动，代码 / 测试共 7 个提交
> （`48b4ed5`..`a1e8bfd`），覆盖果农版导航、全站字号、商号筛选跟随、
> 下拉自动刷新、单日趋势参考线、柱状图高度修复与回归测试；文档收口随本提交完成。

> 已完成（2026-09-10）：P0-1 全系统业务逻辑与交互检查完成。主流程核对通过；
> 发现并修复：① 移动端系列对比页 24px 横向溢出，根因是 `SeriesGradeTables` 固定
> 400px 最小网格列宽；② 文档仍写支持 `.xls`，实际前后端只支持 `.csv/.xlsx`，已修正
> `README.md` / `docs/ARCHITECTURE.md`；③ ADR-010 的接口参数名与实现不符，已修正为
> `start_date` / `end_date`。验证：前端 62 项测试、typecheck、build 通过；API 筛选断言通过。

> 已完成（2026-09-10）：P0-2 全站字号浏览器回归验收通过。桌面 1440px + 移动 390px，
> 覆盖登录 / 注册 / 销售总览 / 数据明细 / 结算单对比 / 结算单详情 / 数据导入 / 系列对比，
> 无小于 14px 的可见正文、无横向溢出、无固定高度容器文字截断。

> 已完成（2026-09-10）：P0-3 下拉框浏览器验收通过。总览页 / 数据明细 / 结算单详情三处
> 商号下拉切换即刷新；三处到达日期输入变化均不自动查询，点「查看结果」才刷新；
> 结算单详情默认选中第一张非禁用商号。

> 已完成（2026-09-10）：在途改动拆分提交（`33a5aef`..`2a71d04`）；
> 修复 `ImportView.vue` 导入失败提示被覆盖的缺陷；统一前端端口为 `53000`；
> 线上库结构迁移 `backfill_settlement_identity.py --apply` 执行成功并重启服务；
> 浏览器端到端验收（登录 / 销售总览 / 数据明细 / 查看明细弹窗 / 结算单对比 / 结算单详情）
> Playwright 15 项检查全部通过；
> 修复「开始导入」按钮把点击事件当作覆盖参数、导致同商号重复导入被静默覆盖的缺陷；
> 修复结算单详情页移动端横向溢出（`.settlement-dashboard` 缺少移动端 min-width 守卫）；
> 补齐前端 `npm run test` / `npm run typecheck` 脚本与 `.gitignore` 忽略项；
> 移动端布局与导入覆盖确认已用 Playwright 验收（23 项检查全部通过）。
> 新增（2026-09-10）：「系列对比」页与 `GET /api/analytics/series-comparison` 已实现，
> 新增后端 13 项 + 前端 8 项用例，真实数据结果与手算基线完全一致。
> 新增（2026-09-10）：下拉框改为「商号（单号）」展示；界面日期统一显示为「到达日期」
> （ADR-010，含筛选控件「到达日期起 / 到达日期止」），字段名与接口参数未变。
> 修复（2026-09-10，代码完成待提交）：销售总览的「结算单销售情况」此前固定展示全部结算单，
> 现已跟随商号筛选只显示所选商号；单日商号的每日趋势图改为「商号标题 + 参考线 + 单日提示」，
> 避免只剩一个圆点看起来像未生效；商号下拉切换后自动刷新，「查看结果」按钮保留给到达日期筛选。
> 修复（2026-09-10，代码完成待提交）：全系统下拉框统一为「默认有选中项 + 切换立即刷新」，
> 数据明细与结算单详情商号下拉补上自动刷新，「查看结果」按钮只服务到达日期筛选；
> 结算单详情商号默认选中第一张，范围变化后自动回落，避免下拉显示为空。
> 修复（2026-09-10，代码完成待提交）：「A/B/C 平均每千克售价对比」柱状图此前只显示 2px 细线，
> 根因是柱高百分比落在高度不确定的网格行上（`.price-bars` 用 `align-items: flex-end`），
> 改为 `align-items: stretch` 后柱高恢复；新增回归用例 `comparison-chart.test.ts`，
> Playwright 实测桌面与移动端柱高均为 52~91px。
> 新增（2026-09-10）：「系列对比」页增加 AI 分析结论（ADR-011）：按勾选结算单生成大白话结论，
> 结果缓存到新表 `ai_analysis`，模型配置读根 `.env`，未配置时不影响其它功能。

## P1 — 当前阶段

- [x] **页签不再跨登录/刷新缓存（2026-09-18）**：保留当前会话的页签记录与关闭/刷新操作，
      去掉 `sessionStorage` 的 `fruits-ana:open-tabs` 读写；登录或刷新后从首页重新开始。

- [x] **导入等待与移动端交互优化（2026-09-11 交付）**：数据导入增加等待遮罩、
      右下角一键回顶、header 时间显示秒；移动端强化 header 窄屏、底部导航字号与安全区；
      前端 120 项测试、`typecheck`、`vite build` 与 Playwright 浏览器验收通过。

- [x] **header 字号滑动条（2026-09-11 交付）**：header 增加「小 / 标准 / 大 / 特大」
      四档滑动条，默认「小」；根字号在 `clamp()` 视口自适应的基础上按用户缩放系数调整，
      并用 `localStorage` 记住最近一次修改。前端 123 项测试、`typecheck`、`vite build` 通过。

- [x] **认证门户精简与外壳控制（2026-09-11 交付，未提交）**：登录页删除三组能力说明与
      「先看演示效果」入口；新增默认不勾选的「30 天内免登录」，不勾选 7 天、勾选 30 天；
      header 品牌图标跳 `/overview`、增加桌面侧栏收起与本地日期/星期/时分，收起为 72px
      图标栏并用 `localStorage` 记忆；移动端保留底部导航、只显示时分。前端测试 / typecheck /
      build、后端 236 项 pytest 与真实浏览器验收均已通过。

- [x] **等级细分（2026-09-11 交付，ADR-013）**：从 `grade_raw` 派生号别（方案 A：区间原样成桶），
      在「系列对比」页新增「按等级号别」视图与 AI 号别小结；不改 A/B/C 主口径、不新增数据库列；
      无法识别的写法归入「其他」并计数。后端新增解析 / 聚合 / AI 三处模块，前端新增 3 个组件。
      **已验证**：真实浏览器端到端验收通过（桌面 1440px / 移动 390px，含系列 AI 与号别 AI）。

- [x] **单号命名适配（2026-09-11 交付，ADR-015）**：`import_batch` 双写原始单号
      `order_no` 与适配后单号 `order_no_normalized`（`宝贝003 → 宝贝-003`），页面 / 导出 /
      AI 数据包统一展示适配后单号，原始写法用 tooltip 与副标题保留可追溯；规则集中在
      `services/order_no_naming.py`，迁移脚本幂等且支持 `--force` 重算。
      已执行线上迁移并完成真实浏览器验收（见 `docs/HANDOFF.md` Test Status）。

- [x] **商号规范化（2026-09-11 交付，ADR-016）**：`import_batch` 双写原始商号
      `merchant_no` 与适配后商号 `merchant_no_normalized`（`单637 → 637`、`单624 → 624`，
      `626` / `640` 不变），页面 / 导出 / AI 数据包统一展示适配后商号，原始写法用 tooltip
      保留可追溯；**商号仍是唯一业务键、接口参数、下拉取值与地址栏 `selected=` 的值**，
      只有展示改用适配后商号。规则集中在 `services/merchant_no_naming.py`，
      迁移脚本基于通用工具 `scripts/column_backfill.py`，幂等且支持 `--force` 重算。
      已执行线上迁移并完成真实浏览器验收（见 `docs/HANDOFF.md` Test Status）。

- [x] **结算单选择器改造（2026-09-11 交付）**：改为「已选摘要 + 抽屉式选择面板」，
      支持搜索、系列折叠、草稿确认、按系列 / 最近到达排列、Tab 焦点锁定与地址栏
      `?selected=` 还原；详见 `docs/superpowers/plans/2026-09-11-settlement-picker.md`

- [x] **手机端 4 核心页卡片化与收折（2026-09-11 交付）**：数据明细、明细弹窗、
      系列总览、结算单详情销售明细、导入问题表在手机端改为纵向卡片；系列对比详细分析
      默认收起；结算单选择器主操作固定到底部导航上方。验证：前端 123 项测试、typecheck、
      build 通过，Playwright 实测 5 个关键交互通过。

- [x] **手机端第二轮紧凑化（2026-09-12 交付）**：修复响应式样式被基础样式覆盖的问题，
      手机端隐藏说明与页面副标题、筛选器两列紧凑、关键列表卡片与详情 KPI 进一步压缩；
      展开/收起与数据明细弹窗交互通过，六个页面横向溢出为 0，除数据导入约 1 屏外，
      其余页面收敛到 1.2~1.7 屏。

- [x] **卖得怎么样排序规则细化（2026-09-13 交付）**：总览页「结算单销售情况」支持
      按品牌 / 销售日期 / 商号排序，默认按销售日期；「按商号」调整为倒序。
      已同步功能说明书与用户操作手册至 V1.3。验证：前端 123 项测试、typecheck、build 均通过。

- [x] **品牌口径与统一日期范围（2026-09-14 交付）**：界面可见文案的「系列」统一改为
      「品牌」；结算单详情页新增品牌筛选，商号候选与同期基线跟随品牌收窄；新增
      `DateRangeFilter.vue`，五个业务页统一从一个面板选起止日期。AI 系列数据包字段同步改名，
      `PROMPT_VERSION` 升至 `v6`。验证：前端 123 项测试、typecheck、build 均通过；
      后端 236 项 pytest 通过。

- [x] **结算单详情等级图表（2026-09-14 交付）**：等级表现板块新增 A/B 件数占比环形图、
      A/B 均价柱状图、A-B 价差与 B 比 A 折价比，以及 A/B/C 各等级各规格件数横向柱状图；
      新增 `SettlementGradeBreakdown.vue`，并给 `GradePieChart.vue` 增加可选 `gradeOrder`。
      验证：前端 123 项测试、typecheck、build 均通过；后端 236 项 pytest 通过。

- [x] **品牌对比同品牌约束与分页选择（2026-09-14 交付，ADR-019）**：品牌对比页
      结算单选择改为先选品牌、再选同品牌结算单；品牌内搜索商号 / 单号 / 柜号并每页 6 张分页，
      历史 `selected=` 跨品牌链接收敛到第一张所属品牌；后端系列对比与两处 AI 分析接口增加
      同品牌校验，跨品牌返回 422。验证：前端 126 项测试、`typecheck` / `build` 通过；
      后端 241 项 pytest 通过。

- [x] **AI 分析默认展示与缓存自动复用（2026-09-14 交付）**：AI 卡片默认自动读取缓存，
      同条件已分析过时直接展示上次结果并标记 `cached`，无缓存才生成；筛选变化用请求版本号
      丢弃过期响应。验证：前端 126 项测试、`typecheck` / `build` 通过；后端 241 项 pytest 通过。

- [x] **等级文案去枚举化（2026-09-14 交付）**：系统可见描述中的「A/B/C 独立对比」等
      枚举式文案统一改为「等级独立对比 / 各等级」，覆盖品牌对比页、预览页、图表说明、
      README 与后端 docstring / AI 提示词；实际等级列、图例与演示数据里的 A/B/C 数值文案
      保持不变。验证：前端 123 项测试、typecheck、build 均通过；后端 236 项 pytest 通过。

- [x] **结算单销售情况等级明细改版（2026-09-13 交付）**：A/B/C 等级块改为展示
      等级、等级均价、占比，保留销售额 / 销量 / 平均每千克售价列；已同步两份 Word 文档至 V1.5。
      验证：前端 123 项测试、typecheck、build 均通过。

- [x] **售价描述统一（2026-09-13 交付）**：全站价格文案统一为「平均每千克售价 / 元每千克」，
      覆盖页面、图表、表格、AI 提示词与异常文案；计算字段与公式不变。
      两份 Word 文档同步至 V1.5，ADR-009 追加修订说明。
      验证：后端 pytest、前端 123 项测试、typecheck、build 均通过。

- [ ] 果农版简化「第二层」（方案 B）：首页重做为「大数字 + 三个等级大卡片 + 每一单大卡片 + 大白话提醒」，
      并把术语白话化、导入结果改色块、对比能力降级为次级入口。
      设计见 `docs/superpowers/specs/2026-09-10-farmer-simplification-design.md`

- [ ] 导入解析是否增加「到达日期」表头别名（当前只认 `销售日期 / 日期 / 销售时间`），待确认客户 Excel 实际表头后再决定

- [ ] 系列对比的后续能力（本期只交付 A/B/C 独立分析、图表与等级细分）：
  到港日期字段与一次库迁移、元/KG 换算口径、Excel 导出、系列别名字典

- [ ] 真实业绩数据（结算单）的浏览器端回归验收：目前只有 4 张示例结算单，覆盖不到的字段组合需在真实数据到位后复验

- [x] **品牌化收口与真实浏览器验收（2026-09-11）**：登录/注册门户统一为 SLD 品牌，
      主图改用国内 CC零素材网可商用图片并落 `docs/IMAGE_CREDITS.md`；桌面与移动端真实浏览器
      覆盖登录/注册/恢复、总览/明细/详情/对比/系列、系列 AI 与号别 AI、临时文件上传命名回填。
      验证：后端 236 项、前端 120 项、typecheck、build 均通过；临时账号与上传批次已清理。

## P2 — 后续优化

- [ ] 销售地区维度：`sales_region` 字段已预留，待源数据带上地区后回填并出报表
- [ ] 利润测算（第二期）：依赖成本数据口径确认，见 ADR-003
- [x] `analytics_service` 按职责拆分：`analytics_core` + `settlement_analytics_service`
- [ ] 提升测试覆盖率；为「中间态提交」补一次 bisect 友好的验证策略

## Blocked

### 利润测算

- Blocked by：采购成本与国内物流/报关费用数据尚未提供，口径未确认。
- 下一步：用户提供成本表后，先确认主键与成本口径，再进入设计。

### 销售地区维度

- Blocked by：现有结算单没有销售地区字段。
- 下一步：确认数据来源后再回填，不得臆测地区值。
