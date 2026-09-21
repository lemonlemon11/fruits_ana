"""按单号系列组织的多结算单对比分析。

系列取自结算单单号（``order_no``，例如 ``宝贝01``）的中文前缀；识别不出时归入
「未识别系列」，不影响其余结算单参与对比。对比主体仍是结算单（商号唯一）。
所有金额与每件均价口径与全站一致：每件均价 = 销售金额 ÷ 销量（件）。
系列识别与单号统一命名规则见 ``services/order_no_naming.py``（ADR-015）。
"""

from __future__ import annotations

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
from .order_no_naming import UNKNOWN_SERIES, order_no_display, series_name
from .merchant_no_naming import merchant_no_display


GRADE_VALUES = tuple(grade.value for grade in GRADES)


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


def settlement_series_names(db: Session, merchant_nos: Sequence[str]) -> list[str]:
    """返回所选结算单实际归属的品牌集合；没有匹配时返回空列表。"""

    if not merchant_nos:
        return []
    batches = (
        db.query(ImportBatch)
        .filter(ImportBatch.merchant_no.in_(list(dict.fromkeys(merchant_nos))))
        .all()
    )
    return sorted(
        {
            series_name(
                order_no_display(batch.order_no, batch.order_no_normalized)
                or batch.order_no
            )
            for batch in batches
        }
    )


def aggregate(records: list[SaleRecord]) -> dict:
    """结算单或系列层面的统一汇总口径。"""

    return {
        "total": metrics(records),
        "grades": grade_metrics(records),
        "grade_amount_shares": grade_amount_shares(records),
    }


def _settlement_row(batch: ImportBatch, records: list[SaleRecord]) -> dict:
    dates = [record.sale_date for record in records]
    order_no_normalized = order_no_display(batch.order_no, batch.order_no_normalized)
    return {
        "merchant_no": batch.merchant_no,
        "merchant_no_normalized": merchant_no_display(
            batch.merchant_no, batch.merchant_no_normalized
        ),
        "order_no": batch.order_no,
        "order_no_normalized": order_no_normalized,
        "series": series_name(order_no_normalized or batch.order_no),
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
    rows.sort(
        key=lambda row: (
            row["start_date"],
            row["order_no_normalized"] or row["order_no"] or "",
            row["merchant_no"],
        )
    )
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
        name = series_name(
            order_no_display(batch.order_no, batch.order_no_normalized) or batch.order_no
        )
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
    """返回所选结算单的各等级独立指标与系列汇总。"""

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
        "grade_details": grade_detail_metrics(filtered, batches),
    }


__all__ = [
    "UNKNOWN_SERIES",
    "aggregate",
    "get_series_comparison",
    "grade_amount_shares",
    "series_name",
    "settlement_series_names",
]
