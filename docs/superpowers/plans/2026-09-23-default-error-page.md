# Default Error Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为现有 Vue 系统增加分层触发的默认错误页、统一错误状态和静态部署兜底。

**Architecture:** `utils/errorRecovery.ts` 负责纯错误分类、状态持久化与浏览器事件；`api/client.ts` 将请求元数据和 Request ID 交给分类器；`main.ts` 统一接收 API、路由和运行时异常并导航到 `/error`。`ErrorView.vue` 只读取本地错误状态，不发 API 请求；静态 HTML 处理 Vue 无法启动的部署级故障。

**Tech Stack:** Vue 3、Vue Router 4、TypeScript 5.6、node:test、现有 CSS tokens、Lucide Vue。

---

### Task 1: 错误分类与状态模型

**Files:**
- Create: `frontend/src/utils/errorRecovery.ts`
- Create: `frontend/tests/error-recovery.test.ts`

- [ ] **Step 1: 写失败测试**：覆盖 GET 503、网络、超时、403、显式 404；确认 POST 503、inline 模式、AbortError 不进入错误页。
- [ ] **Step 2: 运行 `node --experimental-strip-types --test tests/error-recovery.test.ts`，确认因模块不存在而失败。**
- [ ] **Step 3: 实现 `classifyApiFailure`、`createFatalErrorState`、安全来源路径、带有效期的 sessionStorage 读写和浏览器事件派发。**
- [ ] **Step 4: 重跑定向测试并保持通过。**

### Task 2: API 错误元数据与统一上报

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/tests/auth-client.test.ts`

- [ ] **Step 1: 写失败测试**：HTTP 503 应产生带 `status / requestId / method / url / kind` 的 `ApiError`；网络错误应标记 `network`；写请求失败不产生 fatal 事件。
- [ ] **Step 2: 运行定向测试，确认新增断言失败。**
- [ ] **Step 3: 扩展 `ApiError` 和 `RequestOptions`，从 `X-Request-ID` 取编号，并在 catch 中调用错误分类器；通知与问题明细读取使用 inline 模式。**
- [ ] **Step 4: 重跑 API 客户端相关测试。**

### Task 3: 路由、权限和全局运行时异常

**Files:**
- Modify: `frontend/src/main.ts`
- Modify: `frontend/src/AppShell.vue`
- Create: `frontend/tests/error-routing.test.mjs`

- [ ] **Step 1: 写失败源码测试**：要求存在 `/error`、catch-all 404、403 状态保存、路由二次加载失败、Vue `errorHandler`、`error` 与 `unhandledrejection` 监听。
- [ ] **Step 2: 运行定向测试，确认缺少路由和处理器而失败。**
- [ ] **Step 3: 注册错误路由和 catch-all；会话恢复故障转错误页、401 转登录、403 转错误页；统一监听 fatal/auth 事件。**
- [ ] **Step 4: AppShell 在有用户时保留工作台并显示错误页页签，无用户时让 ErrorView 独立渲染；重跑测试。**

### Task 4: 当前系统错误页与静态兜底

**Files:**
- Create: `frontend/src/views/ErrorView.vue`
- Create: `frontend/src/styles-error.css`
- Create: `frontend/public/error-static.html`
- Create: `frontend/tests/error-page.test.mjs`

- [ ] **Step 1: 写失败源码测试**：错误页必须无 API import，具有 alert、重试、返回首页、折叠详情；静态页不得引用外部脚本或样式。
- [ ] **Step 2: 运行定向测试，确认文件缺失而失败。**
- [ ] **Step 3: 按已批准视觉稿实现 ErrorView，使用当前 tokens 和 Lucide 图标，支持 server/network/timeout/route/runtime/not-found/forbidden 文案。**
- [ ] **Step 4: 实现自包含静态兜底页，重跑测试和 typecheck。**

### Task 5: 文档、整体验证与浏览器验收

**Files:**
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DECISIONS.md`
- Modify: `docs/HANDOFF.md`
- Modify: `docs/TODO.md`

- [ ] **Step 1: 记录 ADR-040、错误流和静态 Nginx 配置示例。**
- [ ] **Step 2: 运行 `npm --prefix frontend run test`。**
- [ ] **Step 3: 运行 `npm --prefix frontend run typecheck`。**
- [ ] **Step 4: 运行 `npm --prefix frontend run build`。**
- [ ] **Step 5: 用浏览器验证 `/error`、未知路由、桌面 1440px 和移动 390px，确认无 console error 和横向溢出。**
- [ ] **Step 6: 检查 `git diff`，确认未覆盖工作区既有修改。**

> Git commit 步骤未纳入本计划：当前用户未授权创建或改写 Git 历史。
