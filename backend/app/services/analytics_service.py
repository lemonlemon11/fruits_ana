from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from statistics import median

from sqlalchemy.orm import Session

from ..models import DataIssue, SaleRecord, StandardGrade
from .container_detail_service import get_container_context


GRADES = tuple(StandardGrade)


@dataclass(frozen=True)
class AnomalyThresholds:
    """经营异常阈值及最小统计样本。"""
    low_price_ratio: Decimal = Decimal("0.8")
    grade_share_deviation: Decimal = Decimal("0.25")
    daily_quantity_deviation: Decimal = Decimal("0.5")
    min_container_count: int = 2
    min_daily_count: int = 3


DEFAULT_THRESHOLDS = AnomalyThresholds()


def _records(
    db: Session,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    container_id: str | None = None,
) -> list[SaleRecord]:
    query = db.query(SaleRecord)
    if start_date is not None:
        query = query.filter(SaleRecord.sale_date >= start_date)
    if end_date is not None:
        query = query.filter(SaleRecord.sale_date <= end_date)
    if container_id is not None:
        query = query.filter(SaleRecord.container_id == container_id)
    return query.order_by(SaleRecord.sale_date, SaleRecord.id).all()


def _rounded(value: Decimal) -> float:
    return round(float(value), 4)


def _metrics(records: list[SaleRecord]) -> dict:
    quantity = sum((item.quantity for item in records), Decimal("0"))
    amount = sum((item.amount for item in records), Decimal("0"))
    average = amount / quantity if quantity else None
    return {
        "sales_quantity": _rounded(quantity),
        "sales_amount": _rounded(amount),
        "weighted_avg_price": _rounded(average) if average is not None else None,
    }


def _grade_metrics(records: list[SaleRecord]) -> list[dict]:
    total_quantity = sum((item.quantity for item in records), Decimal("0"))
    result = []
    for grade in GRADES:
        metrics = _metrics([item for item in records if item.grade == grade])
        quantity = Decimal(str(metrics["sales_quantity"]))
        share = quantity / total_quantity if total_quantity else None
        result.append(
            {
                "grade": grade.value,
                **metrics,
                "quantity_share": _rounded(share) if share is not None else None,
            }
        )
    return result


def get_grade_summary(
    db: Session,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    container_id: str | None = None,
) -> dict:
    filtered = _records(
        db, start_date=start_date, end_date=end_date, container_id=container_id
    )
    return {"total": _metrics(filtered), "grades": _grade_metrics(filtered)}


def get_overview(db: Session, **filters) -> dict:
    """兼容导出统一总览实现，避免多个入口各自计算口径。"""
    from .overview_service import get_overview as build_overview

    return build_overview(db, **filters)


def get_daily_trend(
    db: Session,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    container_id: str | None = None,
) -> list[dict]:
    grouped = defaultdict(list)
    for record in _records(
        db, start_date=start_date, end_date=end_date, container_id=container_id
    ):
        grouped[record.sale_date].append(record)
    return [
        {"sale_date": sale_date.isoformat(), **_metrics(grouped[sale_date])}
        for sale_date in sorted(grouped)
    ]


def get_container_comparison(
    db: Session,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    container_id: str | None = None,
) -> list[dict]:
    grouped = defaultdict(list)
    for record in _records(
        db, start_date=start_date, end_date=end_date, container_id=container_id
    ):
        grouped[record.container_id].append(record)
    return [
        {
            "container_id": current_id,
            "total": _metrics(grouped[current_id]),
            "grades": _grade_metrics(grouped[current_id]),
        }
        for current_id in sorted(grouped)
    ]


def _grade_shares(records: list[SaleRecord]) -> dict[StandardGrade, Decimal] | None:
    total = sum((record.quantity for record in records), Decimal("0"))
    if not total:
        return None
    return {
        grade: sum(
            (record.quantity for record in records if record.grade == grade),
            Decimal("0"),
        )
        / total
        for grade in GRADES
    }


def _container_anomalies(
    records: list[SaleRecord],
    baseline_records: list[SaleRecord],
    thresholds: AnomalyThresholds,
) -> list[dict]:
    container_count = len({record.container_id for record in baseline_records})
    if not records or container_count < thresholds.min_container_count:
        return []
    metric = _raw_average(records)
    baseline = _raw_average(baseline_records)
    anomalies = []
    if metric is not None and baseline is not None and (
        metric < baseline * thresholds.low_price_ratio
    ):
        anomalies.append({
            "type": "low_weighted_avg_price",
            "reason": "货柜加权均价低于同期整体均价阈值",
            "metric": _rounded(metric),
            "baseline": _rounded(baseline),
            "threshold": _rounded(thresholds.low_price_ratio),
            "record_ids": [record.id for record in records],
        })
    shares = _grade_shares(records)
    baseline_shares = _grade_shares(baseline_records)
    if shares is None or baseline_shares is None:
        return anomalies
    grade = max(GRADES, key=lambda item: abs(shares[item] - baseline_shares[item]))
    deviation = abs(shares[grade] - baseline_shares[grade])
    if deviation > thresholds.grade_share_deviation:
        anomalies.append({
            "type": "grade_share_deviation",
            "reason": f"货柜 {grade.value} 等级销量占比较同期整体偏离超过阈值",
            "grade": grade.value,
            "metric": _rounded(shares[grade]),
            "baseline": _rounded(baseline_shares[grade]),
            "threshold": _rounded(thresholds.grade_share_deviation),
            "record_ids": [record.id for record in records],
        })
    return anomalies


def _daily_quantity_anomalies(
    records: list[SaleRecord], thresholds: AnomalyThresholds
) -> list[dict]:
    grouped = defaultdict(list)
    for record in records:
        grouped[record.sale_date].append(record)
    if len(grouped) < thresholds.min_daily_count:
        return []
    quantities = {
        day: sum((record.quantity for record in items), Decimal("0"))
        for day, items in grouped.items()
    }
    baseline = median(quantities.values())
    if baseline <= 0:
        return []
    anomalies = []
    for day in sorted(grouped):
        deviation = abs(quantities[day] - baseline) / baseline
        if deviation > thresholds.daily_quantity_deviation:
            anomalies.append({
                "type": "daily_quantity_deviation",
                "reason": "日销量较同筛选范围中位数偏离超过阈值",
                "sale_date": day.isoformat(),
                "metric": _rounded(quantities[day]),
                "baseline": _rounded(baseline),
                "threshold": _rounded(thresholds.daily_quantity_deviation),
                "record_ids": [record.id for record in grouped[day]],
            })
    return anomalies


def _raw_average(records: list[SaleRecord]) -> Decimal | None:
    quantity = sum((item.quantity for item in records), Decimal("0"))
    amount = sum((item.amount for item in records), Decimal("0"))
    return amount / quantity if quantity else None


def get_container_detail(
    db: Session,
    container_id: str,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    thresholds: AnomalyThresholds = DEFAULT_THRESHOLDS,
) -> dict | None:
    exists = db.query(SaleRecord.id).filter_by(container_id=container_id).first()
    if exists is None:
        return None
    records = _records(
        db,
        start_date=start_date,
        end_date=end_date,
        container_id=container_id,
    )
    baseline = _records(db, start_date=start_date, end_date=end_date)
    return {
        "container_id": container_id,
        **{"total": _metrics(records), "grades": _grade_metrics(records)},
        "trend": get_daily_trend(
            db,
            start_date=start_date,
            end_date=end_date,
            container_id=container_id,
        ),
        **get_container_context(db, container_id, records),
        "operating_anomalies": [
            *_container_anomalies(records, baseline, thresholds),
            *_daily_quantity_anomalies(records, thresholds),
        ],
    }


def get_issue_counts(db: Session) -> dict[str, int]:
    from .issue_service import get_issue_counts as count_issues

    return count_issues(db)


def get_operating_anomalies(
    db: Session,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    container_id: str | None = None,
    thresholds: AnomalyThresholds = DEFAULT_THRESHOLDS,
) -> list[dict]:
    anomalies = []
    baseline = _records(db, start_date=start_date, end_date=end_date)
    scope_records = _records(
        db, start_date=start_date, end_date=end_date, container_id=container_id
    )
    grouped = defaultdict(list)
    for record in scope_records:
        grouped[record.container_id].append(record)
    for current_id in sorted(grouped):
        for anomaly in _container_anomalies(
            grouped[current_id], baseline, thresholds
        ):
            anomalies.append({"container_id": current_id, **anomaly})
    for anomaly in _daily_quantity_anomalies(scope_records, thresholds):
        anomalies.append({"container_id": container_id, **anomaly})
    return anomalies
