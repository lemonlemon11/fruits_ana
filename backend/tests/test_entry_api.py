from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.auth import create_session, hash_password
from app.db import Base, SessionLocal, engine
from app.main import app
from app.models import AdminPermission, AdminRole, AdminRolePermission, AdminUserRole, EntryDraft, User


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
    db = SessionLocal()
    user = User(display_name="录单员", password_hash=hash_password("password"))
    db.add(user)
    db.flush()
    role = AdminRole(code="entry_role", name="录单角色", is_active=True)
    db.add(role)
    db.flush()
    for code in permission_codes:
        permission = AdminPermission(code=code, name=code)
        db.add(permission)
        db.flush()
        db.add(AdminRolePermission(role_id=role.id, permission_id=permission.id))
    db.add(AdminUserRole(user_id=user.id, role_id=role.id))
    raw_token = create_session(db, user)
    user_id = user.id
    db.commit()
    db.close()
    client.cookies.set("fruit_session", raw_token)
    return user_id


def _payload(overwrite=False):
    return {
        "merchant_no": "637",
        "order_no": "宝贝-001",
        "container_no": "C001",
        "vehicle_no": "桂A0001",
        "market": "南宁海吉星",
        "arrival_date": "2026-09-10",
        "arrival_quantity": 20,
        "sales": [
            {
                "sale_date": "2026-09-13",
                "variety": "A",
                "head_count": "4",
                "spec_kg": "10",
                "sales_quantity": "20",
                "unit_price": "2.50",
                "remark": "备注",
            }
        ],
        "after_sales": [
            {"content": "坏果", "summary": "扣款", "amount": "10.00"},
        ],
        "fees": [
            {"name": "代卖佣金", "amount": "5.00", "is_custom": False},
        ],
        "overwrite": overwrite,
    }


def test_entry_api_requires_authentication(client):
    assert client.get("/api/entry/field-options?field=market").status_code == 401
    assert client.get("/api/entry/637").status_code == 401
    assert client.get("/api/entry/draft").status_code == 401
    assert client.put("/api/entry/draft", json={"payload": {}}).status_code == 401


def test_entry_api_requires_create_permission_for_create(client):
    _login(client, ["entry:view"])

    get_options = client.get("/api/entry/field-options?field=market")
    create = client.post("/api/entry", json=_payload())

    assert get_options.status_code == 200
    assert create.status_code == 403


def _draft_body():
    return {
        "editing": False,
        "merchant_no": "638",
        "order_no": "宝贝-002",
        "payload": {
            "merchant_no": "638",
            "order_no": "宝贝-002",
            "container_no": "C002",
            "vehicle_no": "桂A0002",
            "market": "江南市场",
            "arrival_date": "",
            "arrival_quantity": None,
            "sales": [
                {
                    "sale_date": "2026-09-13",
                    "variety": "A",
                    "head_count": "",
                    "spec_kg": "",
                    "sales_quantity": 0,
                    "unit_price": 0,
                    "remark": "还在填",
                }
            ],
            "after_sales": [],
            "fees": [],
        },
    }


def test_entry_draft_roundtrip_without_required_fields(client):
    """暂存草稿允许缺必填项，刷新页面前能按用户读回。"""

    _login(client, ["entry:view"])

    missing_payload = client.put("/api/entry/draft", json={"merchant_no": "638"})
    saved = client.put("/api/entry/draft", json=_draft_body())
    loaded = client.get("/api/entry/draft")

    assert missing_payload.status_code == 422
    assert saved.status_code == 200
    assert saved.json()["draft"]["merchant_no"] == "638"
    assert saved.json()["draft"]["order_no"] == "宝贝-002"
    assert saved.json()["draft"]["sales_count"] == 1
    assert loaded.status_code == 200
    assert loaded.json()["draft"]["payload"]["merchant_no"] == "638"
    assert loaded.json()["draft"]["payload"]["sales"][0]["remark"] == "还在填"


def test_entry_draft_can_be_cleared_and_keeps_one_record_per_user(client):
    """删除暂存后读不到；同一用户重复暂存是更新而不是新增。"""

    user_id = _login(client, ["entry:view"])
    first = client.put("/api/entry/draft", json=_draft_body())
    body = _draft_body()
    body["payload"]["sales"][0]["remark"] = "改过一次"
    second = client.put("/api/entry/draft", json=body)

    db = SessionLocal()
    draft_count = db.query(EntryDraft).filter_by(user_id=user_id).count()
    db.close()

    cleared = client.delete("/api/entry/draft")
    loaded = client.get("/api/entry/draft")

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["draft"]["payload"]["sales"][0]["remark"] == "改过一次"
    assert draft_count == 1
    assert cleared.status_code == 204
    assert loaded.json()["draft"] is None


def test_entry_api_create_conflict_overwrite_read_and_export(client):
    _login(client, ["entry:view", "entry:create", "entry:update", "entry:export"])

    first = client.post("/api/entry", json=_payload())
    conflict = client.post("/api/entry", json=_payload(overwrite=False))
    replaced = client.post("/api/entry", json=_payload(overwrite=True))
    detail = client.get("/api/entry/637")
    exported = client.get("/api/entry/637/export.xlsx")

    assert first.status_code == 201
    assert first.json()["source_type"] == "manual"
    assert first.json()["sales"][0]["variety"] == "A"

    assert conflict.status_code == 409
    assert "商号 637 已存在" in conflict.json()["detail"]

    assert replaced.status_code == 201
    assert replaced.json()["order_no"] == "宝贝-001"

    assert detail.status_code == 200
    assert detail.json()["merchant_no"] == "637"
    assert detail.json()["arrival_date"] == "2026-09-10"
    assert detail.json()["arrival_quantity"] == 20
    assert detail.json()["after_sales"][0]["amount"] == "10.00"

    assert exported.status_code == 200
    assert exported.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    assert exported.content[:2] == b"PK"

    db = SessionLocal()
    assert db.query(User).count() == 1
    db.close()


def test_entry_api_normalizes_range_spec_when_saving(client):
    """头数区间归一（`B3/B4`→`3/4`）；KG 只允许单个数值（`10KG`→`10`、区间拒绝）。"""

    _login(client, ["entry:view", "entry:create"])
    payload = _payload()
    payload["sales"][0]["head_count"] = "B3/B4"
    payload["sales"][0]["spec_kg"] = "10KG"

    created = client.post("/api/entry", json=payload)

    assert created.status_code == 201
    assert created.json()["sales"][0]["head_count"] == "3/4"
    assert created.json()["sales"][0]["spec_kg"] == "10"

    payload["sales"][0]["spec_kg"] = "9-10KG"
    ranged = client.post("/api/entry", json=payload)
    assert ranged.status_code == 422


def test_entry_api_allows_empty_spec_but_rejects_unparsable_spec(client):
    """规格可留空；一旦填写且解析不出来时必须标红阻断保存，不能猜数。"""

    _login(client, ["entry:view", "entry:create"])
    payload = _payload()
    payload["sales"][0]["spec_kg"] = ""
    empty = client.post("/api/entry", json=payload)
    payload["sales"][0]["spec_kg"] = "硬包"
    unparsable = client.post("/api/entry", json=payload)

    assert empty.status_code == 201
    assert empty.json()["sales"][0]["spec_kg"] == ""
    assert unparsable.status_code == 422
