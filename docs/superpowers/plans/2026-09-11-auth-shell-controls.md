# Auth And Shell Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 精简认证门户，并增加可选 30 天免登录、桌面侧栏收起、品牌图标返回销售总览和顶部本地时间。

**Architecture:** 登录请求新增向后兼容的 `remember_me` 布尔字段，后端同时控制服务端会话与 HttpOnly Cookie 的 7/30 天有效期。工作台外壳在现有 `AppShell.vue` 上增加可持久化的侧栏状态和浏览器本地时钟，不改变移动端底部导航。

**Tech Stack:** FastAPI、Pydantic、SQLAlchemy、Vue 3、Vue Router、TypeScript、Lucide、pytest、node:test。

---

### Task 1: 登录会话支持 7/30 天期限

**Files:**
- Modify: `backend/tests/test_auth_api.py`
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/auth.py`
- Modify: `backend/app/api/auth.py`

- [x] **Step 1: 写后端失败测试**

在 `backend/tests/test_auth_api.py` 增加参数化用例，分别发送省略 `remember_me` 和 `remember_me=true` 的登录请求，断言 Cookie `Max-Age` 与数据库 `expires_at - created_at` 分别约为 7 天和 30 天。

- [x] **Step 2: 运行测试并确认失败原因**

Run: `.venv/bin/python -m pytest backend/tests/test_auth_api.py -q --basetemp=backend/.pytest-tmp-auth-shell`

Expected: 30 天分支失败，因为 `LoginRequest` 尚未接收 `remember_me`，登录仍固定创建 7 天会话。

- [x] **Step 3: 最小实现登录期限选择**

实现以下契约：

```python
class LoginRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=128)
    remember_me: bool = False
```

`create_session` 与 `set_session_cookie` 接收同一个 `session_days` 参数；登录接口用 `30 if payload.remember_me else 7`，注册继续使用默认 7 天。Cookie 和数据库到期时间必须一致。

- [x] **Step 4: 运行后端定向测试**

Run: `.venv/bin/python -m pytest backend/tests/test_auth_api.py -q --basetemp=backend/.pytest-tmp-auth-shell`

Expected: PASS。

### Task 2: 精简认证门户并增加复选框

**Files:**
- Modify: `frontend/tests/auth-client.test.ts`
- Modify: `frontend/tests/auth-portal.test.mjs`
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/views/LoginView.vue`
- Modify: `frontend/src/components/AuthPortal.vue`
- Modify: `frontend/src/styles-auth.css`

- [x] **Step 1: 写前端失败测试**

扩展认证测试，要求登录请求发送 `remember_me`，登录页存在默认未勾选的“30 天内免登录”复选框，并要求 `AuthPortal.vue` 不再包含三组能力说明和公开演示提示。

- [x] **Step 2: 运行测试并确认失败原因**

Run: `node --experimental-strip-types --test frontend/tests/auth-client.test.ts frontend/tests/auth-portal.test.mjs`

Expected: FAIL，缺少 `remember_me`、复选框仍不存在且门户能力文案仍存在。

- [x] **Step 3: 最小实现登录界面与请求**

`LoginPayload` 增加 `rememberMe?: boolean`，客户端映射为 `remember_me: payload.rememberMe === true`。登录表单状态增加 `rememberMe: false`，使用原生 checkbox 与可点击 label；删除 `portal-values`、`portal-demo` 及对应未使用 imports/CSS，保留左侧品牌主视觉和事实摘要。

- [x] **Step 4: 运行前端认证测试**

Run: `node --experimental-strip-types --test frontend/tests/auth-client.test.ts frontend/tests/auth-portal.test.mjs`

Expected: PASS。

### Task 3: Header 导航、时钟与侧栏收起

**Files:**
- Create: `frontend/src/utils/shellHeader.ts`
- Create: `frontend/tests/shell-header.test.ts`
- Modify: `frontend/src/AppShell.vue`
- Modify: `frontend/src/styles-shell.css`

- [x] **Step 1: 写 header 失败测试**

新增纯逻辑测试，覆盖侧栏持久化值解析、桌面日期/星期/时间格式；扩展静态守卫，要求品牌图标链接 `/overview`、收起按钮具有 `aria-expanded`/`aria-label`，并渲染语义化 `<time>`。

- [x] **Step 2: 运行测试并确认失败原因**

Run: `node --experimental-strip-types --test frontend/tests/shell-header.test.ts frontend/tests/auth-portal.test.mjs`

Expected: FAIL，因为 header 工具与对应控件尚不存在。

- [x] **Step 3: 实现纯逻辑与外壳交互**

`shellHeader.ts` 提供：

```ts
export const SIDEBAR_STORAGE_KEY = 'fruits-ana:sidebar-collapsed'
export function restoreSidebarCollapsed(value: string | null): boolean
export function formatHeaderClock(value: Date): { date: string; time: string; datetime: string }
```

`AppShell.vue` 安全读取/写入 `localStorage`，每 30 秒刷新本地时间，并在卸载时清理定时器。品牌图标用 `RouterLink` 指向 `/overview`；收起按钮仅桌面显示，使用 Lucide 的展开/收起图标及明确 tooltip。

- [x] **Step 4: 实现响应式布局**

桌面侧栏由 220px 收成 72px，仅保留居中的导航图标并隐藏分组文字和脚注；≤820px 继续单列布局并隐藏收起按钮。桌面时间显示日期、星期和时分，≤820px 隐藏日期只留时分，所有图标按钮保持至少 44×44px。

- [x] **Step 5: 运行 header 定向测试**

Run: `node --experimental-strip-types --test frontend/tests/shell-header.test.ts frontend/tests/shell-tabs.test.ts frontend/tests/responsive-guards.test.mjs`

Expected: PASS。

### Task 4: 决策记录与完整验证

**Files:**
- Modify: `docs/DECISIONS.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/HANDOFF.md`
- Modify: `docs/TODO.md`

- [x] **Step 1: 同步文档**

新增 ADR 记录 7 天默认会话与可选 30 天会话；架构文档同步登录数据流和工作台外壳行为；HANDOFF/TODO 记录本轮改动与实测结果。

- [x] **Step 2: 运行完整验证**

```bash
.venv/bin/python -m pytest backend/tests -q --basetemp=backend/.pytest-tmp
npm --prefix frontend run test
npm --prefix frontend run typecheck
npm --prefix frontend run build
```

Expected: 全部退出码 0；若发现并发 pytest 干扰，改用独立 `--basetemp` 复测并如实记录。

实测：前端 `npm test` / `typecheck` / `build` 全部退出码 0；后端 236 项 pytest 通过；
Playwright + Chromium 完成登录页与桌面/移动端外壳验收，临时账号已清理。见
`docs/HANDOFF.md` Test Status。

- [x] **Step 3: 检查范围**

运行 `git diff --check` 与定向 `git diff`，确认没有改动 `/preview` 演示数据、数据库 schema、依赖或现有品牌资产。当前工作区含其他会话的未提交品牌化改动，未经用户要求不创建包含这些改动的 Git 提交。
