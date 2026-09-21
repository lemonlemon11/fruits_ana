"""注册、登录、当前用户和登出接口。

含邮箱验证码注册流程：
1. POST /api/auth/send-code   → 发送验证码到邮箱
2. POST /api/auth/register    → 验证码校验 + 创建用户（一次性提交）

登录支持用户名或邮箱。
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..auth import (
    AUTH_ERROR_DETAIL,
    DEFAULT_SESSION_DAYS,
    DISABLED_USER_DETAIL,
    REMEMBERED_SESSION_DAYS,
    SESSION_COOKIE,
    create_session,
    cookie_secure,
    get_menu_items,
    hash_password,
    normalize_username,
    require_current_user,
    get_permission_codes,
    revoke_session,
    set_session_cookie,
    verify_password,
)
from ..db import get_db
from ..logging_config import get_logger
from ..models import AdminRole, AdminUserRole, User, VerificationCode, utc_now
from ..schemas import (
    AuthResponse,
    LoginRequest,
    RegisterRequest,
    SendCodeRequest,
    SendCodeResponse,
    SidebarMenuRead,
    UserRead,
)
from ..verification_service import send_code_for_register, verify_code


router = APIRouter(prefix="/api/auth", tags=["auth"])
logger = get_logger()

DEFAULT_REGISTER_ROLE_CODE = "registered_user"


def _get_client_ip(request: Request) -> str:
    """尝试从 X-Forwarded-For 或远程地址获取客户端 IP。"""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


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


def _find_user_by_email(db: Session, email: str) -> User | None:
    normalized = email.strip().lower()
    return (
        db.query(User)
        .filter(func.lower(User.email) == normalized)
        .first()
    )


def _find_user_by_name_or_email(db: Session, login_id: str) -> User | None:
    """先按邮箱查，再按用户名查。"""
    user = _find_user_by_email(db, login_id)
    if user is not None:
        return user
    return _find_user_by_name(db, login_id)


def _user_payload(user: User, db: Session) -> dict[str, UserRead]:
    return {
        "user": UserRead(
            id=user.id,
            display_name=user.display_name,
            email=user.email,
            permissions=sorted(get_permission_codes(db, user.id)),
            menus=[
                SidebarMenuRead.model_validate(menu)
                for menu in get_menu_items(db, user.id)
            ],
        )
    }


def _assign_default_role(db: Session, user: User) -> None:
    """为新注册用户绑定管理端预置的默认角色；角色暂未创建时不影响注册。"""

    role = (
        db.query(AdminRole)
        .filter(
            AdminRole.code == DEFAULT_REGISTER_ROLE_CODE,
            AdminRole.is_active.is_(True),
        )
        .first()
    )
    if role is not None:
        db.add(AdminUserRole(user_id=user.id, role_id=role.id))


@router.post("/send-code", response_model=SendCodeResponse, status_code=status.HTTP_200_OK)
def send_code(
    payload: SendCodeRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """向指定邮箱发送注册验证码。"""
    client_ip = _get_client_ip(request)
    send_code_for_register(db, payload.email, client_ip)
    return SendCodeResponse()


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(
    payload: RegisterRequest,
    response: Response,
    db: Session = Depends(get_db),
):
    display_name = _validated_display_name(payload.display_name)
    email = payload.email.strip().lower()

    if _find_user_by_name(db, display_name) is not None:
        raise HTTPException(status_code=409, detail="用户名已被注册")
    if _find_user_by_email(db, email) is not None:
        raise HTTPException(status_code=409, detail="该邮箱已被注册")

    # 验证验证码
    verify_code(db, email, payload.verification_code)

    user = User(
        display_name=display_name,
        email=email,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    try:
        db.flush()
        _assign_default_role(db, user)
        raw_token = create_session(db, user)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="用户名或邮箱已被注册") from None

    set_session_cookie(response, raw_token)
    logger.info("register success user_id=%s", user.id)
    return _user_payload(user, db)


@router.post("/login", response_model=AuthResponse)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    user = _find_user_by_name_or_email(db, payload.display_name)
    if user is None or not verify_password(
        payload.password, user.password_hash if user else ""
    ):
        logger.warning(
            "login failed reason=invalid_credentials user=%s ip=%s",
            payload.display_name,
            _get_client_ip(request),
        )
        raise HTTPException(status_code=401, detail=AUTH_ERROR_DETAIL)

    if not user.is_active:
        logger.warning(
            "login failed reason=disabled user_id=%s ip=%s",
            user.id,
            _get_client_ip(request),
        )
        raise HTTPException(status_code=403, detail=DISABLED_USER_DETAIL)

    user.last_login_at = utc_now()
    session_days = (
        REMEMBERED_SESSION_DAYS if payload.remember_me else DEFAULT_SESSION_DAYS
    )
    raw_token = create_session(db, user, session_days)
    db.commit()
    set_session_cookie(response, raw_token, session_days)
    logger.info(
        "login success user_id=%s remember_me=%s ip=%s",
        user.id,
        payload.remember_me,
        _get_client_ip(request),
    )
    return _user_payload(user, db)


@router.get("/me", response_model=AuthResponse)
def me(current_user: User = Depends(require_current_user), db: Session = Depends(get_db)):
    return _user_payload(current_user, db)


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
