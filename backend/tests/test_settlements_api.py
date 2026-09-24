from datetime import date, datetime
from decimal import Decimal

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.settlements import router
from app.auth import require_current_user
from app.db import Base, SessionLocal, engine
from app.models import ImportBatch, SaleRecord, StandardGrade
from app.services.settlement_list_service import one_month_before


@pytest.fixture(autouse=True)
def clean_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[require_current_user] = lambda: object()
    return TestClient(app)


def add_settlement(db, *, merchant_no, sale_date, grades, unit_price, **meta):
    """写入一张结算单及其分等级明细。grades 形如 {"A": 2, "B": 3}。"""

    batch = ImportBatch(
        file_name=f"{merchant_no}.xlsx", merchant_no=merchant_no, **meta
    )
    db.add(batch)
    db.flush()
    for grade, quantity in grades.items():
        quantity = Decimal(str(quantity))
        unit_price = Decimal(str(unit_price))
        db.add(
            SaleRecord(
                import_batch_id=batch.id,
                sale_date=sale_date,
                grade=grade,
                grade_raw=grade.value,
                quantity=quantity,
                unit_price=unit_price,
                amount=quantity * unit_price,
            )
        )
    return batch


def seed_batches(db):
    add_settlement(
        db,
        merchant_no="单624",
        order_no="宝贝01",
        container_no="MWCU1823691",
        vehicle_no="桂AAB087",
        sale_date=date(2026, 8, 27),
        grades={StandardGrade.A: 10},
        unit_price=10,
        imported_at=datetime(2026, 8, 27, 8, 0),
    )
    add_settlement(
        db,
        merchant_no="626",
        order_no="宝贝02",
        container_no="EMCU5303814",
        sale_date=date(2026, 8, 28),
        grades={StandardGrade.B: 5},
        unit_price=10,
        imported_at=datetime(2026, 8, 28, 8, 0),
    )
    add_settlement(
        db,
        merchant_no="单637",
        order_no="宝贝003",
        container_no="CBHU2970762",
        sale_date=date(2026, 9, 6),
        grades={StandardGrade.C: 4},
        unit_price=10,
        imported_at=datetime(2026, 9, 6, 8, 0),
    )
    add_settlement(
        db,
        merchant_no="640",
        order_no="宝贝L004",
        container_no="CBHU2970762",
        vehicle_no="桂ABF330",
        sale_date=date(2026, 9, 9),
        grades={StandardGrade.A: 6, StandardGrade.B: 2},
        unit_price=20,
        imported_at=datetime(2026, 9, 9, 8, 0),
        confirmed_at=datetime(2026, 9, 9, 9, 30),
    )
    db.commit()


def test_default_range_is_latest_month(client):
    with SessionLocal() as db:
        seed_batches(db)

    body = client.get("/api/settlements").json()

    assert body["date_range"] == {
        "start_date": "2026-08-09",
        "end_date": "2026-09-09",
        "is_default": True,
    }
    assert [row["merchant_no"] for row in body["settlements"]] == [
        "640",
        "单637",
        "626",
        "单624",
    ]
    assert body["settlements"][0]["container_no"] == "CBHU2970762"


def test_settlement_item_exposes_sales_metrics(client):
    with SessionLocal() as db:
        seed_batches(db)

    row = client.get("/api/settlements", params={"merchant_no": "640"}).json()[
        "settlements"
    ][0]

    assert row == {
        "merchant_no": "640",
        "merchant_no_normalized": "640",
        "order_no": "宝贝L004",
        "order_no_normalized": "宝贝-004",
        "brand": "宝贝",
        "fruit_type": "榴莲",
        "series": "宝贝",
        "container_no": "CBHU2970762",
        "vehicle_no": "桂ABF330",
        "arrival_date": None,
        "sale_date_start": "2026-09-09",
        "sale_date_end": "2026-09-09",
        "sales_amount": 160.0,
        "total_quantity": 8.0,
        "average_price": 20.0,
        "confirmed_at": "2026-09-09T09:30:00",
        "grade_quantities": {
            "A": 6.0,
            "B": 2.0,
            "AB": 0.0,
            "C": 0.0,
            "D": 0.0,
            "E": 0.0,
            "F": 0.0,
            "OTHER": 0.0,
        },
        "record_count": 2,
    }


def test_one_month_before_clamps_to_month_end():
    assert one_month_before(date(2026, 3, 31)) == date(2026, 2, 28)
    assert one_month_before(date(2026, 1, 15)) == date(2025, 12, 15)


def test_explicit_range_and_empty_range(client):
    with SessionLocal() as db:
        seed_batches(db)

    filtered = client.get(
        "/api/settlements",
        params={"start_date": "2026-09-01", "end_date": "2026-09-30"},
    ).json()
    assert filtered["date_range"]["is_default"] is False
    assert [row["merchant_no"] for row in filtered["settlements"]] == ["640", "单637"]

    empty = client.get(
        "/api/settlements",
        params={"start_date": "2026-01-01", "end_date": "2026-01-31"},
    ).json()
    assert empty["settlements"] == []
    assert empty["date_range"]["is_default"] is False


def test_invalid_range_returns_422(client):
    response = client.get(
        "/api/settlements",
        params={"start_date": "2026-09-30", "end_date": "2026-09-01"},
    )

    assert response.status_code == 422


@pytest.mark.parametrize(
    ("sort_by", "sort_order", "expected"),
    [
        ("arrival_date", "asc", ["排序甲", "排序丙", "排序乙"]),
        ("total_quantity", "desc", ["排序乙", "排序甲", "排序丙"]),
        ("grade_a", "desc", ["排序甲", "排序丙", "排序乙"]),
        ("grade_b", "desc", ["排序乙", "排序丙", "排序甲"]),
        ("sales_amount", "desc", ["排序丙", "排序乙", "排序甲"]),
        ("average_price", "desc", ["排序丙", "排序乙", "排序甲"]),
        ("confirmed_at", "desc", ["排序甲", "排序丙", "排序乙"]),
    ],
)
def test_settlement_list_supports_requested_sort_fields(
    client, sort_by, sort_order, expected
):
    with SessionLocal() as db:
        add_settlement(
            db,
            merchant_no="排序甲",
            sale_date=date(2026, 9, 10),
            arrival_date=date(2026, 9, 1),
            imported_at=datetime(2026, 9, 1, 8, 0),
            confirmed_at=datetime(2026, 9, 3, 8, 0),
            grades={StandardGrade.A: 8, StandardGrade.B: 1},
            unit_price=10,
        )
        add_settlement(
            db,
            merchant_no="排序乙",
            sale_date=date(2026, 9, 10),
            arrival_date=date(2026, 9, 3),
            imported_at=datetime(2026, 9, 3, 8, 0),
            confirmed_at=datetime(2026, 9, 1, 8, 0),
            grades={StandardGrade.A: 2, StandardGrade.B: 8},
            unit_price=20,
        )
        add_settlement(
            db,
            merchant_no="排序丙",
            sale_date=date(2026, 9, 10),
            arrival_date=date(2026, 9, 2),
            imported_at=datetime(2026, 9, 2, 8, 0),
            confirmed_at=datetime(2026, 9, 2, 8, 0),
            grades={StandardGrade.A: 5, StandardGrade.B: 2},
            unit_price=30,
        )
        db.commit()

    body = client.get(
        "/api/settlements",
        params={"sort_by": sort_by, "sort_order": sort_order},
    ).json()

    assert [row["merchant_no"] for row in body["settlements"]] == expected


def test_settlement_item_allows_missing_confirmed_at(client):
    with SessionLocal() as db:
        add_settlement(
            db,
            merchant_no="未确认时间",
            sale_date=date(2026, 9, 10),
            grades={StandardGrade.A: 1},
            unit_price=10,
        )
        db.commit()

    response = client.get(
        "/api/settlements", params={"merchant_no": "未确认时间"}
    )

    assert response.status_code == 200
    assert response.json()["settlements"][0]["confirmed_at"] is None


def test_settlement_sort_is_applied_before_pagination(client):
    with SessionLocal() as db:
        add_settlement(
            db,
            merchant_no="件数多",
            sale_date=date(2026, 9, 10),
            grades={StandardGrade.A: 20},
            unit_price=10,
        )
        add_settlement(
            db,
            merchant_no="件数少",
            sale_date=date(2026, 9, 10),
            grades={StandardGrade.A: 2},
            unit_price=10,
        )
        db.commit()

    body = client.get(
        "/api/settlements",
        params={
            "sort_by": "total_quantity",
            "sort_order": "asc",
            "page": 1,
            "page_size": 1,
        },
    ).json()

    assert body["pagination"]["total"] == 2
    assert [row["merchant_no"] for row in body["settlements"]] == ["件数少"]


def test_invalid_settlement_sort_parameters_return_422(client):
    assert client.get("/api/settlements", params={"sort_by": "unknown"}).status_code == 422
    assert client.get(
        "/api/settlements",
        params={"sort_by": "sales_amount", "sort_order": "sideways"},
    ).status_code == 422


def test_brand_filter_uses_order_no_prefix(client):
    with SessionLocal() as db:
        seed_batches(db)
        add_settlement(
            db,
            merchant_no="香香700",
            order_no="香香01",
            container_no="CBHU2970762",
            sale_date=date(2026, 9, 8),
            grades={StandardGrade.A: 3},
            unit_price=10,
        )
        db.commit()

    body = client.get("/api/settlements", params={"brand": "香香"}).json()

    assert [row["merchant_no"] for row in body["settlements"]] == ["香香700"]
    assert [row["brand"] for row in body["settlements"]] == ["香香"]
    assert body["brand_totals"] == [
        {"brand": "香香", "total_quantity": 3.0, "settlement_count": 1}
    ]

    empty = client.get("/api/settlements", params={"brand": "不存在的品牌"}).json()
    assert empty["settlements"] == []
    assert empty["brand_totals"] == []


def test_settlement_records_endpoint(client):
    with SessionLocal() as db:
        seed_batches(db)

    body = client.get("/api/settlements/640/records").json()

    assert body["merchant_no"] == "640"
    assert body["merchant_no_normalized"] == "640"
    assert body["order_no"] == "宝贝L004"
    assert body["order_no_normalized"] == "宝贝-004"
    assert [record["grade"] for record in body["records"]] == ["A", "B"]
    assert body["records"][0]["amount"] == 120.0
    assert client.get("/api/settlements/未知/records").status_code == 404


def test_settlement_review_endpoint_returns_readonly_import_payload(client):
    with SessionLocal() as db:
        seed_batches(db)

    body = client.get("/api/settlements/640/review").json()

    assert body["job_status"] == "readonly"
    assert body["file_name"] == "640.xlsx"
    assert body["payload"]["merchant_no"] == "640"
    assert body["payload"]["issues"] == []
    assert [row["variety"] for row in body["payload"]["sales"]] == ["A", "B"]
    assert body["payload"]["sales"][0]["amount"] == 120.0
    assert body["payload"]["file_summary"]["sales_amount"] == "160"
    assert body["payload"]["computed_summary"]["after_sale_amount"] == "0"
    assert client.get("/api/settlements/未知/review").status_code == 404


def test_delete_settlement_removes_batch_and_sales(client):
    with SessionLocal() as db:
        seed_batches(db)
        batch = db.query(ImportBatch).filter_by(merchant_no="单637").first()
        batch_id = batch.id

    response = client.delete("/api/settlements/单637")

    assert response.status_code == 200
    assert response.json() == {"deleted": True, "merchant_no": "单637"}
    with SessionLocal() as db:
        assert db.query(ImportBatch).filter_by(merchant_no="单637").first() is None
        assert db.query(SaleRecord).filter_by(import_batch_id=batch_id).count() == 0
    body = client.get("/api/settlements").json()
    assert "单637" not in [row["merchant_no"] for row in body["settlements"]]
    assert client.delete("/api/settlements/单637").status_code == 404


def test_empty_database_returns_no_default_range(client):
    body = client.get("/api/settlements").json()

    assert body == {
        "date_range": None,
        "settlements": [],
        "pagination": None,
        "brand_totals": [],
    }
