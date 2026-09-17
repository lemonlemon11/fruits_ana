# 计划：数据导入与手工录单入口整合（方案 C）

对应 spec：`docs/superpowers/specs/2026-09-15-import-entry-merge-选择方式页-design.md`

## 步骤

1. **纯逻辑工具**
   - `frontend/src/utils/entryHub.ts`：批次状态判定（成功 / 需关注 / 失败）、状态说明文案、
     `recentBatches()`。
   - `frontend/src/utils/entryDraft.ts`：草稿读写清理、`hasEntryDraftContent()`、
     `draftRelativeTime()`、`describeEntryDraft()`。
2. **路由与导航**
   - `main.ts` 增加 `/entry-hub`。
   - `AppShell.vue`：导航项合并为「录单 / 导入」+`matches`，高亮判定统一走 `isNavActive`，
     页签元数据补「文件导入 / 手工录单」，移动端底部导航同步。
3. **hub 页面**：新增 `frontend/src/views/EntryHubView.vue`，
   两张方式卡片 + 最近导入 + 未完成的手工单，权限控制手工录单区块。
4. **录单页草稿**：`EntryView.vue` 接入草稿（防抖写入 / `?draft=1` 回填 / 保存后清理）。
5. **测试**：新增 `entry-hub.test.ts`、`entry-draft.test.ts`；更新
   `farmer-ui-copy.test.mjs` 的导航断言。
6. **验证**：`npm --prefix frontend run test|typecheck|build`、后端 `pytest`、
   `npm --prefix frontend run build` 后 Playwright 实测（桌面 + 390px）。
7. **收尾**：更新 `docs/HANDOFF.md` / `docs/TODO.md`，必要时记 `DECISIONS.md`。

## 风险

- `AppShell.vue` 导航改动影响页签与高亮，需回归 `shell-tabs` / `farmer-ui-copy` 用例。
- 草稿为本地存储，跨设备不可见，需在文档中写清口径。
