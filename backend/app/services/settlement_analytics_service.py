"""按商号组织的对比、详情与异常计算。"""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from ..models import SaleRecord
from .analytics_core import (
    DEFAULT_THRESHOLDS,
    AnomalyThresholds,
    daily_quantity_anomalies,
    grade_contribution,
    grade_metrics,
    group_by_merchant,
    metrics,
    rank_values,
    raw_metrics,
    records as core_records,
    settlement_anomalies,
    settlement_map,
    share,
)
from .order_no_naming import order_no_display, series_name
from .merchant_no_naming import merchant_no_display
from .settlement_detail_service import record_payload


def _records(db: Session, **filters) -> list[SaleRecord]:
    return core_records(db, **filters)


def get_grade_summary(
    db: Session,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    merchant_no: str | None = None,
) -> dict:
    filtered = _records(
        db, start_date=start_date, end_date=end_date, merchant_no=merchant_no
    )
    return {"total": metrics(filtered), "grades": grade_metrics(filtered)}


def get_grade_breakdown(
    db: Session,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    merchant_no: str | None = None,
) -> dict:
    """返回等级图表所需的三块数据：等级汇总与销售明细。"""

    filtered = _records(
        db, start_date=start_date, end_date=end_date, merchant_no=merchant_no
    )
    return {
        "grades": grade_metrics(filtered),
        "records": [
            record_payload(record, include_piece_count=True) for record in filtered
        ],
    }


def get_overview(db: Session, **filters) -> dict:
    """兼容导出统一总览实现，避免多个入口各自计算口径。"""

    from .overview_service import get_overview as build_overview

    return build_overview(db, **filters)


def get_daily_trend(
    db: Session,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    merchant_no: str | None = None,
) -> list[dict]:
    grouped: dict[date, list[SaleRecord]] = defaultdict(list)
    for record in _records(
        db, start_date=start_date, end_date=end_date, merchant_no=merchant_no
    ):
        grouped[record.sale_date].append(record)
    return [
        {"sale_date": sale_date.isoformat(), **metrics(grouped[sale_date])}
        for sale_date in sorted(grouped)
    ]


def get_settlement_comparison(
    db: Session,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    merchant_no: str | None = None,
    include_all_settlements: bool = False,
) -> list[dict]:
    scope_merchant = None if include_all_settlements else merchant_no
    filtered = _records(
        db,
        start_date=start_date,
        end_date=end_date,
        merchant_no=scope_merchant,
    )
    batches = settlement_map(db, filtered)
    grouped = group_by_merchant(filtered, batches)
    totals = {key: raw_metrics(items) for key, items in grouped.items()}
    overall_quantity = sum(
        (item["quantity"] for item in totals.values()), Decimal("0")
    )
    overall_amount = sum((item["amount"] for item in totals.values()), Decimal("0"))
    rank_fields = {
        "sales_quantity": rank_values(totals, "quantity"),
        "sales_amount": rank_values(totals, "amount"),
        "weighted_avg_price": rank_values(totals, "average"),
    }
    items = []
    for merchant in sorted(grouped):
        current = grouped[merchant]
        dates = [record.sale_date for record in current]
        batch = batches[current[0].import_batch_id]
        items.append(
            {
                "merchant_no": merchant,
                "merchant_no_normalized": merchant_no_display(
                    batch.merchant_no, batch.merchant_no_normalized
                ),
                "order_no": batch.order_no,
                "order_no_normalized": order_no_display(
                    batch.order_no, batch.order_no_normalized
                ),
                "series": series_name(
                    order_no_display(batch.order_no, batch.order_no_normalized)
                    or batch.order_no
                ),
                "container_no": batch.container_no,
                "vehicle_no": batch.vehicle_no,
                "start_date": min(dates).isoformat(),
                "end_date": max(dates).isoformat(),
                "total": metrics(current),
                "grades": grade_metrics(current),
                "rank": {
                    field: ranks[merchant] for field, ranks in rank_fields.items()
                },
                "sales_quantity_share": share(
                    totals[merchant]["quantity"], overall_quantity
                ),
                "sales_amount_share": share(
                    totals[merchant]["amount"], overall_amount
                ),
                "grade_contribution": grade_contribution(current, overall_quantity),
            }
        )
    return items


def get_settlement_detail(
    db: Session,
    merchant_no: str,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    thresholds: AnomalyThresholds = DEFAULT_THRESHOLDS,
) -> dict | None:
    batch = get_settlement(db, merchant_no)
    if batch is None:
        return None
    current = _records(
        db, start_date=start_date, end_date=end_date, merchant_no=merchant_no
    )
    baseline = _records(db, start_date=start_date, end_date=end_date)
    batches = settlement_map(db, baseline)
    from .settlement_detail_service import get_settlement_context

    return {
        "merchant_no": batch.merchant_no,
        "merchant_no_normalized": merchant_no_display(
            batch.merchant_no, batch.merchant_no_normalized
        ),
        "order_no": batch.order_no,
        "order_no_normalized": order_no_display(
            batch.order_no, batch.order_no_normalized
        ),
        "container_no": batch.container_no,
        "vehicle_no": batch.vehicle_no,
        "source_type": batch.source_type,
        "market": batch.market,
        "arrival_date": batch.arrival_date.isoformat() if batch.arrival_date else None,
        "arrival_quantity": batch.arrival_quantity,
        "total": metrics(current),
        "grades": grade_metrics(current),
        "trend": get_daily_trend(
            db, start_date=start_date, end_date=end_date, merchant_no=merchant_no
        ),
        **get_settlement_context(db, batch, current),
        "operating_anomalies": [
            *settlement_anomalies(current, baseline, batches, thresholds),
            *daily_quantity_anomalies(current, thresholds),
        ],
    }


def get_settlement(db: Session, merchant_no: str):
    from ..models import ImportBatch

    return db.query(ImportBatch).filter_by(merchant_no=merchant_no).first()


def get_issue_counts(db: Session) -> dict[str, int]:
    from .issue_service import get_issue_counts as count_issues

    return count_issues(db)


def get_operating_anomalies(
    db: Session,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    merchant_no: str | None = None,
    thresholds: AnomalyThresholds = DEFAULT_THRESHOLDS,
) -> list[dict]:
    anomalies: list[dict] = []
    baseline = _records(db, start_date=start_date, end_date=end_date)
    baseline_batches = settlement_map(db, baseline)
    scoped = _records(
        db, start_date=start_date, end_date=end_date, merchant_no=merchant_no
    )
    scoped_batches = settlement_map(db, scoped)
    grouped = group_by_merchant(scoped, scoped_batches)
    for merchant in sorted(grouped):
        for anomaly in settlement_anomalies(
            grouped[merchant], baseline, baseline_batches, thresholds
        ):
            anomalies.append(
                {
                    "merchant_no": merchant,
                    "merchant_no_normalized": merchant_no_display(merchant),
                    **anomaly,
                }
            )
    for anomaly in daily_quantity_anomalies(scoped, thresholds):
        anomalies.append(
            {
                "merchant_no": merchant_no,
                "merchant_no_normalized": merchant_no_display(merchant_no),
                **anomaly,
            }
        )
    return anomalies


__all__ = [
    "DEFAULT_THRESHOLDS",
    "AnomalyThresholds",
    "get_daily_trend",
    "get_grade_breakdown",
    "get_grade_summary",
    "get_issue_counts",
    "get_operating_anomalies",
    "get_overview",
    "get_settlement",
    "get_settlement_comparison",
    "get_settlement_detail",
]
