"""通用销售记录筛选与指标计算。

所有分析口径以「商号」作为结算单维度：记录通过 ``import_batch_id`` 关联结算单，
柜号不再是查询维度。
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from statistics import median

from sqlalchemy.orm import Session

from ..models import ImportBatch, SaleRecord, StandardGrade


GRADES = tuple(StandardGrade)


@dataclass(frozen=True)
class AnomalyThresholds:
    """经营异常阈值及最小统计样本。"""

    low_price_ratio: Decimal = Decimal("0.8")
    grade_share_deviation: Decimal = Decimal("0.25")
    daily_quantity_deviation: Decimal = Decimal("0.5")
    min_settlement_count: int = 2
    min_daily_count: int = 3


DEFAULT_THRESHOLDS = AnomalyThresholds()


def records(
    db: Session,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    merchant_no: str | None = None,
) -> list[SaleRecord]:
    """按日期与商号筛选销售记录。"""

    query = db.query(SaleRecord)
    if merchant_no is not None:
        query = query.join(
            ImportBatch, SaleRecord.import_batch_id == ImportBatch.id
        ).filter(ImportBatch.merchant_no == merchant_no)
    if start_date is not None:
        query = query.filter(SaleRecord.sale_date >= start_date)
    if end_date is not None:
        query = query.filter(SaleRecord.sale_date <= end_date)
    return query.order_by(SaleRecord.sale_date, SaleRecord.id).all()


def settlement_map(
    db: Session, records: list[SaleRecord]
) -> dict[int, ImportBatch]:
    """批量读取记录所属结算单，避免逐行懒加载。"""

    batch_ids = {item.import_batch_id for item in records if item.import_batch_id}
    if not batch_ids:
        return {}
    batches = db.query(ImportBatch).filter(ImportBatch.id.in_(batch_ids)).all()
    return {batch.id: batch for batch in batches}


def group_by_merchant(
    records: list[SaleRecord], batches: dict[int, ImportBatch]
) -> dict[str, list[SaleRecord]]:
    """按商号分组；缺少结算单归属的记录不参与分组。"""

    grouped: dict[str, list[SaleRecord]] = defaultdict(list)
    for record in records:
        batch = batches.get(record.import_batch_id or -1)
        if batch is not None:
            grouped[batch.merchant_no].append(record)
    return grouped


def rounded(value: Decimal) -> float:
    return round(float(value), 4)


def metrics(records: list[SaleRecord]) -> dict:
    quantity = sum((item.quantity for item in records), Decimal("0"))
    amount = sum((item.amount for item in records), Decimal("0"))
    average = amount / quantity if quantity else None
    return {
        "sales_quantity": rounded(quantity),
        "sales_amount": rounded(amount),
        "weighted_avg_price": rounded(average) if average is not None else None,
    }


def grade_metrics(records: list[SaleRecord]) -> list[dict]:
    total_quantity = sum((item.quantity for item in records), Decimal("0"))
    result = []
    for grade in GRADES:
        current = metrics([item for item in records if item.grade == grade])
        quantity = Decimal(str(current["sales_quantity"]))
        share = quantity / total_quantity if total_quantity else None
        result.append(
            {
                "grade": grade.value,
                **current,
                "quantity_share": rounded(share) if share is not None else None,
            }
        )
    return result


def raw_metrics(records: list[SaleRecord]) -> dict[str, Decimal | None]:
    quantity = sum((item.quantity for item in records), Decimal("0"))
    amount = sum((item.amount for item in records), Decimal("0"))
    return {
        "quantity": quantity,
        "amount": amount,
        "average": amount / quantity if quantity else None,
    }


def rank_values(
    totals: dict[str, dict[str, Decimal | None]], field: str
) -> dict[str, int | None]:
    ordered = sorted(
        (item for item in totals.items() if item[1][field] is not None),
        key=lambda item: item[1][field],
        reverse=True,
    )
    ranks: dict[str, int | None] = {key: None for key in totals}
    previous: Decimal | None = None
    previous_rank = 0
    for position, (key, item) in enumerate(ordered, start=1):
        value = item[field]
        if value is None:
            continue
        if previous is None or value != previous:
            previous_rank = position
            previous = value
        ranks[key] = previous_rank
    return ranks


def share(part: Decimal, total: Decimal) -> float | None:
    return rounded(part / total) if total else None


def grade_contribution(
    records: list[SaleRecord], overall_quantity: Decimal
) -> dict[str, float | None]:
    return {
        grade.value: share(
            sum(
                (record.quantity for record in records if record.grade == grade),
                Decimal("0"),
            ),
            overall_quantity,
        )
        for grade in GRADES
    }


def grade_shares(records: list[SaleRecord]) -> dict[StandardGrade, Decimal] | None:
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


def raw_average(records: list[SaleRecord]) -> Decimal | None:
    quantity = sum((item.quantity for item in records), Decimal("0"))
    amount = sum((item.amount for item in records), Decimal("0"))
    return amount / quantity if quantity else None


def daily_quantity_anomalies(
    records: list[SaleRecord], thresholds: AnomalyThresholds = DEFAULT_THRESHOLDS
) -> list[dict]:
    grouped: dict[date, list[SaleRecord]] = defaultdict(list)
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
            anomalies.append(
                {
                    "type": "daily_quantity_deviation",
                    "reason": "日销量较同筛选范围中位数偏离超过阈值",
                    "sale_date": day.isoformat(),
                    "metric": rounded(quantities[day]),
                    "baseline": rounded(baseline),
                    "threshold": rounded(thresholds.daily_quantity_deviation),
                    "record_ids": [record.id for record in grouped[day]],
                }
            )
    return anomalies


def settlement_anomalies(
    records: list[SaleRecord],
    baseline_records: list[SaleRecord],
    batches: dict[int, ImportBatch],
    thresholds: AnomalyThresholds = DEFAULT_THRESHOLDS,
) -> list[dict]:
    """对比同期其他结算单，返回均价与等级占比异常。"""

    settlement_count = len(
        {
            batches[item.import_batch_id].merchant_no
            for item in baseline_records
            if item.import_batch_id in batches
        }
    )
    if not records or settlement_count < thresholds.min_settlement_count:
        return []
    metric = raw_average(records)
    baseline = raw_average(baseline_records)
    anomalies = []
    if (
        metric is not None
        and baseline is not None
        and metric < baseline * thresholds.low_price_ratio
    ):
        anomalies.append(
            {
                "type": "low_weighted_avg_price",
                "reason": "结算单加权均价低于同期整体均价阈值",
                "metric": rounded(metric),
                "baseline": rounded(baseline),
                "threshold": rounded(thresholds.low_price_ratio),
                "record_ids": [record.id for record in records],
            }
        )
    shares = grade_shares(records)
    baseline_shares = grade_shares(baseline_records)
    if shares is None or baseline_shares is None:
        return anomalies
    grade = max(GRADES, key=lambda item: abs(shares[item] - baseline_shares[item]))
    deviation = abs(shares[grade] - baseline_shares[grade])
    if deviation > thresholds.grade_share_deviation:
        anomalies.append(
            {
                "type": "grade_share_deviation",
                "reason": f"结算单 {grade.value} 等级销量占比较同期整体偏离超过阈值",
                "grade": grade.value,
                "metric": rounded(shares[grade]),
                "baseline": rounded(baseline_shares[grade]),
                "threshold": rounded(thresholds.grade_share_deviation),
                "record_ids": [record.id for record in records],
            }
        )
    return anomalies


__all__ = [
    "AnomalyThresholds",
    "DEFAULT_THRESHOLDS",
    "GRADES",
    "daily_quantity_anomalies",
    "grade_contribution",
    "grade_metrics",
    "grade_shares",
    "group_by_merchant",
    "metrics",
    "rank_values",
    "raw_average",
    "raw_metrics",
    "records",
    "rounded",
    "settlement_anomalies",
    "settlement_map",
    "share",
]
