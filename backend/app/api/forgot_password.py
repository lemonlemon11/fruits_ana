"""忘记密码：发送验证码、验证并重置密码。"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from ..db import get_db
from ..schemas import (
    ForgotPasswordResetRequest,
    ForgotPasswordSendCodeRequest,
    ForgotPasswordSendCodeResponse,
    ForgotPasswordVerifyCodeRequest,
    ForgotPasswordVerifyCodeResponse,
)
from ..verification_service import (
    send_code_for_reset_password,
    verify_reset_code,
    reset_password_with_token,
)

router = APIRouter(prefix="/api/auth/forgot-password", tags=["auth"])


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.post("/send-code", response_model=ForgotPasswordSendCodeResponse)
def send_code(
    payload: ForgotPasswordSendCodeRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """向已注册邮箱发送重置密码验证码。"""
    client_ip = _get_client_ip(request)
    send_code_for_reset_password(db, payload.email, client_ip)
    return ForgotPasswordSendCodeResponse()


@router.post("/verify-code", response_model=ForgotPasswordVerifyCodeResponse)
def verify_code(
    payload: ForgotPasswordVerifyCodeRequest,
    db: Session = Depends(get_db),
):
    """验证重置密码验证码，通过后返回一次性重置令牌。"""
    token = verify_reset_code(db, payload.email, payload.verification_code)
    return ForgotPasswordVerifyCodeResponse(reset_token=token)


@router.post("/reset", status_code=status.HTTP_200_OK)
def reset_password(
    payload: ForgotPasswordResetRequest,
    db: Session = Depends(get_db),
):
    """使用重置令牌设置新密码。"""
    if len(payload.password) < 8:
        raise HTTPException(status_code=422, detail="密码长度不能少于 8 位")
    if len(payload.password) > 128:
        raise HTTPException(status_code=422, detail="密码长度不能超过 128 位")

    reset_password_with_token(db, payload.email, payload.reset_token, payload.password)
    return {"message": "密码已重置，请使用新密码登录"}
