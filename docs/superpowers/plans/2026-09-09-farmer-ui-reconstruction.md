# 果农版页面重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将水果销售分析前端重构为四个职责清晰、全中文、适合低电脑使用经验果农的页面。

**Architecture:** 保留现有 Vue Router 和接口层，只在前端壳层、页面组件、共享文案与样式上收敛导航和交互。侧边栏/移动菜单负责唯一的一级导航；页面内部只执行当前页面任务，复杂信息通过本页折叠区渐进展示。

**Tech Stack:** Vue 3、TypeScript、Vite、Vue Router、现有 CSS、现有 FastAPI 接口。

---

### Task 1: 建立前端重构验收基线

**Files:**
- Create: `frontend/tests/farmer-ui-copy.test.ts`
- Modify: `frontend/tests/sfc-build-entry.ts`（仅在需要加入模板检查入口时）

- [ ] **Step 1: 写失败测试**

  为四个页面和壳层定义静态验收检查：菜单名称必须为“销售总览、货柜对比、货柜详情、数据导入”；不得出现旧菜单名、跨菜单链接或英文装饰标题；筛选表单不得包含输入控件上的自动刷新事件。

- [ ] **Step 2: 运行测试确认失败**

  运行 `node --import tsx frontend/tests/farmer-ui-copy.test.ts`（若环境无 `tsx`，将测试改为现有 Node 可执行方式）。预期因当前源码仍存在旧文案、跨菜单入口和 `@change` 自动查询而失败。

- [ ] **Step 3: 固化可复用检查函数**

  使用 Node 文件读取和正则检查模板中的可见文案、路由目标和事件绑定；业务等级代码 A/B/C/BC 作为明确例外，不把接口字段或 TypeScript 标识符当作可见英文。

- [ ] **Step 4: 再次运行确认检查仍能捕获问题**

  运行同一命令，确认失败信息分别指出菜单、英文和自动查询问题。

### Task 2: 统一壳层导航与基础文案

**Files:**
- Modify: `frontend/src/AppShell.vue`
- Modify: `frontend/src/styles.css`
- Modify: `frontend/src/styles-shell.css`

- [ ] **Step 1: 更新菜单契约**

  将导航标签统一为“销售总览、货柜对比、货柜详情、数据导入”，同步品牌副标题、移动端当前页名称和无障碍标签。

- [ ] **Step 2: 清理主题和装饰文案**

  保持明亮主题，移除主题切换残留和所有装饰性英文；保留中文跳过链接、移动菜单状态和等级说明。

- [ ] **Step 3: 检查壳层响应式行为**

  确认桌面侧边栏固定可见，移动端只有一个菜单展开入口，菜单项触控区域至少 44 像素且无第二层页面导航。

- [ ] **Step 4: 运行前端构建**

  运行 `npm --prefix frontend run build`，预期构建成功。

### Task 3: 重构共享组件与查询行为

**Files:**
- Modify: `frontend/src/components/GradeSummary.vue`
- Modify: `frontend/src/components/TrendChart.vue`
- Modify: `frontend/src/components/ContainerComparison.vue`
- Modify: `frontend/src/components/ComparisonPanel.vue`
- Modify: `frontend/src/components/GradePieChart.vue`

- [ ] **Step 1: 统一指标和状态文案**

  将“加权均价”改为“平均每件售价”，在辅助文字中说明“销售额除以销量”；所有空数据、加载和失败说明使用中文且给出下一步。

- [ ] **Step 2: 移除跨菜单行为**

  货柜对比组件只负责排序、展示和当前页选择，不再显示“查看详情”动作或发出跨菜单事件；详情页所需货柜选择由详情页自己的筛选区完成。

- [ ] **Step 3: 修正趋势展示口径**

  保留接口真实提供的每日总销量、销售额和平均售价；若没有分等级趋势，不用 0 值伪造 A/B/C 曲线，图例和说明改为真实数据口径。

- [ ] **Step 4: 验证共享组件**

  运行 `npm --prefix frontend run build` 和现有 `frontend/tests/analytics-client.test.ts`、`comparison-chart.test.ts`、`container-comparison-selection.test.ts`，确认类型和既有工具行为未回归。

### Task 4: 重构销售总览和货柜对比页面

**Files:**
- Modify: `frontend/src/views/OverviewView.vue`
- Modify: `frontend/src/views/ContainerComparisonView.vue`
- Modify: `frontend/src/styles-dashboard.css`
- Modify: `frontend/src/styles-responsive.css`

- [ ] **Step 1: 补充“怎么查看”提示和当前范围**

  在两个页面标题下增加第一步/第二步提示，日期或货柜改变只更新表单，点击“查看结果”后才发起请求。

- [ ] **Step 2: 清理页面内跨菜单入口**

  删除总览页导入记录链接、货柜详情跳转和场景切换；对比页货柜行只展示数据，不跳转详情页。

- [ ] **Step 3: 调整空态和错误恢复**

  空数据说明当前日期范围无销售数据并提示调整日期；失败状态提供“重新查询”；日期错误阻止请求并给出修正方法。

- [ ] **Step 4: 响应式检查**

  确认 375px 下筛选控件单列、货柜结果卡片不横向滚动，桌面端首屏先显示结论再显示趋势和折叠数据。

### Task 5: 重构货柜详情和数据导入页面

**Files:**
- Modify: `frontend/src/views/ContainerView.vue`
- Modify: `frontend/src/views/ImportView.vue`

- [ ] **Step 1: 统一货柜详情入口和筛选提交**

  删除详情页内部的总览切换、返回总览、前往导入等跨菜单入口；货柜、日期选择只在点击“查看结果”后查询。

- [ ] **Step 2: 调整详情信息层级**

  首屏保留货柜名称、周期、销量、销售额、平均每件售价和主要等级；回款、费用、明细、计算说明、来源追溯放入默认收起区。

- [ ] **Step 3: 统一导入流程文案**

  将导入页改为“选择结算单 → 开始导入 → 查看结果”，显示成功文件数、成功数据条数、重复数据条数和问题条数；删除进入分析页的按钮。

- [ ] **Step 4: 验证导入和详情状态**

  运行构建，并通过现有 API 客户端测试覆盖导入、问题明细和详情数据的类型兼容。

### Task 6: 全中文扫描与交互一致性修复

**Files:**
- Modify: `frontend/src/AppShell.vue`
- Modify: `frontend/src/views/*.vue`
- Modify: `frontend/src/components/*.vue`
- Modify: `frontend/src/styles*.css`

- [ ] **Step 1: 扫描可见英文**

  使用 `rg -n` 检查模板文本、`aria-label`、标题、按钮和状态；逐项删除英文装饰和专业英文词，保留业务等级代码及文件名/接口数据例外。

- [ ] **Step 2: 扫描跨菜单路由**

  枚举所有 `RouterLink`、`router.push`、`router.replace` 和可点击列表，确认只有 AppShell 菜单承载一级页面跳转；当前页内部不得跳转其他菜单。

- [ ] **Step 3: 扫描自动查询事件**

  确认日期、货柜和排序控件不会绑定 `refresh`/`load`；只有表单提交或明确的当前页重试按钮可以触发查询。

- [ ] **Step 4: 运行静态验收测试**

  运行 `node --import tsx frontend/tests/farmer-ui-copy.test.ts`，预期通过。

### Task 7: 完整验证与视觉伴侣验收

**Files:**
- Modify: `docs/superpowers/specs/2026-09-09-farmer-ui-reconstruction-design.md`（如验收结果需要补充）
- Create: `docs/superpowers/notes/2026-09-09-farmer-ui-acceptance.md`

- [ ] **Step 1: 运行前端验证**

  运行 `npm --prefix frontend run build` 和全部前端测试，记录退出码和通过数量。

- [ ] **Step 2: 运行后端回归**

  运行 `.venv/bin/python -m pytest backend/tests -q --basetemp=backend/.pytest-tmp`，确认本轮未改变后端行为。

- [ ] **Step 3: 启动实际应用**

  使用现有 `start.sh` 或等价命令启动后端和前端，将视觉检查入口固定在 `http://127.0.0.1:53001`，确认四个页面都可打开。

- [ ] **Step 4: 做三种视口检查**

  检查 1440×900、768×1024、375×812 下无横向滚动、控件无遮挡、折叠区默认关闭、提示清晰且菜单入口唯一。

- [ ] **Step 5: 邀请果农体验并记录反馈**

  让体验者完成查看总销售额、比较两个货柜、查看指定货柜均价、导入结算单四项任务，记录停顿和误操作。

- [ ] **Step 6: 通过视觉伴侣做最终确认**

  在视觉伴侣端口 53001 展示实际界面，确认中文文案、菜单层级和移动端布局；把结果写入验收记录，不在未确认时宣称完成。
