"""认证 API 的注册、登录和服务端会话行为测试。

含邮箱验证码注册与邮箱登录测试。
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.db import Base, SessionLocal, engine
from app.main import app
from app.models import (
    AdminPermission,
    AdminRole,
    AdminRolePermission,
    AdminUserRole,
    User,
    UserSession,
    VerificationCode,
    utc_now,
)
from app.verification_service import _reset_rate_limits_for_testing


@pytest.fixture(autouse=True)
def clean_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


def _credentials():
    return {
        "display_name": "张三",
        "password": "correct horse battery staple",
        "email": "zhangsan@example.com",
        "verification_code": "123456",
    }


def _premake_code(db, email="zhangsan@example.com", code="123456"):
    """Create an unverified verification code record for testing."""
    now = utc_now()
    record = VerificationCode(
        email=email,
        code=code,
        created_at=now,
        expires_at=now + timedelta(minutes=10),
        verified_at=None,
        attempt_count=0,
    )
    db.add(record)
    db.flush()
    return record


def _setup_register(db):
    """Reset rate limits and pre-create a verification code for default user."""
    _reset_rate_limits_for_testing()
    _premake_code(db)
    db.commit()


# ── Registration tests ──────────────────────────────────────────────


def test_register_creates_user_and_hashed_session(client):
    with SessionLocal() as db:
        _setup_register(db)

    response = client.post("/api/auth/register", json=_credentials())

    assert response.status_code == 201
    data = response.json()
    assert data["user"]["display_name"] == "张三"
    assert data["user"]["email"] == "zhangsan@example.com"
    assert "password_hash" not in response.text
    assert "HttpOnly" in response.headers["set-cookie"]
    assert "samesite=lax" in response.headers["set-cookie"].lower()

    raw_token = client.cookies.get("fruit_session")
    assert raw_token

    with SessionLocal() as db:
        user = db.execute(
            text("SELECT display_name, email, password_hash FROM user")
        ).mappings().one()
        session = db.execute(
            text("SELECT token_hash, created_at, expires_at FROM user_session")
        ).mappings().one()

    assert user["display_name"] == "张三"
    assert user["email"] == "zhangsan@example.com"
    assert user["password_hash"] != _credentials()["password"]
    assert user["password_hash"].startswith("$argon2")
    assert session["token_hash"] == hashlib.sha256(
        raw_token.encode("utf-8")
    ).hexdigest()
    assert session["token_hash"] != raw_token


def test_register_assigns_default_registered_user_role(client):
    with SessionLocal() as db:
        role = AdminRole(
            code="registered_user",
            name="新注册用户",
            is_system=True,
            is_active=True,
        )
        db.add(role)
        db.flush()
        role_id = role.id
        db.commit()
        _setup_register(db)

    response = client.post("/api/auth/register", json=_credentials())

    assert response.status_code == 201
    assert response.json()["user"]["permissions"] == []
    with SessionLocal() as db:
        user = db.query(User).one()
        assignment = (
            db.query(AdminUserRole)
            .filter(AdminUserRole.user_id == user.id)
            .one()
        )
    assert assignment.role_id == role_id


def test_register_rejects_duplicate_normalized_display_name(client):
    with SessionLocal() as db:
        _premake_code(db, email="first@test.com", code="111111")
        _premake_code(db, email="second@test.com", code="222222")
        db.commit()
    _reset_rate_limits_for_testing()

    first = client.post("/api/auth/register", json={
        "display_name": "张三",
        "password": "correct horse battery staple",
        "email": "first@test.com",
        "verification_code": "111111",
    })
    second = client.post("/api/auth/register", json={
        "display_name": " 张三 ",
        "password": "another secure password",
        "email": "second@test.com",
        "verification_code": "222222",
    })

    assert first.status_code == 201
    assert second.status_code == 409


def test_register_rejects_duplicate_email(client):
    with SessionLocal() as db:
        _premake_code(db, email="dup@test.com", code="111111")
        db.commit()
    _reset_rate_limits_for_testing()

    first = client.post("/api/auth/register", json={
        "display_name": "first",
        "password": "correct horse battery staple",
        "email": "dup@test.com",
        "verification_code": "111111",
    })
    assert first.status_code == 201

    # Create a fresh code for the same email
    with SessionLocal() as db:
        _premake_code(db, email="dup@test.com", code="222222")
        db.commit()
    _reset_rate_limits_for_testing()

    second = client.post("/api/auth/register", json={
        "display_name": "second",
        "password": "another secure password",
        "email": "dup@test.com",
        "verification_code": "222222",
    })

    assert second.status_code == 409
    assert "邮箱" in second.json()["detail"]


def test_register_rejects_invalid_verification_code(client):
    with SessionLocal() as db:
        _reset_rate_limits_for_testing()
        now = utc_now()
        record = VerificationCode(
            email="test@example.com",
            code="654321",
            created_at=now,
            expires_at=now + timedelta(minutes=10),
        )
        db.add(record)
        db.commit()

    response = client.post("/api/auth/register", json={
        "display_name": "test",
        "password": "secure password",
        "email": "test@example.com",
        "verification_code": "000000",
    })

    assert response.status_code == 400
    assert "验证码" in response.json()["detail"]


def test_register_rejects_expired_verification_code(client):
    with SessionLocal() as db:
        _reset_rate_limits_for_testing()
        now = utc_now()
        record = VerificationCode(
            email="test@example.com",
            code="111111",
            created_at=now - timedelta(minutes=30),
            expires_at=now - timedelta(minutes=20),
        )
        db.add(record)
        db.commit()

    response = client.post("/api/auth/register", json={
        "display_name": "test",
        "password": "secure password",
        "email": "test@example.com",
        "verification_code": "111111",
    })

    assert response.status_code == 400
    assert "已过期" in response.json()["detail"]


# ── Login tests ─────────────────────────────────────────────────────


def test_login_by_display_name_does_not_enumerate_accounts(client):
    with SessionLocal() as db:
        _setup_register(db)
    client.post("/api/auth/register", json=_credentials())

    wrong_password = client.post("/api/auth/login", json={
        "display_name": "张三", "password": "wrong password",
    })
    unknown_name = client.post("/api/auth/login", json={
        "display_name": "不存在", "password": "wrong password",
    })

    assert wrong_password.status_code == 401
    assert unknown_name.status_code == 401
    assert wrong_password.json()["detail"] == "用户名或密码错误"
    assert unknown_name.json()["detail"] == wrong_password.json()["detail"]


def test_login_disabled_user_shows_disabled_message(client):
    with SessionLocal() as db:
        _setup_register(db)
    client.post("/api/auth/register", json=_credentials())
    with SessionLocal() as db:
        user = db.query(User).one()
        user.is_active = False
        db.commit()
    client.post("/api/auth/logout")

    response = client.post("/api/auth/login", json={
        "display_name": "张三",
        "password": "correct horse battery staple",
    })

    assert response.status_code == 403
    assert response.json()["detail"] == "该用户已被禁用"


def test_login_by_email(client):
    with SessionLocal() as db:
        _setup_register(db)
    client.post("/api/auth/register", json=_credentials())
    client.post("/api/auth/logout")

    # Login by email
    response = client.post("/api/auth/login", json={
        "display_name": "zhangsan@example.com",
        "password": "correct horse battery staple",
    })

    assert response.status_code == 200
    assert response.json()["user"]["display_name"] == "张三"
    assert response.json()["user"]["email"] == "zhangsan@example.com"


def test_login_by_email_does_not_enumerate_accounts(client):
    with SessionLocal() as db:
        _setup_register(db)
    client.post("/api/auth/register", json=_credentials())

    wrong_password = client.post("/api/auth/login", json={
        "display_name": "zhangsan@example.com", "password": "wrong",
    })
    unknown_email = client.post("/api/auth/login", json={
        "display_name": "nobody@test.com", "password": "wrong",
    })

    assert wrong_password.status_code == 401
    assert unknown_email.status_code == 401
    assert wrong_password.json()["detail"] == "用户名或密码错误"
    assert unknown_email.json()["detail"] == wrong_password.json()["detail"]


@pytest.mark.parametrize(
    ("remember_me", "expected_days"),
    [(False, 7), (True, 30)],
)
def test_login_uses_requested_session_duration(client, remember_me, expected_days):
    with SessionLocal() as db:
        _setup_register(db)
    client.post("/api/auth/register", json=_credentials())
    client.post("/api/auth/logout")

    payload = {"display_name": "张三", "password": "correct horse battery staple"}
    if remember_me:
        payload["remember_me"] = True

    response = client.post("/api/auth/login", json=payload)

    assert response.status_code == 200
    assert f"max-age={expected_days * 86400}" in response.headers["set-cookie"].lower()
    with SessionLocal() as db:
        session = db.query(UserSession).one()
    duration = session.expires_at - session.created_at
    assert timedelta(days=expected_days) - timedelta(seconds=1) <= duration
    assert duration <= timedelta(days=expected_days) + timedelta(seconds=1)


# ── Session lifecycle tests ─────────────────────────────────────────


def test_me_and_logout_follow_session_lifecycle(client):
    assert client.get("/api/auth/me").status_code == 401

    with SessionLocal() as db:
        _setup_register(db)
    registered = client.post("/api/auth/register", json=_credentials())
    assert registered.status_code == 201

    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["user"]["display_name"] == "张三"
    assert me.json()["user"]["email"] == "zhangsan@example.com"
    assert "password_hash" not in me.text

    logout = client.post("/api/auth/logout")
    assert logout.status_code == 204
    assert client.get("/api/auth/me").status_code == 401


def test_expired_session_is_rejected_and_revoked(client):
    with SessionLocal() as db:
        _setup_register(db)
    registered = client.post("/api/auth/register", json=_credentials())
    assert registered.status_code == 201

    with SessionLocal() as db:
        db.execute(
            text("UPDATE user_session SET expires_at = :expires_at"),
            {"expires_at": datetime.now(timezone.utc) - timedelta(minutes=1)},
        )
        db.commit()

    assert client.get("/api/auth/me").status_code == 401


def test_business_api_requires_authentication(client):
    for method, path in [
        ("GET", "/api/analytics/overview"),
        ("GET", "/api/imports"),
        ("GET", "/api/exports/overview.csv"),
    ]:
        response = client.request(method, path)
        assert response.status_code == 401
        assert response.json() == {"detail": "请先登录"}

    with SessionLocal() as db:
        assert db.execute(text("SELECT COUNT(*) FROM user_session")).scalar_one() == 0


def test_login_and_me_return_business_rbac_permissions(client):
    with SessionLocal() as db:
        _setup_register(db)
    registered = client.post("/api/auth/register", json=_credentials())
    assert registered.status_code == 201

    with SessionLocal() as db:
        user = db.query(User).one()
        role = AdminRole(code="fruit_admin", name="水果系统管理员", is_active=True)
        db.add(role)
        db.flush()
        permission = AdminPermission(code="entry:view", name="查看手工录单")
        db.add(permission)
        db.flush()
        db.add(AdminRolePermission(role_id=role.id, permission_id=permission.id))
        db.add(AdminUserRole(user_id=user.id, role_id=role.id))
        db.commit()

    client.post("/api/auth/logout")
    login = client.post("/api/auth/login", json=_credentials())
    me = client.get("/api/auth/me")

    assert login.status_code == 200
    assert login.json()["user"]["permissions"] == ["entry:view"]
    assert me.status_code == 200
    assert me.json()["user"]["permissions"] == ["entry:view"]
