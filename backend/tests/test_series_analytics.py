"""系列对比：单号系列识别、A/B/C 独立指标、价差与系列汇总。"""

from datetime import date
from decimal import Decimal

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.analytics import router
from app.auth import require_current_user
from app.db import Base, SessionLocal, engine
from app.models import ImportBatch, SaleRecord, StandardGrade
from app.services.series_analytics_service import UNKNOWN_SERIES, series_name


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


def add_settlement(db, *, merchant_no, order_no, sale_date, rows):
    """写入一张结算单；``rows`` 为 (等级, 件数, 单价) 三元组列表。"""

    batch = ImportBatch(
        file_name=f"{merchant_no}.xlsx", merchant_no=merchant_no, order_no=order_no
    )
    db.add(batch)
    db.flush()
    for grade, quantity, unit_price in rows:
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
        sale_date=date(2026, 8, 27),
        rows=[(StandardGrade.A, 10, 100), (StandardGrade.B, 20, 50)],
    )
    add_settlement(
        db,
        merchant_no="626",
        order_no="宝贝02",
        sale_date=date(2026, 8, 28),
        rows=[(StandardGrade.A, 10, 120), (StandardGrade.C, 10, 30)],
    )
    add_settlement(
        db,
        merchant_no="单637",
        order_no="香香01",
        sale_date=date(2026, 9, 6),
        rows=[(StandardGrade.B, 10, 60)],
    )
    db.commit()


def fetch_comparison(client, merchant_nos=(), **extra):
    """发起系列对比请求；``merchant_nos`` 会展开为可重复的 merchant_no 参数。"""

    params = [("merchant_no", value) for value in merchant_nos]
    params.extend(extra.items())
    response = client.get("/api/analytics/series-comparison", params=params)
    assert response.status_code == 200
    return response.json()


def row_of(body, merchant_no):
    return next(
        row for row in body["settlements"] if row["merchant_no"] == merchant_no
    )


def grade_of(row, grade):
    return next(item for item in row["grades"] if item["grade"] == grade)


@pytest.mark.parametrize(
    ("order_no", "expected"),
    [
        ("宝贝01", "宝贝"),
        ("宝贝L004", "宝贝"),
        ("香香01", "香香"),
        ("626", UNKNOWN_SERIES),
        ("", UNKNOWN_SERIES),
        (None, UNKNOWN_SERIES),
    ],
)
def test_series_name_extracts_chinese_prefix(order_no, expected):
    assert series_name(order_no) == expected


def test_settlements_are_grouped_by_series(client):
    with SessionLocal() as db:
        seed_batches(db)

    body = fetch_comparison(client)

    assert [row["merchant_no"] for row in body["settlements"]] == [
        "单624",
        "626",
        "单637",
    ]
    assert [row["series"] for row in body["settlements"]] == ["宝贝", "宝贝", "香香"]
    assert [series["name"] for series in body["series"]] == ["宝贝", "香香"]
    assert body["series"][0]["settlement_count"] == 2
    assert body["series"][0]["merchant_nos"] == ["626", "单624"]


def test_grade_metrics_expose_quantity_and_amount_shares(client):
    with SessionLocal() as db:
        seed_batches(db)

    row = row_of(fetch_comparison(client), "单624")

    assert row["total"]["sales_quantity"] == pytest.approx(30)
    assert row["total"]["sales_amount"] == pytest.approx(2000)
    assert row["total"]["weighted_avg_price"] == pytest.approx(66.6667, abs=1e-4)
    assert grade_of(row, "A")["weighted_avg_price"] == pytest.approx(100)
    assert grade_of(row, "A")["quantity_share"] == pytest.approx(0.3333, abs=1e-4)
    assert row["grade_amount_shares"]["A"] == pytest.approx(0.5)
    assert row["grade_amount_shares"]["B"] == pytest.approx(0.5)


def test_price_spread_is_null_when_grade_missing(client):
    with SessionLocal() as db:
        seed_batches(db)

    body = fetch_comparison(client)
    row = row_of(body, "单624")

    assert row["spread"]["grade_prices"]["A"] == pytest.approx(100)
    assert row["spread"]["a_minus_b"] == pytest.approx(50)
    assert row["spread"]["b_minus_c"] is None
    assert row["spread"]["b_discount_vs_a"] == pytest.approx(0.5)
    assert row_of(body, "626")["spread"]["a_minus_b"] is None


def test_total_aggregates_selected_settlements(client):
    with SessionLocal() as db:
        seed_batches(db)

    total = fetch_comparison(client)["total"]

    assert total["total"]["sales_quantity"] == pytest.approx(60)
    assert total["total"]["sales_amount"] == pytest.approx(4100)
    assert total["total"]["weighted_avg_price"] == pytest.approx(68.3333, abs=1e-4)
    assert total["spread"]["grade_prices"]["B"] == pytest.approx(53.3333, abs=1e-4)
    assert total["spread"]["a_minus_b"] == pytest.approx(56.6667, abs=1e-4)
    assert total["spread"]["b_minus_c"] == pytest.approx(23.3333, abs=1e-4)
    assert total["spread"]["b_discount_vs_a"] == pytest.approx(0.5152, abs=1e-4)


def test_selected_merchant_nos_limit_the_scope(client):
    with SessionLocal() as db:
        seed_batches(db)

    body = fetch_comparison(client, merchant_nos=["单624", "单637"])

    assert [row["merchant_no"] for row in body["settlements"]] == ["单624", "单637"]
    assert body["total"]["total"]["sales_quantity"] == pytest.approx(40)
    assert body["total"]["total"]["sales_amount"] == pytest.approx(2600)
    assert [series["name"] for series in body["series"]] == ["宝贝", "香香"]


def test_date_range_filters_records(client):
    with SessionLocal() as db:
        seed_batches(db)

    body = fetch_comparison(client, start_date="2026-09-01")

    assert [row["merchant_no"] for row in body["settlements"]] == ["单637"]


def test_invalid_date_range_returns_422(client):
    response = client.get(
        "/api/analytics/series-comparison",
        params={"start_date": "2026-09-10", "end_date": "2026-09-01"},
    )

    assert response.status_code == 422
