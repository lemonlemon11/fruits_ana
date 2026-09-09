# 果级经营台壳层与认证改版实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有水果分析业务不回归的前提下，完成固定 Header、可收起侧栏、紧凑工作台布局、主题迁移和邮箱密码认证。

**Architecture:** 后端新增独立 `auth` 模块：`User` 保存 Argon2 哈希密码，`UserSession` 保存服务端会话 Token 的 SHA-256 哈希；浏览器只持有 HttpOnly/SameSite=Lax Cookie。前端拆分公共认证布局与登录后业务布局，路由守卫统一调用 `/api/auth/me`，业务 API 通过后端依赖强制登录。

**Tech Stack:** Vue 3、Vue Router 4、TypeScript、Vite、FastAPI、SQLAlchemy 2、SQLite、Pydantic、argon2-cffi、pytest、FastAPI TestClient。

---

## 文件结构与职责

### 后端

- Create: `backend/app/auth.py` — 密码哈希、会话 Token 生成/校验、当前用户依赖。
- Create: `backend/app/api/auth.py` — 注册、登录、当前用户、登出路由。
- Modify: `backend/app/models.py` — 新增 `User`、`UserSession`，唯一邮箱索引和会话索引。
- Modify: `backend/app/schemas.py` — 认证请求和非敏感用户响应 DTO。
- Modify: `backend/app/main.py` — 注册认证路由。
- Modify: `backend/app/api/analytics.py`、`backend/app/api/imports.py`、`backend/app/api/exports.py` — 为业务 API 注入 `require_current_user`。
- Modify: `backend/pyproject.toml` — 增加 `argon2-cffi` 运行依赖。
- Create: `backend/tests/test_auth_api.py` — 认证 API 与会话行为测试。
- Modify: `backend/tests/test_analytics_api.py`、`backend/tests/test_imports_api.py`、`backend/tests/test_exports.py` — 明确未登录 401、登录后保持原契约。

### 前端

- Create: `frontend/src/auth.ts` — 当前用户类型、认证状态、登录/注册/登出方法。
- Create: `frontend/src/views/LoginView.vue` — 独立登录页。
- Create: `frontend/src/views/RegisterView.vue` — 独立注册页。
- Create: `frontend/src/styles-auth.css` — 登录/注册视觉层和响应式样式。
- Modify: `frontend/src/api/client.ts` — 统一处理认证 API、`credentials: 'include'` 和 401 错误。
- Modify: `frontend/src/api/types.ts` — 增加 `AuthUser`、认证请求/响应类型。
- Modify: `frontend/src/main.ts` — 认证路由、业务路由元数据、异步路由守卫。
- Modify: `frontend/src/AppShell.vue` — 固定 Header、Header 主题切换、用户菜单、桌面/移动导航状态和收起状态持久化。
- Modify: `frontend/src/styles.css`、`frontend/src/styles-shell.css`、`frontend/src/styles-responsive.css` — 固定 Header、单主滚动区、紧凑间距和认证页外观引用。
- Modify: `frontend/tests/sfc-build-entry.ts` — 纳入认证视图编译检查。
- Create: `frontend/tests/auth-client.test.ts` — 认证 API 客户端和错误处理测试。
- Create: `frontend/tests/router-auth.test.ts` — 路由守卫决策测试；不启动真实浏览器。

---

## Task 1: 建立后端认证模型和密码/会话服务

**Files:**
- Modify: `backend/pyproject.toml`
- Modify: `backend/app/models.py`
- Modify: `backend/app/schemas.py`
- Create: `backend/app/auth.py`

- [ ] **Step 1: 增加运行依赖**

在 `backend/pyproject.toml` 的运行依赖中加入：

```toml
"argon2-cffi>=23.1",
```

安装依赖并确认导入成功：

```powershell
python -m pip install -e .
python -c "from argon2 import PasswordHasher; print('argon2 ok')"
```

预期输出包含 `argon2 ok`。

- [ ] **Step 2: 写认证模型**

在 `backend/app/models.py` 增加：

```python
class User(Base):
    __tablename__ = "user"
    __table_args__ = (Index("ux_user_email", "email", unique=True),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    display_name: Mapped[str] = mapped_column(String(80), nullable=False)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(512), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    sessions: Mapped[list[UserSession]] = relationship(back_populates="user", cascade="all, delete-orphan")


class UserSession(Base):
    __tablename__ = "user_session"
    __table_args__ = (Index("ix_user_session_token_hash", "token_hash", unique=True),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    user: Mapped[User] = relationship(back_populates="sessions")
```

把 `User` 和 `UserSession` 加入 `__all__`，并确认 `ForeignKey` 已从 SQLAlchemy 导入。

- [ ] **Step 3: 写认证 DTO**

在 `backend/app/schemas.py` 增加：

```python
class UserRead(BaseModel):
    id: int
    display_name: str
    email: str


class RegisterRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=80)
    email: str = Field(min_length=5, max_length=320)
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: str = Field(min_length=5, max_length=320)
    password: str = Field(min_length=1, max_length=128)
```

响应包装统一使用 `{"user": UserRead(...)}`，绝不返回 `password_hash`。

- [ ] **Step 4: 实现认证服务**

`backend/app/auth.py` 必须提供以下稳定函数：

```python
SESSION_COOKIE = "fruit_session"
SESSION_DAYS = 7

def normalize_email(value: str) -> str: ...
def hash_password(password: str) -> str: ...
def verify_password(password: str, password_hash: str) -> bool: ...
def create_session(db: Session, user: User) -> str: ...
def get_current_user(request: Request, db: Session) -> User | None: ...
def require_current_user(request: Request, db: Session = Depends(get_db)) -> User: ...
def revoke_session(db: Session, raw_token: str | None) -> None: ...
```

实现约束：

- `normalize_email` 使用 `strip().lower()`。
- Session Token 使用 `secrets.token_urlsafe(32)`，数据库只存 `sha256(raw_token)`。
- 过期会话视为无效，并在读取时删除。
- `require_current_user` 对缺失、过期、禁用用户统一抛出 `HTTPException(401, "请先登录")`。
- Cookie 设置 `httponly=True`、`samesite="lax"`、`max_age=SESSION_DAYS * 86400`；`secure` 由环境变量 `FRUIT_ANALYSIS_COOKIE_SECURE` 控制，默认开发环境为 `False`。

- [ ] **Step 5: 运行模型导入检查**

```powershell
python -c "from app.models import User, UserSession; from app.auth import hash_password, verify_password; h=hash_password('password123'); assert verify_password('password123', h); print('auth primitives ok')"
```

预期输出 `auth primitives ok`。

## Task 2: 实现认证 API 并先让认证测试通过

**Files:**
- Create: `backend/app/api/auth.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_auth_api.py`

- [ ] **Step 1: 写失败测试**

`backend/tests/test_auth_api.py` 至少覆盖以下行为：

```python
def test_register_creates_user_and_session(client): ...
def test_register_rejects_duplicate_email(client): ...
def test_login_rejects_wrong_password_without_account_enumeration(client): ...
def test_me_and_logout_follow_session_lifecycle(client): ...
def test_business_api_requires_authentication(client): ...
```

具体断言：注册 `201` 且响应不含 `password_hash`；重复邮箱 `409`；错误密码和不存在邮箱都为 `401` 且 detail 相同；`/api/auth/me` 登录后 `200`、退出后 `401`。

- [ ] **Step 2: 运行测试确认失败**

```powershell
pytest backend/tests/test_auth_api.py -q
```

预期：因认证路由和 fixture 尚未实现而失败。

- [ ] **Step 3: 实现认证路由**

`backend/app/api/auth.py` 注册 `APIRouter(prefix="/api/auth")`，实现：

- `POST /register`：规范化邮箱、校验重复、哈希密码、写入用户、创建会话、设置 Cookie、返回 `201`。
- `POST /login`：查询用户、验证密码、更新 `last_login_at`、创建会话、设置 Cookie；失败统一 `401`。
- `GET /me`：依赖 `require_current_user`，返回用户信息。
- `POST /logout`：撤销 Cookie 对应会话并删除 Cookie，返回 `204`。

在 `main.py` 引入并 `include_router(auth_router)`。

- [ ] **Step 4: 配置测试 fixture**

在 `backend/tests/conftest.py` 增加函数级 `client` fixture：测试开始时删除测试 SQLite 文件、调用 `init_db()`，用 `TestClient(app)` 返回客户端；不删除用户数据之外的已有测试辅助逻辑。

- [ ] **Step 5: 运行认证测试确认通过**

```powershell
pytest backend/tests/test_auth_api.py -q
```

预期全部通过。

## Task 3: 保护业务 API 并验证现有契约不回归

**Files:**
- Modify: `backend/app/api/analytics.py`
- Modify: `backend/app/api/imports.py`
- Modify: `backend/app/api/exports.py`
- Modify: `backend/tests/test_analytics_api.py`
- Modify: `backend/tests/test_imports_api.py`
- Modify: `backend/tests/test_exports.py`

- [ ] **Step 1: 为每个业务路由加入依赖**

在三个 API 模块中导入 `require_current_user`，将路由函数增加参数：

```python
current_user: User = Depends(require_current_user)
```

不使用用户字段过滤现有查询，明确维持“所有登录用户共享经营数据”的 MVP 语义。

- [ ] **Step 2: 增加未登录 401 测试**

每个业务路由至少增加一个未登录请求断言 `response.status_code == 401`。

- [ ] **Step 3: 增加登录后回归断言**

测试先调用注册或登录，再请求原业务接口，验证状态码仍为 `200` 且现有响应字段保持不变。

- [ ] **Step 4: 运行后端完整测试**

```powershell
pytest backend/tests -q
```

预期现有测试和认证测试全部通过。

## Task 4: 建立前端认证客户端和路由守卫

**Files:**
- Create: `frontend/src/auth.ts`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/main.ts`
- Create: `frontend/tests/auth-client.test.ts`
- Create: `frontend/tests/router-auth.test.ts`

- [ ] **Step 1: 定义类型和 API 函数**

在 `frontend/src/api/types.ts` 增加：

```ts
export interface AuthUser { id: number; displayName: string; email: string }
export interface RegisterPayload { displayName: string; email: string; password: string }
export interface LoginPayload { email: string; password: string }
```

在 `client.ts` 增加：

```ts
export async function register(payload: RegisterPayload): Promise<AuthUser>
export async function login(payload: LoginPayload): Promise<AuthUser>
export async function getCurrentUser(): Promise<AuthUser>
export async function logout(): Promise<void>
```

所有 `fetch` 请求设置 `credentials: 'include'`；非 JSON 文件下载保持现有行为，不强行解析响应体。

- [ ] **Step 2: 实现认证状态**

`frontend/src/auth.ts` 导出响应式状态：

```ts
export const currentUser = ref<AuthUser | null>(null)
export const authReady = ref(false)
export async function restoreSession(): Promise<AuthUser | null> { ... }
export function setCurrentUser(user: AuthUser | null): void { ... }
```

密码不写入任何浏览器存储；只有当前用户非敏感信息保存在内存。

- [ ] **Step 3: 实现路由守卫**

为业务路由增加 `meta: { requiresAuth: true }`，认证路由增加 `meta: { guestOnly: true }`。`router.beforeEach` 逻辑：

1. 首次导航调用 `restoreSession()`。
2. 业务路由且无用户时跳转 `/login?redirect=<encodeURIComponent(fullPath)>`。
3. 认证页且已有用户时跳转 `/overview`。
4. 其他情况放行。

- [ ] **Step 4: 写客户端和守卫测试**

测试 fetch 携带 Cookie、注册/登录请求体映射、401 清除当前用户、业务路由跳转登录、带 redirect 登录回跳。

- [ ] **Step 5: 运行前端测试和 TypeScript 构建**

```powershell
npm --prefix frontend run build
node --test frontend/tests/auth-client.test.ts frontend/tests/router-auth.test.ts
```

预期构建成功、测试全部通过。

## Task 5: 创建独立登录/注册页面

**Files:**
- Create: `frontend/src/views/LoginView.vue`
- Create: `frontend/src/views/RegisterView.vue`
- Create: `frontend/src/styles-auth.css`
- Modify: `frontend/src/main.ts`
- Modify: `frontend/tests/sfc-build-entry.ts`

- [ ] **Step 1: 建立统一认证页结构**

两个页面共享 `auth-page`、`auth-brand`、`auth-card`、`auth-field`、`form-message` 类；登录字段为邮箱/密码，注册字段为显示名称/邮箱/密码/确认密码。

- [ ] **Step 2: 实现登录行为**

提交前校验邮箱和非空密码；提交时禁用按钮并显示“正在登录…”；成功调用 `setCurrentUser`，按 query `redirect` 回跳，否则进入 `/overview`；失败在表单内显示中文错误。

- [ ] **Step 3: 实现注册行为**

校验显示名称非空、邮箱格式、密码至少 8 位、两次密码一致；成功调用 `register`，建立当前用户并进入 `/overview`；服务端 `409` 显示邮箱已注册提示。

- [ ] **Step 4: 添加认证页样式**

桌面端使用价值说明栏 + 表单卡片两列布局，移动端单列；使用现有语义颜色 Token；表单 label 显式存在；焦点轮廓、错误状态和 reduced-motion 均可见。

- [ ] **Step 5: 更新 SFC 入口并构建**

把 Login/Register 组件加入 `sfc-build-entry.ts`，执行：

```powershell
npm --prefix frontend run build
```

预期 Vite 生产构建成功。

## Task 6: 重做业务壳层和紧凑滚动布局

**Files:**
- Modify: `frontend/src/AppShell.vue`
- Modify: `frontend/src/styles.css`
- Modify: `frontend/src/styles-shell.css`
- Modify: `frontend/src/styles-responsive.css`

- [ ] **Step 1: 把 Header 从移动专属升级为全局固定 Header**

Header 结构包含：侧栏开关、品牌、当前路由标题、主题切换、当前用户、退出按钮；使用 `position: sticky; top: 0; z-index`，高度约 56px。移动端保留菜单按钮，但不再另设重复品牌 Header。

- [ ] **Step 2: 迁移主题切换**

删除桌面侧栏里的主题按钮组；Header 使用紧凑 select 或三段式按钮，保留三套主题、`aria-pressed`/label 和 localStorage。

- [ ] **Step 3: 持久化侧栏状态**

从 `localStorage` 读取 `fruit-analysis-sidebar-collapsed`，切换时写回；收起态保留编号和 `title`/`aria-label`，展开按钮本身仍有 44px 最小点击区域。

- [ ] **Step 4: 接入用户菜单和退出**

Header 显示用户 display name/email；退出调用 API、清理内存状态并跳转 `/login`。服务端失败时仍清理前端状态，避免用户卡在已失效页面。

- [ ] **Step 5: 压缩布局和滚动容器**

桌面端让 Header/侧栏保持可见，仅主内容区域滚动；统一 `--space-1: 4px`、`--space-2: 8px`、`--space-3: 12px`、`--space-4: 16px`；页面间距优先使用 12/16px，卡片内边距优先使用 10/12px；为 Header 高度预留 `scroll-margin-top`，避免锚点和首屏内容被遮挡。

- [ ] **Step 6: 运行前端构建**

```powershell
npm --prefix frontend run build
```

预期成功且无 TypeScript/Vue 模板错误。

## Task 7: 测试、浏览器验收和质量收尾

**Files:**
- Modify: `frontend/tests/*.test.ts` only when a regression assertion is required.
- Create: `docs/superpowers/verification/2026-09-09-fruit-platform-shell-auth.md` — 验证记录。

- [ ] **Step 1: 运行后端全量测试**

```powershell
pytest backend/tests -q
```

必须记录实际通过数；如果失败，先修复根因，不通过扩大超时掩盖问题。

- [ ] **Step 2: 运行前端构建和 Node 测试**

```powershell
npm --prefix frontend run build
node --test frontend/tests/*.test.ts
```

- [ ] **Step 3: 启动本地服务**

后端：

```powershell
python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

前端：

```powershell
npm --prefix frontend run dev -- --host 127.0.0.1 --port 52766
```

- [ ] **Step 4: 浏览器手工验收**

按顺序验证：

1. 访问 `/overview`，确认未登录跳 `/login`。
2. 注册新邮箱，确认进入总览且刷新后仍有登录态。
3. 检查 Header 固定、主题切换、侧栏收起/展开、用户信息和退出。
4. 登出后重新访问 `/containers`，确认再次跳登录。
5. 在桌面宽屏、窄桌面和移动宽度检查无整页横向滚动、无 Header 遮挡。

- [ ] **Step 5: 写验证记录**

记录命令、实际输出、浏览器视口和任何已知限制；不得把未运行的命令写成通过。

## 技术风险与处理顺序

1. 先完成认证模型/服务和后端测试，再保护业务 API，避免前端先改后端未就绪。
2. 路由守卫与认证页面独立完成后，再改 AppShell，降低模板冲突。
3. 固定 Header 最后做视觉整合，并用浏览器检查双滚动和遮挡。
4. 本期所有登录用户共享业务数据；不要在业务模型中加入用户外键。
5. 不新增 JWT、OAuth、Redis 或权限矩阵，保持 MVP 可验证。

## 完成定义

- [ ] 设计文档要求逐项有实现或明确验证记录。
- [ ] 后端全量测试通过。
- [ ] 前端生产构建和测试通过。
- [ ] 注册、登录、刷新恢复、登出和路由保护在浏览器完成闭环。
- [ ] Header、主题、侧栏和紧凑滚动在桌面/移动视口完成验收。
- [ ] 未提交或未验证的风险在最终交付中明确列出。
