"""验证码生成、速率限制、校验逻辑。"""

from __future__ import annotations

import random
import re
from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from .email_service import send_verification_code, smtp_configured
from .models import PasswordResetToken, User, VerificationCode, utc_now

CODE_LENGTH = 6
CODE_EXPIRE_MINUTES = 10
RESEND_COOLDOWN_SECONDS = 60
MAX_ATTEMPTS = 3
DAILY_LIMIT_PER_EMAIL = 10
DAILY_LIMIT_PER_IP = 20

# 简易请求计数（进程内，重启清零；生产可换 Redis）
_send_counts: dict[str, int] = {}
_daily_reset_date: str | None = None


def _reset_rate_limits_for_testing() -> None:
    """Reset in-process rate counters for testing."""
    _send_counts.clear()
    global _daily_reset_date  # noqa: PLW0603
    _daily_reset_date = None


def _today() -> str:
    return utc_now().strftime("%Y-%m-%d")


def _reset_daily_if_needed() -> None:
    global _daily_reset_date, _send_counts
    today = _today()
    if _daily_reset_date != today:
        _send_counts.clear()
        _daily_reset_date = today


def _ip_key(ip: str) -> str:
    return f"ip:{ip}"


def _email_key(email: str) -> str:
    return f"email:{email}"


def _increment_and_check(key: str, limit: int, label: str) -> None:
    _reset_daily_if_needed()
    current = _send_counts.get(key, 0)
    if current >= limit:
        raise HTTPException(
            status_code=429,
            detail=f"{label}今日验证码请求已达上限（{limit} 次），请明天再试",
        )
    _send_counts[key] = current + 1


def _validate_email_format(email: str) -> str:
    """校验邮箱格式，返回规范化后的邮箱。"""
    email = email.strip().lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise HTTPException(status_code=422, detail="邮箱格式不正确")
    if len(email) > 320:
        raise HTTPException(status_code=422, detail="邮箱地址过长")
    return email


def _check_email_not_registered(db: Session, email: str) -> None:
    normalized_email = email.strip().lower()
    existing = (
        db.query(User)
        .filter(func.lower(User.email) == normalized_email)
        .first()
    )
    if existing is not None:
        raise HTTPException(status_code=409, detail="该邮箱已被注册")


def _check_cooldown(db: Session, email: str) -> None:
    """检查同一邮箱是否在冷却期内。"""
    now = utc_now()
    now_naive = now.replace(tzinfo=None)
    recent = (
        db.query(VerificationCode)
        .filter(
            VerificationCode.email == email,
            VerificationCode.created_at
            > now_naive - timedelta(seconds=RESEND_COOLDOWN_SECONDS),
        )
        .order_by(VerificationCode.created_at.desc())
        .first()
    )
    if recent is not None:
        remaining = RESEND_COOLDOWN_SECONDS - (now_naive - recent.created_at).total_seconds()
        raise HTTPException(
            status_code=429,
            detail=f"请 {int(remaining)} 秒后再发送",
        )


def send_code_for_register(
    db: Session, email: str, client_ip: str
) -> None:
    """发送注册验证码前的所有校验 + 发送。"""
    if not smtp_configured():
        raise HTTPException(
            status_code=500,
            detail="系统邮件服务未配置，暂无法注册",
        )

    email = _validate_email_format(email)
    _check_email_not_registered(db, email)

    # 频率限制
    _increment_and_check(_ip_key(client_ip), DAILY_LIMIT_PER_IP, "该 IP")
    _increment_and_check(_email_key(email), DAILY_LIMIT_PER_EMAIL, "该邮箱")
    _check_cooldown(db, email)

    # 生成验证码
    code = str(random.randint(10 ** (CODE_LENGTH - 1), 10**CODE_LENGTH - 1))

    now_naive = utc_now().replace(tzinfo=None)
    now = utc_now()
    code_record = VerificationCode(
        email=email,
        code=code,
        purpose="register",
        created_at=now_naive,
        expires_at=now_naive + timedelta(minutes=CODE_EXPIRE_MINUTES),
    )
    db.add(code_record)
    db.commit()

    # 发送邮件
    try:
        send_verification_code(email, code)
    except Exception as exc:
        # 发送失败时删除验证码记录，避免无效验证码堆积
        db.delete(code_record)
        db.commit()
        raise HTTPException(
            status_code=502,
            detail="验证码发送失败，请稍后重试",
        ) from exc



def send_code_for_reset_password(
    db: Session, email: str, client_ip: str
) -> None:
    """发送重置密码验证码前的所有校验 + 发送。"""
    if not smtp_configured():
        raise HTTPException(
            status_code=500,
            detail="系统邮件服务未配置，暂无法操作",
        )

    email = _validate_email_format(email)

    # 检查邮箱是否已注册
    normalized = email.strip().lower()
    user = (
        db.query(User)
        .filter(func.lower(User.email) == normalized)
        .first()
    )
    if user is None:
        raise HTTPException(status_code=404, detail="该邮箱未注册")

    # 频率限制
    _increment_and_check(_ip_key(client_ip), DAILY_LIMIT_PER_IP, "该 IP")
    _increment_and_check(_email_key(email), DAILY_LIMIT_PER_EMAIL, "该邮箱")
    _check_cooldown(db, email)

    # 生成验证码
    code = str(random.randint(10 ** (CODE_LENGTH - 1), 10**CODE_LENGTH - 1))

    now_naive = utc_now().replace(tzinfo=None)
    code_record = VerificationCode(
        email=email,
        code=code,
        purpose="reset_password",
        created_at=now_naive,
        expires_at=now_naive + timedelta(minutes=CODE_EXPIRE_MINUTES),
    )
    db.add(code_record)
    db.commit()

    # 发送邮件
    try:
        send_verification_code(email, code, purpose="reset_password")
    except Exception as exc:
        db.delete(code_record)
        db.commit()
        raise HTTPException(
            status_code=502,
            detail="验证码发送失败，请稍后重试",
        ) from exc


def verify_reset_code(db: Session, email: str, code: str) -> str:
    """验证重置密码验证码，通过后返回一次性重置令牌。

    令牌为随机 URL-safe 字符串，SHA-256 哈希后落库。
    """
    email = email.strip().lower()
    code = code.strip()

    now = utc_now()
    now_naive = now.replace(tzinfo=None)
    record = (
        db.query(VerificationCode)
        .filter(
            VerificationCode.email == email,
            VerificationCode.purpose == "reset_password",
            VerificationCode.expires_at > now_naive,
            VerificationCode.verified_at.is_(None),
        )
        .order_by(VerificationCode.created_at.desc())
        .first()
    )

    if record is None:
        raise HTTPException(status_code=400, detail="验证码已过期或不存在")

    if record.attempt_count >= MAX_ATTEMPTS:
        raise HTTPException(status_code=400, detail="验证码错误次数过多，请重新发送")

    if record.code != code:
        record.attempt_count += 1
        db.commit()
        remaining = MAX_ATTEMPTS - record.attempt_count
        raise HTTPException(
            status_code=400,
            detail=f"验证码错误，还剩 {remaining} 次机会",
        )

    # 验证通过
    record.verified_at = now_naive
    db.commit()

    # 发放一次性重置令牌
    import secrets
    import hashlib
    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()

    token_record = PasswordResetToken(
        email=email,
        token_hash=token_hash,
        created_at=now_naive,
        expires_at=now_naive + timedelta(minutes=5),
    )
    db.add(token_record)
    db.commit()

    return raw_token


def reset_password_with_token(
    db: Session, email: str, token: str, new_password: str
) -> None:
    """使用重置令牌修改密码。"""
    import hashlib
    from .auth import hash_password

    email = email.strip().lower()
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()

    now_naive = utc_now().replace(tzinfo=None)
    record = (
        db.query(PasswordResetToken)
        .filter(
            PasswordResetToken.email == email,
            PasswordResetToken.token_hash == token_hash,
            PasswordResetToken.expires_at > now_naive,
            PasswordResetToken.used_at.is_(None),
        )
        .first()
    )

    if record is None:
        raise HTTPException(status_code=400, detail="重置令牌无效或已过期")

    # 标记令牌已使用
    record.used_at = now_naive

    # 更新密码
    user = (
        db.query(User)
        .filter(func.lower(User.email) == email)
        .first()
    )
    if user is None:
        # 理论上不会发生，因为令牌发放时邮箱已验证存在
        raise HTTPException(status_code=404, detail="用户不存在")

    user.password_hash = hash_password(new_password)
    db.commit()



def verify_code(db: Session, email: str, code: str) -> None:
    """验证邮箱 + 验证码组合，成功则标记已验证。"""
    email = email.strip().lower()
    code = code.strip()

    now_naive = utc_now().replace(tzinfo=None)
    now = utc_now()
    record = (
        db.query(VerificationCode)
        .filter(
            VerificationCode.email == email,
            VerificationCode.expires_at > now_naive,
            VerificationCode.verified_at.is_(None),
        )
        .order_by(VerificationCode.created_at.desc())
        .first()
    )

    if record is None:
        raise HTTPException(status_code=400, detail="验证码已过期或不存在")

    if record.attempt_count >= MAX_ATTEMPTS:
        raise HTTPException(status_code=400, detail="验证码错误次数过多，请重新发送")

    if record.code != code:
        record.attempt_count += 1
        db.commit()
        remaining = MAX_ATTEMPTS - record.attempt_count
        raise HTTPException(
            status_code=400,
            detail=f"验证码错误，还剩 {remaining} 次机会",
        )

    # 验证通过
    record.verified_at = now_naive
    db.commit()
