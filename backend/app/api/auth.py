"""注册、登录、当前用户和登出接口。"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..auth import (
    AUTH_ERROR_DETAIL,
    DEFAULT_SESSION_DAYS,
    REMEMBERED_SESSION_DAYS,
    SESSION_COOKIE,
    create_session,
    cookie_secure,
    hash_password,
    normalize_username,
    require_current_user,
    revoke_session,
    set_session_cookie,
    verify_password,
)
from ..db import get_db
from ..models import User, utc_now
from ..schemas import AuthResponse, LoginRequest, RegisterRequest, UserRead


router = APIRouter(prefix="/api/auth", tags=["auth"])


def _validated_display_name(value: str) -> str:
    display_name = value.strip()
    if not display_name:
        raise HTTPException(status_code=422, detail="用户名不能为空")
    return display_name


def _find_user_by_name(db: Session, display_name: str) -> User | None:
    normalized = normalize_username(display_name)
    return (
        db.query(User)
        .filter(func.lower(User.display_name) == normalized)
        .first()
    )


def _user_payload(user: User) -> dict[str, UserRead]:
    return {"user": UserRead(id=user.id, display_name=user.display_name)}


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(
    payload: RegisterRequest,
    response: Response,
    db: Session = Depends(get_db),
):
    display_name = _validated_display_name(payload.display_name)
    if _find_user_by_name(db, display_name) is not None:
        raise HTTPException(status_code=409, detail="用户名已被注册")

    user = User(
        display_name=display_name,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    try:
        db.flush()
        raw_token = create_session(db, user)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="用户名已被注册") from None

    set_session_cookie(response, raw_token)
    return _user_payload(user)


@router.post("/login", response_model=AuthResponse)
def login(
    payload: LoginRequest,
    response: Response,
    db: Session = Depends(get_db),
):
    user = _find_user_by_name(db, payload.display_name)
    if user is None or not user.is_active or not verify_password(
        payload.password, user.password_hash if user else ""
    ):
        raise HTTPException(status_code=401, detail=AUTH_ERROR_DETAIL)

    user.last_login_at = utc_now()
    session_days = (
        REMEMBERED_SESSION_DAYS if payload.remember_me else DEFAULT_SESSION_DAYS
    )
    raw_token = create_session(db, user, session_days)
    db.commit()
    set_session_cookie(response, raw_token, session_days)
    return _user_payload(user)


@router.get("/me", response_model=AuthResponse)
def me(current_user: User = Depends(require_current_user)):
    return _user_payload(current_user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    revoke_session(db, request.cookies.get(SESSION_COOKIE))
    response.delete_cookie(
        key=SESSION_COOKIE,
        path="/",
        secure=cookie_secure(),
        httponly=True,
        samesite="lax",
    )
    return None
