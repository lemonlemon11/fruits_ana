"""密码哈希和服务端会话认证辅助函数。"""

from __future__ import annotations

import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Callable

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from .db import get_db
from .models import (
    AdminMenu,
    AdminPermission,
    AdminRole,
    AdminRoleMenu,
    AdminRolePermission,
    AdminUserRole,
    User,
    UserSession,
    utc_now,
)


SESSION_COOKIE = "fruit_session"
DEFAULT_SESSION_DAYS = 7
REMEMBERED_SESSION_DAYS = 30
AUTH_ERROR_DETAIL = "用户名或密码错误"
LOGIN_REQUIRED_DETAIL = "请先登录"
DISABLED_USER_DETAIL = "该用户已被禁用"
PASSWORD_HASHER = PasswordHasher()


def normalize_username(value: str) -> str:
    """返回登录用户名的规范化形式，用于唯一性判断和查询。"""

    # 与 SQL LOWER() 保持一致，避免 Python 与数据库的大小写折叠规则不同。
    return value.strip().lower()


def hash_password(password: str) -> str:
    """使用 Argon2 哈希密码。"""

    return PASSWORD_HASHER.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """验证密码；无效哈希也只返回失败，不向调用方泄露细节。"""

    try:
        return PASSWORD_HASHER.verify(password_hash, password)
    except (InvalidHashError, VerificationError, VerifyMismatchError):
        return False


def _hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def create_session(
    db: Session, user: User, session_days: int = DEFAULT_SESSION_DAYS
) -> str:
    """创建会话并仅将 opaque token 的 SHA-256 哈希写入数据库。"""

    raw_token = secrets.token_urlsafe(32)
    db.add(
        UserSession(
            user_id=user.id,
            token_hash=_hash_token(raw_token),
            expires_at=utc_now() + timedelta(days=session_days),
        )
    )
    db.flush()
    return raw_token


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def get_current_user(request: Request, db: Session) -> User | None:
    """根据 Cookie 查找有效用户，并清理过期或禁用用户的会话。"""

    raw_token = request.cookies.get(SESSION_COOKIE)
    if not raw_token:
        return None

    session = (
        db.query(UserSession)
        .filter(UserSession.token_hash == _hash_token(raw_token))
        .first()
    )
    if session is None:
        return None

    user = session.user
    if _as_utc(session.expires_at) <= utc_now() or user is None or not user.is_active:
        db.delete(session)
        db.commit()
        return None
    return user


def require_current_user(
    request: Request, db: Session = Depends(get_db)
) -> User:
    """FastAPI 依赖：要求请求携带有效的登录会话。"""

    user = get_current_user(request, db)
    if user is None:
        raise HTTPException(status_code=401, detail=LOGIN_REQUIRED_DETAIL)
    return user


def get_permission_codes(db: Session, user_id: int) -> set[str]:
    """读取用户在管理端维护的业务 RBAC 权限码（只读）。"""

    rows = (
        db.query(AdminPermission.code)
        .join(
            AdminRolePermission,
            AdminRolePermission.permission_id == AdminPermission.id,
        )
        .join(AdminRole, AdminRole.id == AdminRolePermission.role_id)
        .join(AdminUserRole, AdminUserRole.role_id == AdminRole.id)
        .filter(
            AdminUserRole.user_id == user_id,
            AdminRole.is_active.is_(True),
            AdminPermission.is_active.is_(True),
        )
        .distinct()
        .all()
    )
    return {row[0] for row in rows}


def get_menu_items(db: Session, user_id: int) -> list[AdminMenu]:
    """读取用户在管理端被授权的业务菜单（只读）。

    只返回配置了路由的菜单，按管理端排序输出；`is_active=False` 的菜单照常
    返回，由业务端决定隐藏，便于前端区分「停用」与「未授权」。管理员改名或
    改图标后，业务端侧边导航随之更新。
    """

    return (
        db.query(AdminMenu)
        .join(AdminRoleMenu, AdminRoleMenu.menu_id == AdminMenu.id)
        .join(AdminRole, AdminRole.id == AdminRoleMenu.role_id)
        .join(AdminUserRole, AdminUserRole.role_id == AdminRole.id)
        .filter(
            AdminUserRole.user_id == user_id,
            AdminRole.is_active.is_(True),
            AdminMenu.route_path.isnot(None),
        )
        .order_by(AdminMenu.sort_order, AdminMenu.id)
        .distinct()
        .all()
    )


def require_permission(permission_code: str) -> Callable:
    """FastAPI 依赖：要求当前登录用户拥有指定业务权限。"""

    def dependency(
        request: Request,
        db: Session = Depends(get_db),
    ) -> User:
        user = require_current_user(request, db)
        if permission_code not in get_permission_codes(db, user.id):
            raise HTTPException(status_code=403, detail="没有权限执行该操作")
        return user

    return dependency


def revoke_session(db: Session, raw_token: str | None) -> None:
    """撤销指定会话；不存在时保持幂等。"""

    if not raw_token:
        return
    session = (
        db.query(UserSession)
        .filter(UserSession.token_hash == _hash_token(raw_token))
        .first()
    )
    if session is None:
        return
    db.delete(session)
    db.commit()


def cookie_secure() -> bool:
    """读取 Cookie 的 Secure 开关，默认适配本地开发。"""

    return os.getenv("FRUIT_ANALYSIS_COOKIE_SECURE", "false").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def set_session_cookie(
    response: Response, raw_token: str, session_days: int = DEFAULT_SESSION_DAYS
) -> None:
    response.set_cookie(
        key=SESSION_COOKIE,
        value=raw_token,
        max_age=session_days * 86400,
        httponly=True,
        secure=cookie_secure(),
        samesite="lax",
        path="/",
    )
