"""密码哈希和服务端会话认证辅助函数。"""

from __future__ import annotations

import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from .db import get_db
from .models import User, UserSession, utc_now


SESSION_COOKIE = "fruit_session"
SESSION_DAYS = 7
AUTH_ERROR_DETAIL = "邮箱或密码错误"
LOGIN_REQUIRED_DETAIL = "请先登录"
PASSWORD_HASHER = PasswordHasher()


def normalize_email(value: str) -> str:
    """返回邮箱的规范化形式。"""

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


def create_session(db: Session, user: User) -> str:
    """创建会话并仅将 opaque token 的 SHA-256 哈希写入数据库。"""

    raw_token = secrets.token_urlsafe(32)
    db.add(
        UserSession(
            user_id=user.id,
            token_hash=_hash_token(raw_token),
            expires_at=utc_now() + timedelta(days=SESSION_DAYS),
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


def set_session_cookie(response: Response, raw_token: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE,
        value=raw_token,
        max_age=SESSION_DAYS * 86400,
        httponly=True,
        secure=cookie_secure(),
        samesite="lax",
        path="/",
    )
