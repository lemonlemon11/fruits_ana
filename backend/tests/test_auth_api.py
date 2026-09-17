"""认证 API 的注册、登录和服务端会话行为测试。"""

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
)


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
    }


def test_register_creates_user_and_hashed_session(client):
    response = client.post("/api/auth/register", json=_credentials())

    assert response.status_code == 201
    assert response.json()["user"]["display_name"] == "张三"
    assert "email" not in response.json()["user"]
    assert "password_hash" not in response.text
    assert "HttpOnly" in response.headers["set-cookie"]
    assert "samesite=lax" in response.headers["set-cookie"].lower()

    raw_token = client.cookies.get("fruit_session")
    assert raw_token

    with SessionLocal() as db:
        user = db.execute(text("SELECT display_name, password_hash FROM user")).mappings().one()
        session = db.execute(
            text("SELECT token_hash, created_at, expires_at FROM user_session")
        ).mappings().one()

    assert user["display_name"] == "张三"
    assert user["password_hash"] != _credentials()["password"]
    assert user["password_hash"].startswith("$argon2")
    assert session["token_hash"] == hashlib.sha256(
        raw_token.encode("utf-8")
    ).hexdigest()
    assert session["token_hash"] != raw_token


def test_register_rejects_duplicate_normalized_display_name(client):
    first = client.post("/api/auth/register", json=_credentials())
    second = client.post(
        "/api/auth/register",
        json={
            "display_name": " 张三 ",
            "password": "another secure password",
        },
    )

    assert first.status_code == 201
    assert second.status_code == 409


def test_login_by_display_name_does_not_enumerate_accounts(client):
    client.post("/api/auth/register", json=_credentials())

    wrong_password = client.post(
        "/api/auth/login",
        json={"display_name": "张三", "password": "wrong password"},
    )
    unknown_name = client.post(
        "/api/auth/login",
        json={"display_name": "不存在", "password": "wrong password"},
    )

    assert wrong_password.status_code == 401
    assert unknown_name.status_code == 401
    assert wrong_password.json()["detail"] == "用户名或密码错误"
    assert unknown_name.json()["detail"] == wrong_password.json()["detail"]


@pytest.mark.parametrize(
    ("remember_me", "expected_days"),
    [(False, 7), (True, 30)],
)
def test_login_uses_requested_session_duration(client, remember_me, expected_days):
    client.post("/api/auth/register", json=_credentials())
    client.post("/api/auth/logout")
    payload = _credentials()
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


def test_me_and_logout_follow_session_lifecycle(client):
    assert client.get("/api/auth/me").status_code == 401

    registered = client.post("/api/auth/register", json=_credentials())
    assert registered.status_code == 201

    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["user"]["display_name"] == "张三"
    assert "email" not in me.json()["user"]
    assert "password_hash" not in me.text

    logout = client.post("/api/auth/logout")
    assert logout.status_code == 204
    assert client.get("/api/auth/me").status_code == 401


def test_expired_session_is_rejected_and_revoked(client):
    registered = client.post("/api/auth/register", json=_credentials())
    assert registered.status_code == 201

    with SessionLocal() as db:
        db.execute(
            text("UPDATE user_session SET expires_at = :expires_at"),
            {"expires_at": datetime.now(timezone.utc) - timedelta(minutes=1)},
        )
        db.commit()

    assert client.get("/api/auth/me").status_code == 401


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/api/analytics/overview"),
        ("GET", "/api/imports"),
        ("GET", "/api/exports/overview.csv"),
    ],
)
def test_business_api_requires_authentication(client, method, path):
    response = client.request(method, path)

    assert response.status_code == 401
    assert response.json() == {"detail": "请先登录"}

    with SessionLocal() as db:
        assert db.execute(text("SELECT COUNT(*) FROM user_session")).scalar_one() == 0


def test_login_and_me_return_business_rbac_permissions(client):
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
