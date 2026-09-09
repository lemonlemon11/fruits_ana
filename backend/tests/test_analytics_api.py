from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.analytics import router
from app.db import Base, SessionLocal, engine
from app.models import (
    ContainerSummary,
    DataIssue,
    ImportBatch,
    SaleRecord,
    StandardGrade,
)


@pytest.fixture(autouse=True)
def clean_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def add_sale(db, container_id, sale_date, grade, quantity, unit_price):
    quantity = Decimal(str(quantity))
    unit_price = Decimal(str(unit_price))
    sale = SaleRecord(
        container_id=container_id,
        sale_date=sale_date,
        grade=grade,
        grade_raw=grade.value,
        quantity=quantity,
        unit_price=unit_price,
        amount=quantity * unit_price,
    )
    db.add(sale)
    return sale


def add_settled_sale(
    db,
    *,
    container_id,
    sale_date,
    imported_at,
    payable_amount,
):
    batch = ImportBatch(file_name=f"{container_id}-{sale_date}.xlsx")
    batch.imported_at = imported_at
    db.add(batch)
    db.flush()
    sale = add_sale(db, container_id, sale_date, StandardGrade.A, 1, 10)
    sale.import_batch_id = batch.id
    db.add(ContainerSummary(
        import_batch_id=batch.id,
        container_id=container_id,
        payable_amount=Decimal(str(payable_amount)),
    ))


def test_empty_overview_has_stable_shape(client):
    response = client.get("/api/analytics/overview")

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == {
        "sales_quantity": 0.0,
        "sales_amount": 0.0,
        "weighted_avg_price": None,
    }
    assert [item["grade"] for item in body["grades"]] == ["A", "B", "C"]
    assert body["trend"] == []
    assert body["issue_counts"]["total"] == 0


def test_standard_filters_apply_to_overview_numerator_and_denominator(client):
    with SessionLocal() as db:
        add_sale(db, "C1", date(2026, 1, 1), StandardGrade.A, 2, 10)
        add_sale(db, "C2", date(2026, 1, 2), StandardGrade.B, 8, 5)
        db.commit()

    response = client.get(
        "/api/analytics/overview",
        params={
            "start_date": "2026-01-02",
            "end_date": "2026-01-02",
            "container_id": "C2",
        },
    )
    body = response.json()

    assert body["total"]["sales_quantity"] == 8.0
    assert body["grades"][1]["quantity_share"] == 1.0
    assert body["grades"][0]["sales_quantity"] == 0.0


def test_trend_comparison_and_container_detail_routes(client):
    with SessionLocal() as db:
        first = add_sale(db, "C1", date(2026, 1, 1), StandardGrade.A, 2, 10)
        add_sale(db, "C1", date(2026, 1, 2), StandardGrade.C, 1, 20)
        add_sale(db, "C2", date(2026, 1, 1), StandardGrade.B, 4, 5)
        db.commit()
        first_id = first.id

    trend = client.get("/api/analytics/trend", params={"container_id": "C1"})
    comparison = client.get(
        "/api/analytics/container-comparison", params={"container_id": "C1"}
    )
    detail = client.get("/api/analytics/containers/C1")

    assert trend.status_code == comparison.status_code == detail.status_code == 200
    assert [item["sale_date"] for item in trend.json()["trend"]] == [
        "2026-01-01",
        "2026-01-02",
    ]
    assert [item["container_id"] for item in comparison.json()["containers"]] == [
        "C1"
    ]
    assert detail.json()["container_id"] == "C1"
    assert detail.json()["grades"][0]["sales_quantity"] == 2.0
    assert detail.json()["settlement"] == {
        "after_sales_amount": None,
        "fee_amount": None,
        "customs_tax": None,
        "payable_amount": None,
    }
    assert detail.json()["records"][0] == {
        "id": first_id,
        "source_file_id": None,
        "import_batch_id": None,
        "sale_date": "2026-01-01",
        "grade": "A",
        "grade_raw": "A",
        "spec_raw": None,
        "quantity": 2.0,
        "unit_price": 10.0,
        "amount": 20.0,
    }


def test_settlement_uses_filtered_batches_and_latest_import_time(client):
    utc = timezone.utc
    with SessionLocal() as db:
        add_settled_sale(
            db,
            container_id="C1",
            sale_date=date(2026, 1, 1),
            imported_at=datetime(2026, 1, 2, tzinfo=utc),
            payable_amount=100,
        )
        add_settled_sale(
            db,
            container_id="C1",
            sale_date=date(2026, 2, 1),
            imported_at=datetime(2026, 2, 2, tzinfo=utc),
            payable_amount=200,
        )
        add_settled_sale(
            db,
            container_id="C2",
            sale_date=date(2026, 2, 1),
            imported_at=datetime(2026, 2, 2, tzinfo=utc),
            payable_amount=220,
        )
        add_settled_sale(
            db,
            container_id="C2",
            sale_date=date(2026, 1, 1),
            imported_at=datetime(2026, 1, 2, tzinfo=utc),
            payable_amount=110,
        )
        db.commit()

    historical = client.get(
        "/api/analytics/containers/C1",
        params={"start_date": "2026-01-01", "end_date": "2026-01-01"},
    )
    latest = client.get("/api/analytics/containers/C2")

    assert historical.json()["settlement"]["payable_amount"] == 100.0
    assert latest.json()["settlement"]["payable_amount"] == 220.0


def test_unknown_container_returns_404(client):
    response = client.get("/api/analytics/containers/missing")

    assert response.status_code == 404


def test_invalid_date_range_returns_422(client):
    response = client.get(
        "/api/analytics/overview",
        params={"start_date": "2026-01-02", "end_date": "2026-01-01"},
    )

    assert response.status_code == 422


def test_issue_count_is_read_from_data_issue(client):
    with SessionLocal() as db:
        batch = ImportBatch(file_name="sample.csv")
        db.add(batch)
        db.flush()
        sale = add_sale(db, "C1", date(2026, 1, 1), StandardGrade.A, 1, 10)
        db.flush()
        db.add_all(
            [
                DataIssue(
                    import_batch_id=batch.id,
                    sale_record_id=sale.id,
                    issue_type="missing_field",
                    message="missing",
                ),
                DataIssue(
                    import_batch_id=batch.id,
                    sale_record_id=sale.id,
                    issue_type="amount_mismatch",
                    message="mismatch",
                ),
                DataIssue(
                    import_batch_id=batch.id,
                    issue_type="duplicate_import",
                    message="duplicate",
                ),
            ]
        )
        db.commit()

    issues = client.get("/api/analytics/overview").json()["issue_counts"]

    assert issues == {
        "total": 3,
        "missing_field": 1,
        "amount_mismatch": 1,
        "duplicate_import": 1,
    }


def test_legacy_root_routes_are_not_created(client):
    assert client.get("/api/overview").status_code == 404
    assert client.get("/api/containers").status_code == 404
