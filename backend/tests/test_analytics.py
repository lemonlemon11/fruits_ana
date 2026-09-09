from datetime import date
from decimal import Decimal

import pytest

from app.db import Base, SessionLocal, engine
from app.models import (
    ContainerSummary,
    ImportBatch,
    SaleRecord,
    SourceFile,
    StandardGrade,
)
from app.services.analytics_service import (
    AnomalyThresholds,
    get_container_comparison,
    get_container_detail,
    get_daily_trend,
    get_grade_summary,
    get_overview,
)


@pytest.fixture(autouse=True)
def clean_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


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


def test_grade_summary_is_stable_when_there_are_no_sales():
    with SessionLocal() as db:
        summary = get_grade_summary(db)

    assert summary["total"] == {
        "sales_quantity": 0.0,
        "sales_amount": 0.0,
        "weighted_avg_price": None,
    }
    assert [item["grade"] for item in summary["grades"]] == ["A", "B", "C"]
    assert all(item["quantity_share"] is None for item in summary["grades"])


def test_grade_summary_uses_weighted_price_and_filtered_denominator():
    with SessionLocal() as db:
        add_sale(db, "C1", date(2026, 1, 1), StandardGrade.A, 2, 10)
        add_sale(db, "C1", date(2026, 1, 2), StandardGrade.A, 1, 20)
        add_sale(db, "C1", date(2026, 1, 2), StandardGrade.B, 3, 5)
        add_sale(db, "C2", date(2026, 1, 2), StandardGrade.C, 10, 1)
        db.commit()

        summary = get_grade_summary(
            db,
            start_date=date(2026, 1, 2),
            end_date=date(2026, 1, 2),
            container_id="C1",
        )

    assert summary["total"] == {
        "sales_quantity": 4.0,
        "sales_amount": 35.0,
        "weighted_avg_price": 8.75,
    }
    assert summary["grades"][0]["quantity_share"] == 0.25
    assert summary["grades"][1]["quantity_share"] == 0.75
    assert summary["grades"][2]["sales_quantity"] == 0.0
    assert summary["grades"][2]["weighted_avg_price"] is None


def test_daily_trend_aggregates_by_sale_date():
    with SessionLocal() as db:
        add_sale(db, "C1", date(2026, 1, 1), StandardGrade.A, 2, 10)
        add_sale(db, "C1", date(2026, 1, 1), StandardGrade.B, 1, 20)
        add_sale(db, "C1", date(2026, 1, 2), StandardGrade.C, 4, 5)
        db.commit()

        trend = get_daily_trend(db, container_id="C1")

    assert trend == [
        {
            "sale_date": "2026-01-01",
            "sales_quantity": 3.0,
            "sales_amount": 40.0,
            "weighted_avg_price": 13.3333,
        },
        {
            "sale_date": "2026-01-02",
            "sales_quantity": 4.0,
            "sales_amount": 20.0,
            "weighted_avg_price": 5.0,
        },
    ]


def test_container_comparison_and_detail_reuse_the_same_metrics():
    with SessionLocal() as db:
        add_sale(db, "C1", date(2026, 1, 1), StandardGrade.A, 2, 10)
        add_sale(db, "C2", date(2026, 1, 1), StandardGrade.B, 4, 10)
        db.commit()

        comparison = get_container_comparison(db)
        detail = get_container_detail(db, "C1")

    assert [item["container_id"] for item in comparison] == ["C1", "C2"]
    assert comparison[0]["total"] == detail["total"]
    assert [item["grade"] for item in detail["grades"]] == ["A", "B", "C"]
    assert detail["sales_period"] == {
        "start_date": "2026-01-01",
        "end_date": "2026-01-01",
    }
    assert detail["settlement"] == {
        "after_sales_amount": None,
        "fee_amount": None,
        "customs_tax": None,
        "payable_amount": None,
    }


def test_container_detail_uses_latest_settlement_summary():
    with SessionLocal() as db:
        batch = ImportBatch(file_name="settlement.xlsx")
        db.add(batch)
        db.flush()
        add_sale(db, "C1", date(2026, 1, 1), StandardGrade.A, 1, 10)
        db.add(ContainerSummary(
            import_batch_id=batch.id,
            container_id="C1",
            after_sale_amount=Decimal("-10"),
        ))
        db.flush()
        db.add(ContainerSummary(
            import_batch_id=batch.id,
            container_id="C1",
            after_sale_amount=Decimal("-20"),
            customs_tax=Decimal("30"),
            payable_amount=Decimal("940"),
        ))
        db.commit()

        detail = get_container_detail(db, "C1")

    assert detail["settlement"] == {
        "after_sales_amount": -20.0,
        "fee_amount": None,
        "customs_tax": 30.0,
        "payable_amount": 940.0,
    }


def test_container_detail_records_follow_date_filter_and_include_source_ids():
    with SessionLocal() as db:
        batch = ImportBatch(file_name="sales.xlsx")
        db.add(batch)
        db.flush()
        source = SourceFile(
            import_batch_id=batch.id,
            file_name="sales.xlsx",
            file_hash="records-source",
        )
        db.add(source)
        db.flush()
        included = add_sale(db, "C1", date(2026, 1, 2), StandardGrade.B, 2, 15)
        included.import_batch_id = batch.id
        included.source_file_id = source.id
        included.grade_raw = "B级"
        included.spec_raw = "B6"
        add_sale(db, "C1", date(2026, 1, 1), StandardGrade.A, 1, 20)
        db.commit()
        included_id = included.id
        source_id = source.id
        batch_id = batch.id

        detail = get_container_detail(
            db, "C1", start_date=date(2026, 1, 2), end_date=date(2026, 1, 2)
        )

    assert detail["records"] == [{
        "id": included_id,
        "source_file_id": source_id,
        "import_batch_id": batch_id,
        "sale_date": "2026-01-02",
        "grade": "B",
        "grade_raw": "B级",
        "spec_raw": "B6",
        "quantity": 2.0,
        "unit_price": 15.0,
        "amount": 30.0,
    }]


def test_container_detail_explains_low_price_anomaly_with_record_ids():
    with SessionLocal() as db:
        low = add_sale(db, "LOW", date(2026, 1, 1), StandardGrade.A, 1, 5)
        add_sale(db, "BASE", date(2026, 1, 1), StandardGrade.A, 9, 15)
        db.commit()
        low_id = low.id

        detail = get_container_detail(db, "LOW")

    assert detail["operating_anomalies"] == [
        {
            "type": "low_weighted_avg_price",
            "reason": "货柜加权均价低于同期整体均价阈值",
            "metric": 5.0,
            "baseline": 14.0,
            "threshold": 0.8,
            "record_ids": [low_id],
        }
    ]


def test_low_price_threshold_is_configurable():
    thresholds = AnomalyThresholds(low_price_ratio=Decimal("0.3"))
    with SessionLocal() as db:
        add_sale(db, "LOW", date(2026, 1, 1), StandardGrade.A, 1, 5)
        add_sale(db, "BASE", date(2026, 1, 1), StandardGrade.A, 9, 15)
        db.commit()

        detail = get_container_detail(db, "LOW", thresholds=thresholds)

    assert detail["operating_anomalies"] == []


def test_container_detail_explains_largest_grade_structure_deviation():
    with SessionLocal() as db:
        target = add_sale(db, "TARGET", date(2026, 1, 1), StandardGrade.A, 10, 10)
        add_sale(db, "BASE", date(2026, 1, 1), StandardGrade.B, 10, 10)
        db.commit()
        target_id = target.id

        detail = get_container_detail(db, "TARGET")

    grade_anomaly = next(
        item
        for item in detail["operating_anomalies"]
        if item["type"] == "grade_share_deviation"
    )
    assert grade_anomaly == {
        "type": "grade_share_deviation",
        "reason": "货柜 A 等级销量占比较同期整体偏离超过阈值",
        "grade": "A",
        "metric": 1.0,
        "baseline": 0.5,
        "threshold": 0.25,
        "record_ids": [target_id],
    }


def test_container_detail_explains_daily_quantity_deviation():
    with SessionLocal() as db:
        add_sale(db, "C1", date(2026, 1, 1), StandardGrade.A, 10, 10)
        add_sale(db, "C1", date(2026, 1, 2), StandardGrade.A, 10, 10)
        unusual = add_sale(db, "C1", date(2026, 1, 3), StandardGrade.A, 100, 10)
        db.commit()
        unusual_id = unusual.id

        detail = get_container_detail(db, "C1")

    assert detail["operating_anomalies"] == [
        {
            "type": "daily_quantity_deviation",
            "reason": "日销量较同筛选范围中位数偏离超过阈值",
            "sale_date": "2026-01-03",
            "metric": 100.0,
            "baseline": 10.0,
            "threshold": 0.5,
            "record_ids": [unusual_id],
        }
    ]


def test_insufficient_samples_do_not_create_operating_anomalies():
    with SessionLocal() as db:
        add_sale(db, "C1", date(2026, 1, 1), StandardGrade.A, 10, 10)
        add_sale(db, "C1", date(2026, 1, 2), StandardGrade.A, 100, 10)
        db.commit()

        detail = get_container_detail(db, "C1")

    assert detail["operating_anomalies"] == []


def test_overview_reads_filtered_records_once(monkeypatch):
    with SessionLocal() as db:
        add_sale(db, "C1", date(2026, 1, 1), StandardGrade.A, 2, 10)
        db.commit()
        from app.services import analytics_service

        original = analytics_service._records
        calls = []

        def counted(*args, **kwargs):
            calls.append(kwargs)
            return original(*args, **kwargs)

        monkeypatch.setattr(analytics_service, "_records", counted)
        overview = get_overview(db)

    assert overview["total"]["sales_quantity"] == 2.0
    assert len(calls) == 1
