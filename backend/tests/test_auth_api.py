"""认证 API 的注册、登录和服务端会话行为测试。"""

from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.db import Base, SessionLocal, engine
from app.main import app


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
        "email": "  User@Example.COM ",
        "password": "correct horse battery staple",
    }


def test_register_creates_user_and_hashed_session(client):
    response = client.post("/api/auth/register", json=_credentials())

    assert response.status_code == 201
    assert response.json()["user"]["display_name"] == "张三"
    assert response.json()["user"]["email"] == "user@example.com"
    assert "password_hash" not in response.text
    assert "HttpOnly" in response.headers["set-cookie"]
    assert "samesite=lax" in response.headers["set-cookie"].lower()

    raw_token = client.cookies.get("fruit_session")
    assert raw_token

    with SessionLocal() as db:
        user = db.execute(
            text("SELECT email, password_hash FROM user")
        ).mappings().one()
        session = db.execute(
            text("SELECT token_hash, created_at, expires_at FROM user_session")
        ).mappings().one()

    assert user["email"] == "user@example.com"
    assert user["password_hash"] != _credentials()["password"]
    assert user["password_hash"].startswith("$argon2")
    assert session["token_hash"] == hashlib.sha256(
        raw_token.encode("utf-8")
    ).hexdigest()
    assert session["token_hash"] != raw_token


def test_register_rejects_duplicate_normalized_email(client):
    first = client.post("/api/auth/register", json=_credentials())
    second = client.post(
        "/api/auth/register",
        json={
            "display_name": "李四",
            "email": "USER@example.com",
            "password": "another secure password",
        },
    )

    assert first.status_code == 201
    assert second.status_code == 409


def test_login_wrong_password_does_not_enumerate_accounts(client):
    client.post("/api/auth/register", json=_credentials())

    wrong_password = client.post(
        "/api/auth/login",
        json={"email": "user@example.com", "password": "wrong password"},
    )
    unknown_email = client.post(
        "/api/auth/login",
        json={"email": "nobody@example.com", "password": "wrong password"},
    )

    assert wrong_password.status_code == 401
    assert unknown_email.status_code == 401
    assert wrong_password.json()["detail"] == "邮箱或密码错误"
    assert unknown_email.json()["detail"] == wrong_password.json()["detail"]


def test_me_and_logout_follow_session_lifecycle(client):
    assert client.get("/api/auth/me").status_code == 401

    registered = client.post("/api/auth/register", json=_credentials())
    assert registered.status_code == 201

    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["user"]["email"] == "user@example.com"
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

    with SessionLocal() as db:
        assert db.execute(text("SELECT COUNT(*) FROM user_session")).scalar_one() == 0
