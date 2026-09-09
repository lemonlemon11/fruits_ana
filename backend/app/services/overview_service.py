"""一次读取明细并组装总览响应。"""

from __future__ import annotations

from collections import defaultdict
from datetime import date

from sqlalchemy.orm import Session

from .analytics_service import (
    DEFAULT_THRESHOLDS,
    AnomalyThresholds,
    _container_anomalies,
    _daily_quantity_anomalies,
    _grade_metrics,
    _metrics,
    _records,
    get_issue_counts,
)


def get_overview(
    db: Session,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    container_id: str | None = None,
    thresholds: AnomalyThresholds = DEFAULT_THRESHOLDS,
) -> dict:
    records = _records(db, start_date=start_date, end_date=end_date, container_id=container_id)
    by_day, by_container = defaultdict(list), defaultdict(list)
    for record in records:
        by_day[record.sale_date].append(record)
        by_container[record.container_id].append(record)
    baseline = records if container_id is None else _records(db, start_date=start_date, end_date=end_date)
    anomalies = []
    for key, items in by_container.items():
        anomalies.extend({"container_id": key, **item} for item in _container_anomalies(items, baseline, thresholds))
    anomalies.extend({"container_id": container_id, **item} for item in _daily_quantity_anomalies(records, thresholds))
    return {
        "total": _metrics(records), "grades": _grade_metrics(records),
        "trend": [{"sale_date": day.isoformat(), **_metrics(by_day[day])} for day in sorted(by_day)],
        "containers": [{"container_id": key, "total": _metrics(items), "grades": _grade_metrics(items)} for key, items in sorted(by_container.items())],
        "issue_counts": get_issue_counts(db), "operating_anomalies": anomalies,
    }
