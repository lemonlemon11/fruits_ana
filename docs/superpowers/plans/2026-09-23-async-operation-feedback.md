# Async Operation Feedback Implementation Plan

**Goal:** 统一补齐长耗时前端操作的等待反馈、防重复点击和失败提示。

**Architecture:** 使用一个独立文件下载工具处理 Blob 与文件名；页面保留各自的局部 busy 状态；共享表格和下拉组件只增加通用状态 props，不改变现有调用契约。

**Tech Stack:** Vue 3、TypeScript、Element Plus、node:test、Vite

---

### Task 1: 文件下载工具与导出状态

- [ ] 为文件名解析、凭证请求和错误响应编写失败测试。
- [ ] 新增 `frontend/src/utils/fileDownload.ts` 并使测试通过。
- [ ] 将结算单列表、单行 Excel/PDF、手工模板和问题 CSV 改为异步下载按钮。
- [ ] 覆盖桌面与移动端的 busy、成功和失败提示。

### Task 2: 排序与下拉查询状态

- [ ] 扩展 `DataTable` 测试，要求 `sortBusy`、`aria-busy` 和禁用排序表头。
- [ ] 扩展 `SearchableSelect` 测试，要求 loading prop 和请求期间禁用。
- [ ] 在数据明细、总览和结算单详情接入局部状态。

### Task 3: 录单与复核状态

- [ ] 扩展录单测试，要求“暂存中 / 保存中”，并禁止暂存失败显示成功。
- [ ] 扩展导入复核测试，覆盖切换、还原、保存和提交文案。
- [ ] 实现最小状态机并保持原有提交逻辑不变。

### Task 4: 品牌对比选择状态

- [ ] 扩展选择器/品牌对比测试，要求更新期间禁用重复操作。
- [ ] 接入 `loadingComparison` 并显示局部状态。

### Task 5: 回归与交付

- [ ] 运行相关定向测试。
- [ ] 运行 `npm --prefix frontend run test`。
- [ ] 运行 `npm --prefix frontend run typecheck`。
- [ ] 运行 `npm --prefix frontend run build`。
- [ ] 更新 `docs/HANDOFF.md` 与 `docs/TODO.md` 的本轮状态和验证结果。
