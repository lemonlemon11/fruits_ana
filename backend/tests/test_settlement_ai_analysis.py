"""结算单详情 AI 分析：同品牌筛选与数据包构建。"""

from datetime import date
from decimal import Decimal

import pytest

from app.db import Base, SessionLocal, engine
from app.models import ImportBatch, SaleRecord, StandardGrade
from app.services.settlement_ai_analysis_service import _build_payload, build_messages
from app.services.settlement_analytics_service import get_settlement_comparison


@pytest.fixture(autouse=True)
def clean_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


def add_settlement(db, *, merchant_no, order_no, rows):
    batch = ImportBatch(file_name=f"{merchant_no}.xlsx", merchant_no=merchant_no, order_no=order_no)
    db.add(batch)
    db.flush()
    for grade, quantity, unit_price in rows:
        quantity = Decimal(str(quantity))
        unit_price = Decimal(str(unit_price))
        db.add(
            SaleRecord(
                import_batch_id=batch.id,
                sale_date=date(2026, 9, 1),
                grade=grade,
                grade_raw=grade.value,
                quantity=quantity,
                unit_price=unit_price,
                amount=quantity * unit_price,
            )
        )


def test_settlement_comparison_exposes_series_for_ai_brand_filtering():
    with SessionLocal() as db:
        add_settlement(
            db,
            merchant_no="M1",
            order_no="宝贝01",
            rows=[(StandardGrade.A, 10, 100)],
        )
        add_settlement(
            db,
            merchant_no="M2",
            order_no="宝贝02",
            rows=[(StandardGrade.B, 10, 50)],
        )
        add_settlement(
            db,
            merchant_no="M3",
            order_no="香香01",
            rows=[(StandardGrade.A, 10, 60)],
        )
        db.commit()
        items = get_settlement_comparison(db)

    series = {item["merchant_no"]: item["series"] for item in items}
    assert series == {"M1": "宝贝", "M2": "宝贝", "M3": "香香"}


def test_build_payload_keeps_current_and_same_brand_peer_numbers():
    current = {
        "merchant_no": "M1",
        "order_no_normalized": "宝贝-001",
        "series": "宝贝",
        "start_date": "2026-09-01",
        "end_date": "2026-09-01",
        "total": {"sales_quantity": 10.0, "sales_amount": 1000.0, "weighted_avg_price": 100.0},
        "grades": [{"grade": "A", "sales_quantity": 10.0, "sales_amount": 1000.0, "weighted_avg_price": 100.0, "quantity_share": 1.0}],
    }
    peer = {
        "merchant_no": "M2",
        "order_no_normalized": "宝贝-002",
        "series": "宝贝",
        "start_date": "2026-09-02",
        "end_date": "2026-09-02",
        "total": {"sales_quantity": 10.0, "sales_amount": 500.0, "weighted_avg_price": 50.0},
        "grades": [{"grade": "A", "sales_quantity": 10.0, "sales_amount": 500.0, "weighted_avg_price": 50.0, "quantity_share": 1.0}],
    }

    payload = _build_payload(current, [peer])
    messages = build_messages(payload)

    assert payload["当前结算单"]["品牌"] == "宝贝"
    assert payload["同品牌其他结算单"][0]["品牌"] == "宝贝"
    assert payload["同品牌其他结算单等级基准"][0]["平均每公斤售价"] == 50.0
    assert '"品牌": "宝贝"' in messages[1]["content"]
