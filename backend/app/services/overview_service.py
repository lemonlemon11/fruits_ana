"""一次读取明细并组装按商号组织的总览响应。"""

from __future__ import annotations

from collections import defaultdict
from datetime import date

from sqlalchemy.orm import Session

from .analytics_core import (
    DEFAULT_THRESHOLDS,
    AnomalyThresholds,
    daily_quantity_anomalies,
    grade_metrics,
    group_by_merchant,
    metrics,
    records,
    settlement_anomalies,
    settlement_map,
)
from .issue_service import get_issue_counts
from .merchant_no_naming import merchant_no_display
from .order_no_naming import order_no_display


def get_overview(
    db: Session,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    merchant_no: str | None = None,
    thresholds: AnomalyThresholds = DEFAULT_THRESHOLDS,
) -> dict:
    filtered = records(
        db, start_date=start_date, end_date=end_date, merchant_no=merchant_no
    )
    batches = settlement_map(db, filtered)
    by_day: dict[date, list] = defaultdict(list)
    for record in filtered:
        by_day[record.sale_date].append(record)
    grouped = group_by_merchant(filtered, batches)
    if merchant_no is None:
        baseline, baseline_batches = filtered, batches
    else:
        baseline = records(db, start_date=start_date, end_date=end_date)
        baseline_batches = settlement_map(db, baseline)
    anomalies = []
    for key, items in grouped.items():
        anomalies.extend(
            {"merchant_no": key, "merchant_no_normalized": merchant_no_display(key), **item}
            for item in settlement_anomalies(items, baseline, baseline_batches, thresholds)
        )
    anomalies.extend(
        {
            "merchant_no": merchant_no,
            "merchant_no_normalized": merchant_no_display(merchant_no),
            **item,
        }
        for item in daily_quantity_anomalies(filtered, thresholds)
    )
    return {
        "total": metrics(filtered),
        "grades": grade_metrics(filtered),
        "trend": [
            {"sale_date": day.isoformat(), **metrics(by_day[day])}
            for day in sorted(by_day)
        ],
        "settlements": [
            {
                "merchant_no": key,
                "merchant_no_normalized": merchant_no_display(
                    batches[items[0].import_batch_id].merchant_no,
                    batches[items[0].import_batch_id].merchant_no_normalized,
                ),
                "order_no": batches[items[0].import_batch_id].order_no,
                "order_no_normalized": order_no_display(
                    batches[items[0].import_batch_id].order_no,
                    batches[items[0].import_batch_id].order_no_normalized,
                ),
                "container_no": batches[items[0].import_batch_id].container_no,
                "total": metrics(items),
                "grades": grade_metrics(items),
            }
            for key, items in sorted(grouped.items())
        ],
        "issue_counts": get_issue_counts(db),
        "operating_anomalies": anomalies,
    }
