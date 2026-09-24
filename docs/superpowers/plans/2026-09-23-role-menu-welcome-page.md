# 角色菜单默认入口与欢迎页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 登录后默认进入角色已分配的第一个可用菜单，所有业务页签均可关闭，并在无菜单或页签全部关闭时显示极简欢迎页。

**Architecture:** 认证层用角色 `menus` 与权限共同计算默认业务路由；页签层不再固定 `/overview`，而把 `/welcome` 作为无业务页签时的临时空状态。欢迎页是受登录保护、无需业务权限的独立 Vue 视图，打开业务菜单后不与业务页签并存。

**Tech Stack:** Vue 3、Vue Router、TypeScript、Node test、Vite。

**Scope:** 仅修改用户端前端认证、菜单、路由、页签逻辑及相关测试；不改后端 API、数据库、依赖和管理端。

**Risk:** 当前 `AppShell.vue` 同时负责导航、页签和 header，必须避免欢迎页被当作普通业务菜单，也要避免无菜单用户在登录页与受保护路由之间循环跳转。

---

### Task 1: 锁定角色菜单默认入口

**Files:**
- Modify: `frontend/src/auth.ts`
- Modify: `frontend/src/main.ts`
- Modify: `frontend/src/utils/shellMenu.ts`
- Test: `frontend/tests/auth-menu.test.ts`
- Test: `frontend/tests/shell-menu.test.ts`

- [x] **Step 1: 运行失败测试**

Run:

```bash
node --experimental-strip-types --test tests/auth-menu.test.ts tests/shell-menu.test.ts
```

Expected: 旧实现会因默认入口仍依赖硬编码权限顺序、未分配菜单仍显示而失败。

- [x] **Step 2: 实现菜单过滤与默认入口**

要求：

```text
firstAllowedPath(permissions, menus)
  → 只考虑已分配、已启用、路由已登记且权限满足的菜单
  → 按业务端现有导航槽位顺序选择第一个
  → 无可用菜单时返回 /welcome
```

主导航和“更多”只显示角色分配的菜单；手工录单等辅助页签仍保留本地命名能力。

- [x] **Step 3: 运行定向测试**

Run:

```bash
node --experimental-strip-types --test tests/auth-menu.test.ts tests/shell-menu.test.ts
```

Expected: 全部通过。

### Task 2: 将页签状态改为可全部关闭

**Files:**
- Modify: `frontend/src/utils/shellTabs.ts`
- Modify: `frontend/src/AppShell.vue`
- Test: `frontend/tests/shell-tabs.test.ts`

- [x] **Step 1: 扩充失败测试**

覆盖：

```text
同一路由重复打开只保留一个页签
第一个业务页签可以关闭
关闭最后一个业务页签返回 /welcome
欢迎页只在业务页签为空时出现
打开业务页后移除欢迎占位页签
```

- [x] **Step 2: 运行失败测试**

Run:

```bash
node --experimental-strip-types --test tests/shell-tabs.test.ts
```

Expected: 固定 `/overview` 首页和不可关闭逻辑导致失败。

- [x] **Step 3: 实现欢迎页空状态页签**

要求：

```text
WELCOME_PATH = /welcome
业务页签全部可关闭
tabs 为空时 nextActivePath 返回 /welcome
进入 /welcome 时页签栏显示单个“欢迎访问”占位
进入业务路由时欢迎占位自动移除
```

- [x] **Step 4: 运行定向测试**

Run:

```bash
node --experimental-strip-types --test tests/shell-tabs.test.ts
```

Expected: 全部通过。

### Task 3: 新增极简欢迎页

**Files:**
- Create: `frontend/src/views/WelcomeView.vue`
- Modify: `frontend/src/main.ts`
- Test: `frontend/tests/welcome-view.test.mjs`

- [x] **Step 1: 写欢迎页结构测试**

断言页面包含：品牌标识、用户名问候、极简分隔线、有菜单提示、无菜单授权提示；不包含快捷卡片或数据指标。

- [x] **Step 2: 运行失败测试**

Run:

```bash
node --experimental-strip-types --test tests/welcome-view.test.mjs
```

Expected: `WelcomeView.vue` 尚不存在而失败。

- [x] **Step 3: 实现页面与路由**

新增受登录保护但不要求业务权限的 `/welcome`。页面复用 `BrandMark`、`currentUser` 与现有颜色变量，桌面保持宽松留白，移动端不产生横向滚动。

- [x] **Step 4: 运行定向测试和类型检查**

Run:

```bash
node --experimental-strip-types --test tests/welcome-view.test.mjs
npm run typecheck
```

Expected: 两条命令退出码均为 0。

### Task 4: 集成验证与文档同步

**Files:**
- Modify: `docs/HANDOFF.md`
- Modify: `docs/TODO.md`

- [ ] **Step 1: 运行完整前端验证**

当前结果：前端全量测试 240 项通过，`typecheck` 通过。本任务实现后的首次 `build` 通过；
最终复验被共享工作区另一项「默认错误页」在途改动缺少 `views/ErrorView.vue` 阻断。

Run:

```bash
npm --prefix frontend run test
npm --prefix frontend run typecheck
npm --prefix frontend run build
```

Expected: 全部退出码为 0。

- [x] **Step 2: 检查改动边界**

Run:

```bash
git diff --check
git status --short
```

Expected: 无空白错误；未覆盖工作区既有结算单列表、导出和后端改动。

- [x] **Step 3: 同步交接文档**

在 `HANDOFF.md` 记录行为、根因和验证证据；在 `TODO.md` 留下已完成摘要。本轮不自动提交 Git，等待用户明确要求。
