"""问答 HTTP 接口：响应结构、权限依赖与错误码映射。"""

import pytest
from fastapi.testclient import TestClient

from app.api import ask as ask_api
from app.auth import create_session, hash_password
from app.db import Base, SessionLocal, engine
from app.main import app
from app.models import (
    AdminPermission,
    AdminRole,
    AdminRolePermission,
    AdminUserRole,
    AskAuditLog,
    User,
)
from app.services.ai_analysis_service import AiCallFailed, AiNotConfigured

ASK_PERMISSION = "ask:view"


@pytest.fixture(autouse=True)
def clean_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


def _login(client, permission_codes):
    """建一个只拥有给定权限码的用户，并写入会话 Cookie。"""

    db = SessionLocal()
    user = User(display_name="问答用户", password_hash=hash_password("password"))
    db.add(user)
    db.flush()
    role = AdminRole(code="ask_role", name="问答角色", is_active=True)
    db.add(role)
    db.flush()
    for code in permission_codes:
        permission = AdminPermission(code=code, name=code)
        db.add(permission)
        db.flush()
        db.add(AdminRolePermission(role_id=role.id, permission_id=permission.id))
    db.add(AdminUserRole(user_id=user.id, role_id=role.id))
    raw_token = create_session(db, user)
    db.commit()
    db.close()
    client.cookies.set("fruit_session", raw_token)


def test_ask_api_requires_authentication(client):
    assert client.post("/api/ask", json={"question": "有几张单？"}).status_code == 401


def test_ask_api_requires_ask_view_permission(client):
    _login(client, ["entry:view"])

    assert client.post("/api/ask", json={"question": "有几张单？"}).status_code == 403


def test_ask_returns_answer_with_steps(client, monkeypatch):
    _login(client, [ASK_PERMISSION])
    monkeypatch.setattr(
        ask_api,
        "answer_question",
        lambda db, *, question, history: {
            "answer": "- 共 12 张结算单。",
            "steps": [{"tool": "list_settlements", "args": {}, "summary": "结算单清单：12 张结算单"}],
            "model": "test-model",
        },
    )

    response = client.post("/api/ask", json={"question": "最近有哪些单？"})

    assert response.status_code == 200
    body = response.json()
    assert body["answer"] == "- 共 12 张结算单。"
    assert body["steps"][0]["tool"] == "list_settlements"
    assert body["model"] == "test-model"

    db = SessionLocal()
    audit = db.query(AskAuditLog).one()
    assert audit.user_id is not None
    assert audit.question == "最近有哪些单？"
    assert audit.status == "success"
    assert audit.tool_calls[0]["tool"] == "list_settlements"
    assert audit.model == "test-model"
    assert audit.duration_ms >= 0
    db.close()


def test_ask_forwards_trimmed_question_and_history(client, monkeypatch):
    _login(client, [ASK_PERMISSION])
    captured = {}

    def fake(db, *, question, history):
        captured["question"] = question
        captured["history"] = history
        return {"answer": "- 好的。", "steps": [], "model": "test-model"}

    monkeypatch.setattr(ask_api, "answer_question", fake)

    client.post(
        "/api/ask",
        json={
            "question": "  那 B 果呢？  ",
            "history": [{"role": "user", "content": "A 果卖得怎么样？"}],
        },
    )

    assert captured["question"] == "那 B 果呢？"
    assert captured["history"] == [{"role": "user", "content": "A 果卖得怎么样？"}]


def test_ask_maps_missing_configuration_to_503(client, monkeypatch):
    _login(client, [ASK_PERMISSION])

    def raise_not_configured(db, *, question, history):
        raise AiNotConfigured("未配置大模型")

    monkeypatch.setattr(ask_api, "answer_question", raise_not_configured)

    response = client.post("/api/ask", json={"question": "有几张单？"})

    assert response.status_code == 503


def test_ask_maps_upstream_failure_to_502(client, monkeypatch):
    _login(client, [ASK_PERMISSION])

    def raise_call_failed(db, *, question, history):
        raise AiCallFailed("大模型没有返回回答，请再问一次")

    monkeypatch.setattr(ask_api, "answer_question", raise_call_failed)

    response = client.post("/api/ask", json={"question": "有几张单？"})

    assert response.status_code == 502
    assert "请再问一次" in response.json()["detail"]

    db = SessionLocal()
    audit = db.query(AskAuditLog).one()
    assert audit.question == "有几张单？"
    assert audit.status == "failure"
    assert audit.error_type == "AiCallFailed"
    assert "请再问一次" in (audit.error_message or "")
    db.close()


@pytest.mark.parametrize(
    "payload",
    [
        {"question": ""},
        {"question": "a" * 501},
        {"question": "有几张单？", "history": [{"role": "system", "content": "x"}]},
        {"question": "有几张单？", "history": [{"role": "user", "content": "x"}] * 11},
    ],
)
def test_ask_rejects_invalid_payload(client, payload):
    _login(client, [ASK_PERMISSION])

    assert client.post("/api/ask", json=payload).status_code == 422
