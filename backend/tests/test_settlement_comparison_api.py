from datetime import date
from decimal import Decimal

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.analytics import router
from app.auth import require_current_user
from app.db import Base, SessionLocal, engine
from app.models import ImportBatch, SaleRecord, StandardGrade


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


def add_sale(db, merchant_no, sale_date, grade, quantity, unit_price):
    batch = db.query(ImportBatch).filter_by(merchant_no=merchant_no).first()
    if batch is None:
        batch = ImportBatch(file_name=f"{merchant_no}.xlsx", merchant_no=merchant_no)
        db.add(batch)
        db.flush()
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


def test_settlement_comparison_returns_ranks_and_global_contributions(client):
    with SessionLocal() as db:
        add_sale(db, "M1", date(2026, 1, 1), StandardGrade.A, 2, 10)
        add_sale(db, "M1", date(2026, 1, 1), StandardGrade.B, 3, 10)
        add_sale(db, "M2", date(2026, 1, 1), StandardGrade.A, 1, 20)
        add_sale(db, "M2", date(2026, 1, 1), StandardGrade.C, 4, 20)
        add_sale(db, "M3", date(2026, 1, 1), StandardGrade.B, 2, 5)
        db.commit()

    response = client.get("/api/analytics/settlement-comparison")

    assert response.status_code == 200
    settlements = {
        item["merchant_no"]: item for item in response.json()["settlements"]
    }
    assert settlements["M1"]["rank"] == {
        "sales_quantity": 1,
        "sales_amount": 2,
        "weighted_avg_price": 2,
    }
    assert settlements["M2"]["rank"] == {
        "sales_quantity": 1,
        "sales_amount": 1,
        "weighted_avg_price": 1,
    }
    assert settlements["M3"]["rank"] == {
        "sales_quantity": 3,
        "sales_amount": 3,
        "weighted_avg_price": 3,
    }
    assert settlements["M1"]["sales_quantity_share"] == 0.4167
    assert settlements["M1"]["sales_amount_share"] == 0.3125
    assert settlements["M1"]["grade_contribution"] == {
        "A": 0.1667,
        "B": 0.25,
        "C": 0.0,
        "D": 0.0,
        "E": 0.0,
        "F": 0.0,
        "OTHER": 0.0,
    }
    assert settlements["M1"]["grades"][0]["quantity_share"] == 0.4


def test_include_all_settlements_keeps_date_filter_with_selected_settlement(client):
    with SessionLocal() as db:
        add_sale(db, "M1", date(2026, 1, 1), StandardGrade.A, 100, 10)
        add_sale(db, "M1", date(2026, 1, 2), StandardGrade.A, 2, 10)
        add_sale(db, "M2", date(2026, 1, 2), StandardGrade.B, 8, 5)
        add_sale(db, "M3", date(2026, 1, 3), StandardGrade.C, 50, 1)
        db.commit()

    response = client.get(
        "/api/analytics/settlement-comparison",
        params={
            "start_date": "2026-01-02",
            "end_date": "2026-01-02",
            "merchant_no": "M1",
            "include_all_settlements": "true",
        },
    )

    assert response.status_code == 200
    settlements = response.json()["settlements"]
    assert [item["merchant_no"] for item in settlements] == ["M1", "M2"]
    assert [item["total"]["sales_quantity"] for item in settlements] == [2.0, 8.0]
    assert settlements[0]["sales_quantity_share"] == 0.2
    assert settlements[1]["sales_quantity_share"] == 0.8


def test_settlement_filter_keeps_legacy_comparison_scope_by_default(client):
    with SessionLocal() as db:
        add_sale(db, "M1", date(2026, 1, 1), StandardGrade.A, 2, 10)
        add_sale(db, "M2", date(2026, 1, 1), StandardGrade.B, 8, 5)
        db.commit()

    response = client.get(
        "/api/analytics/settlement-comparison", params={"merchant_no": "M1"}
    )

    assert response.status_code == 200
    assert [
        item["merchant_no"] for item in response.json()["settlements"]
    ] == ["M1"]
