from datetime import date
from decimal import Decimal

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.analytics import router
from app.db import Base, SessionLocal, engine
from app.models import SaleRecord, StandardGrade


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
    db.add(
        SaleRecord(
            container_id=container_id,
            sale_date=sale_date,
            grade=grade,
            grade_raw=grade.value,
            quantity=quantity,
            unit_price=unit_price,
            amount=quantity * unit_price,
        )
    )


def test_container_comparison_returns_ranks_and_global_contributions(client):
    with SessionLocal() as db:
        add_sale(db, "C1", date(2026, 1, 1), StandardGrade.A, 2, 10)
        add_sale(db, "C1", date(2026, 1, 1), StandardGrade.B, 3, 10)
        add_sale(db, "C2", date(2026, 1, 1), StandardGrade.A, 1, 20)
        add_sale(db, "C2", date(2026, 1, 1), StandardGrade.C, 4, 20)
        add_sale(db, "C3", date(2026, 1, 1), StandardGrade.B, 2, 5)
        db.commit()

    response = client.get("/api/analytics/container-comparison")

    assert response.status_code == 200
    containers = {
        item["container_id"]: item for item in response.json()["containers"]
    }
    assert containers["C1"]["rank"] == {
        "sales_quantity": 1,
        "sales_amount": 2,
        "weighted_avg_price": 2,
    }
    assert containers["C2"]["rank"] == {
        "sales_quantity": 1,
        "sales_amount": 1,
        "weighted_avg_price": 1,
    }
    assert containers["C3"]["rank"] == {
        "sales_quantity": 3,
        "sales_amount": 3,
        "weighted_avg_price": 3,
    }
    assert containers["C1"]["sales_quantity_share"] == 0.4167
    assert containers["C1"]["sales_amount_share"] == 0.3125
    assert containers["C1"]["grade_contribution"] == {
        "A": 0.1667,
        "B": 0.25,
        "C": 0.0,
    }
    assert containers["C1"]["grades"][0]["quantity_share"] == 0.4


def test_include_all_containers_keeps_date_filter_with_selected_container(client):
    with SessionLocal() as db:
        add_sale(db, "C1", date(2026, 1, 1), StandardGrade.A, 100, 10)
        add_sale(db, "C1", date(2026, 1, 2), StandardGrade.A, 2, 10)
        add_sale(db, "C2", date(2026, 1, 2), StandardGrade.B, 8, 5)
        add_sale(db, "C3", date(2026, 1, 3), StandardGrade.C, 50, 1)
        db.commit()

    response = client.get(
        "/api/analytics/container-comparison",
        params={
            "start_date": "2026-01-02",
            "end_date": "2026-01-02",
            "container_id": "C1",
            "include_all_containers": "true",
        },
    )

    assert response.status_code == 200
    containers = response.json()["containers"]
    assert [item["container_id"] for item in containers] == ["C1", "C2"]
    assert [item["total"]["sales_quantity"] for item in containers] == [2.0, 8.0]
    assert containers[0]["sales_quantity_share"] == 0.2
    assert containers[1]["sales_quantity_share"] == 0.8


def test_container_filter_keeps_legacy_comparison_scope_by_default(client):
    with SessionLocal() as db:
        add_sale(db, "C1", date(2026, 1, 1), StandardGrade.A, 2, 10)
        add_sale(db, "C2", date(2026, 1, 1), StandardGrade.B, 8, 5)
        db.commit()

    response = client.get(
        "/api/analytics/container-comparison", params={"container_id": "C1"}
    )

    assert response.status_code == 200
    assert [
        item["container_id"] for item in response.json()["containers"]
    ] == ["C1"]
