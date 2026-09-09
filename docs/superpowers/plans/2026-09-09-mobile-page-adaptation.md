# 移动端页面适配 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让 375px/390px 手机端优先展示等级经营与货柜表现，核心判断不依赖页面级横向滚动。

**Architecture:** 桌面端保留货柜横向矩阵；移动端在 `ContainerComparison` 使用独立卡片模板，避免桌面表格压缩到手机。壳层由 `styles-shell.css` 负责，页面响应式规则只处理内容布局；明细表保留局部横滑并明确其辅助属性。

**Tech Stack:** Vue 3、TypeScript、Vite、Scoped CSS、Playwright CLI。

---

### Task 1: 货柜对比移动卡片

**Files:** `frontend/src/components/ContainerComparison.vue`

- [x] 保留桌面矩阵和图表。
- [x] 增加移动端货柜卡片：销售额、销量、均价、贡献率、A/B/C 结构。
- [x] 等级明细使用 `details` 单卡展开，入口和“查看单柜”保持 44px。

### Task 2: 响应式规则收敛

**Files:** `frontend/src/styles-responsive.css`, `frontend/src/components/GradePieChart.vue`

- [x] 移除与新移动壳层重复的旧侧栏规则。
- [x] 页面级隐藏横向溢出，保留表格局部滚动。
- [x] 375px 下饼图改上下布局，避免 136px 图形与图例挤压。
- [x] 增加底部安全区内边距。

### Task 3: 导入页移动交互

**Files:** `frontend/src/views/ImportView.vue`

- [x] 整个上传区支持点击、Enter、Space 打开文件选择器。
- [x] 保持问题明细为展开后的局部横滑表。

### Task 4: 验证

- [ ] `npm run build`
- [ ] 前端分析客户端测试
- [ ] 后端 pytest
- [ ] Playwright 375px/390px 检查页面级宽度、菜单、主题和关键页面。
