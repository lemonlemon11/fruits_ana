"""细分等级聚合用例。"""

from datetime import date
from decimal import Decimal

import pytest

from app.models import ImportBatch, SaleRecord, StandardGrade
from app.services.grade_detail_service import grade_detail_metrics


def make_record(
    grade_raw: str,
    quantity: str,
    amount: str,
    *,
    grade: StandardGrade,
    fruit_type: str = "榴莲",
) -> SaleRecord:
    return SaleRecord(
        sale_date=date(2026, 9, 1),
        fruit_type=fruit_type,
        grade_raw=grade_raw,
        grade=grade,
        quantity=Decimal(quantity),
        unit_price=Decimal(amount) / Decimal(quantity),
        amount=Decimal(amount),
    )


def test_ranges_stay_as_their_own_bucket() -> None:
    records = [
        make_record("B6/7(19KG)", "100", "40000", grade=StandardGrade.B),
        make_record("B6", "50", "22000", grade=StandardGrade.B),
    ]
    result = grade_detail_metrics(records)
    labels = [row["label"] for row in result["buckets"]]
    assert labels == ["B6", "B6/7"]
    bucket = next(row for row in result["buckets"] if row["label"] == "B6/7")
    assert bucket["sales_quantity"] == 100.0
    assert bucket["weighted_avg_price"] == 400.0
    assert bucket["quantity_share"] == pytest.approx(100 / 150, rel=1e-4)


def test_bc_folds_into_c() -> None:
    records = [make_record("BC8（17KG）", "10", "3000", grade=StandardGrade.C)]
    result = grade_detail_metrics(records)
    assert result["buckets"][0]["label"] == "C8"
    assert result["buckets"][0]["grade"] == "C"


def test_quality_marks_do_not_split_buckets() -> None:
    records = [
        make_record("A6熟", "10", "5000", grade=StandardGrade.A),
        make_record("A6熟/裂", "10", "4600", grade=StandardGrade.A),
    ]
    result = grade_detail_metrics(records)
    assert len(result["buckets"]) == 1
    bucket = result["buckets"][0]
    assert bucket["label"] == "A6"
    assert bucket["quality_marks"] == ["熟", "裂"]
    assert bucket["record_count"] == 2


def test_unrecognized_values_are_counted_not_dropped() -> None:
    records = [
        make_record("A5", "10", "5000", grade=StandardGrade.A),
        make_record("特级", "7", "2100", grade=StandardGrade.A),
    ]
    result = grade_detail_metrics(records)
    assert result["unrecognized"]["record_count"] == 1
    assert result["unrecognized"]["sales_quantity"] == 7.0
    assert len(result["buckets"]) == 1


def test_buckets_are_grouped_per_fruit_type() -> None:
    records = [
        make_record("A5", "10", "5000", grade=StandardGrade.A),
        make_record("A5", "3", "900", grade=StandardGrade.A, fruit_type="红毛丹"),
    ]
    result = grade_detail_metrics(records)
    assert {row["fruit_type"] for row in result["buckets"]} == {"榴莲", "红毛丹"}
    assert all(row["label"] == "A5" for row in result["buckets"])
    quantities = {row["fruit_type"]: row["sales_quantity"] for row in result["buckets"]}
    assert quantities == {"榴莲": 10.0, "红毛丹": 3.0}


def test_empty_input_returns_zero_total() -> None:
    result = grade_detail_metrics([])
    assert result["buckets"] == []
    assert result["total"]["sales_quantity"] == 0.0
    assert result["total"]["weighted_avg_price"] is None
