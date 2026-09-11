"""数据明细列表：按商号汇总结算单指标，并计算默认时间范围。"""

from __future__ import annotations

import calendar
from collections import defaultdict
from datetime import date
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models import ImportBatch, SaleRecord
from .analytics_core import GRADES, rounded
from .merchant_no_naming import merchant_no_display
from .order_no_naming import order_no_display
from .series_analytics_service import series_name


def one_month_before(value: date) -> date:
    """返回往前一个自然月；日序号溢出时取目标月最后一天。"""

    if value.month == 1:
        year, month = value.year - 1, 12
    else:
        year, month = value.year, value.month - 1
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(value.day, last_day))


def _grade_quantities(records: list[SaleRecord]) -> dict[str, float]:
    return {
        grade.value: rounded(
            sum(
                (record.quantity for record in records if record.grade == grade),
                Decimal("0"),
            )
        )
        for grade in GRADES
    }


def list_settlements(
    db: Session,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    merchant_no: str | None = None,
) -> dict:
    """按结算单汇总指定日期范围内的销售明细。

    未传日期时使用 ``[最新销售日期 - 1 个月, 最新销售日期]``，含两端；
    范围内没有明细的结算单不返回。
    """

    latest = db.query(func.max(SaleRecord.sale_date)).scalar()
    if latest is None:
        return {"date_range": None, "settlements": []}
    is_default = start_date is None and end_date is None
    start = start_date or one_month_before(latest)
    end = end_date or latest

    query = (
        db.query(SaleRecord)
        .join(ImportBatch, SaleRecord.import_batch_id == ImportBatch.id)
        .filter(SaleRecord.sale_date >= start, SaleRecord.sale_date <= end)
    )
    if merchant_no:
        query = query.filter(ImportBatch.merchant_no == merchant_no)
    records = query.order_by(SaleRecord.sale_date, SaleRecord.id).all()

    batch_ids = {record.import_batch_id for record in records if record.import_batch_id}
    batches = (
        {
            batch.id: batch
            for batch in db.query(ImportBatch)
            .filter(ImportBatch.id.in_(batch_ids))
            .all()
        }
        if batch_ids
        else {}
    )
    grouped: dict[int, list[SaleRecord]] = defaultdict(list)
    for record in records:
        grouped[record.import_batch_id].append(record)

    items = []
    for batch_id, current in grouped.items():
        batch = batches.get(batch_id)
        if batch is None:
            continue
        amount = sum((record.amount for record in current), Decimal("0"))
        quantity = sum((record.quantity for record in current), Decimal("0"))
        dates = [record.sale_date for record in current]
        items.append(
            {
                "merchant_no": batch.merchant_no,
                "merchant_no_normalized": merchant_no_display(
                    batch.merchant_no, batch.merchant_no_normalized
                ),
                "order_no": batch.order_no,
                "order_no_normalized": order_no_display(
                    batch.order_no, batch.order_no_normalized
                ),
                "series": series_name(
                    batch.order_no_normalized or batch.order_no
                ),
                "container_no": batch.container_no,
                "vehicle_no": batch.vehicle_no,
                "sale_date_start": min(dates),
                "sale_date_end": max(dates),
                "sales_amount": rounded(amount),
                "total_quantity": rounded(quantity),
                "average_price": rounded(amount / quantity) if quantity else None,
                "grade_quantities": _grade_quantities(current),
                "record_count": len(current),
            }
        )
    items.sort(key=lambda item: (item["sale_date_end"], item["merchant_no"]), reverse=True)
    return {
        "date_range": {
            "start_date": start,
            "end_date": end,
            "is_default": is_default,
        },
        "settlements": items,
    }


__all__ = ["list_settlements", "one_month_before"]
