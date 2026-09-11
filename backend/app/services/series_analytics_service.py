"""按单号系列组织的多结算单对比分析。

系列取自结算单单号（``order_no``，例如 ``宝贝01``）的中文前缀；识别不出时归入
「未识别系列」，不影响其余结算单参与对比。对比主体仍是结算单（商号唯一）。
所有金额与均价口径与全站一致：均价 = 销售金额 ÷ 件数。
"""

from __future__ import annotations

import re
from collections import defaultdict
from collections.abc import Sequence
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from ..models import ImportBatch, SaleRecord
from .analytics_core import (
    GRADES,
    grade_metrics,
    group_by_merchant,
    metrics,
    records as core_records,
    rounded,
    settlement_map,
    share,
)
from .grade_detail_service import grade_detail_metrics


UNKNOWN_SERIES = "未识别系列"
GRADE_VALUES = tuple(grade.value for grade in GRADES)
_SERIES_PREFIX = re.compile(r"^[\u4e00-\u9fff]+")


def series_name(order_no: str | None) -> str:
    """从单号提取系列名，模板为「中文系列名 + 字母或数字后缀」。"""

    if not order_no:
        return UNKNOWN_SERIES
    matched = _SERIES_PREFIX.match(order_no.strip())
    return matched.group(0) if matched else UNKNOWN_SERIES


def grade_amount_shares(records: list[SaleRecord]) -> dict[str, float | None]:
    """各等级金额占当前范围总金额的比例。"""

    total = sum((item.amount for item in records), Decimal("0"))
    return {
        grade: share(
            sum(
                (item.amount for item in records if item.grade.value == grade),
                Decimal("0"),
            ),
            total,
        )
        for grade in GRADE_VALUES
    }


def _grade_prices(records: list[SaleRecord]) -> dict[str, Decimal | None]:
    prices: dict[str, Decimal | None] = {}
    for grade in GRADE_VALUES:
        current = [item for item in records if item.grade.value == grade]
        quantity = sum((item.quantity for item in current), Decimal("0"))
        amount = sum((item.amount for item in current), Decimal("0"))
        prices[grade] = amount / quantity if quantity else None
    return prices


def _difference(left: Decimal | None, right: Decimal | None) -> float | None:
    if left is None or right is None:
        return None
    return rounded(left - right)


def price_spread(records: list[SaleRecord]) -> dict:
    """A-B 价差、B-C 价差与 B 相对 A 的折价比例；缺等级时返回空值。"""

    prices = _grade_prices(records)
    grade_a, grade_b, grade_c = prices["A"], prices["B"], prices["C"]
    discount = (
        (grade_a - grade_b) / grade_a if grade_a and grade_b is not None else None
    )
    return {
        "a_minus_b": _difference(grade_a, grade_b),
        "b_minus_c": _difference(grade_b, grade_c),
        "b_discount_vs_a": rounded(discount) if discount is not None else None,
        "grade_prices": {
            grade: rounded(value) if value is not None else None
            for grade, value in prices.items()
        },
    }


def aggregate(records: list[SaleRecord]) -> dict:
    """结算单或系列层面的统一汇总口径。"""

    return {
        "total": metrics(records),
        "grades": grade_metrics(records),
        "grade_amount_shares": grade_amount_shares(records),
        "spread": price_spread(records),
    }


def _settlement_row(batch: ImportBatch, records: list[SaleRecord]) -> dict:
    dates = [record.sale_date for record in records]
    return {
        "merchant_no": batch.merchant_no,
        "order_no": batch.order_no,
        "series": series_name(batch.order_no),
        "container_no": batch.container_no,
        "vehicle_no": batch.vehicle_no,
        "start_date": min(dates).isoformat(),
        "end_date": max(dates).isoformat(),
        **aggregate(records),
    }


def _sorted_settlement_rows(
    grouped: dict[str, list[SaleRecord]], batches: dict[int, ImportBatch]
) -> list[dict]:
    rows = [
        _settlement_row(batches[items[0].import_batch_id], items)
        for items in grouped.values()
        if items and items[0].import_batch_id in batches
    ]
    rows.sort(key=lambda row: (row["start_date"], row["order_no"] or "", row["merchant_no"]))
    return rows


def _series_rows(
    grouped: dict[str, list[SaleRecord]], batches: dict[int, ImportBatch]
) -> list[dict]:
    records_by_series: dict[str, list[SaleRecord]] = defaultdict(list)
    members: dict[str, list[str]] = defaultdict(list)
    for merchant_no, items in grouped.items():
        if not items or items[0].import_batch_id not in batches:
            continue
        batch = batches[items[0].import_batch_id]
        name = series_name(batch.order_no)
        records_by_series[name].extend(items)
        members[name].append(merchant_no)
    return [
        {
            "name": name,
            "merchant_nos": sorted(members[name]),
            "settlement_count": len(members[name]),
            **aggregate(records_by_series[name]),
        }
        for name in sorted(records_by_series)
    ]


def get_series_comparison(
    db: Session,
    *,
    merchant_nos: Sequence[str] | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
) -> dict:
    """返回所选结算单的 A/B/C 独立指标、价差与系列汇总。"""

    filtered = core_records(
        db,
        start_date=start_date,
        end_date=end_date,
        merchant_nos=merchant_nos,
    )
    batches = settlement_map(db, filtered)
    grouped = group_by_merchant(filtered, batches)
    return {
        "settlements": _sorted_settlement_rows(grouped, batches),
        "series": _series_rows(grouped, batches),
        "total": aggregate(filtered),
        "grade_details": grade_detail_metrics(filtered),
    }


__all__ = [
    "UNKNOWN_SERIES",
    "aggregate",
    "get_series_comparison",
    "grade_amount_shares",
    "price_spread",
    "series_name",
]
