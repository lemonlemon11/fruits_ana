"""数据明细列表：按商号汇总结算单指标，支持关键词模糊搜索与分页。"""

from __future__ import annotations

import calendar
from collections import defaultdict
from datetime import date
from decimal import Decimal

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..models import ImportBatch, SaleRecord
from .analytics_core import GRADES, rounded
from .merchant_no_naming import merchant_no_display
from .order_no_naming import order_no_display
from .series_analytics_service import series_name


PAGE_SIZE_DEFAULT = 10
PAGE_SIZE_MAX = 100
LIKE_ESCAPE = "\\"
# 模糊搜索覆盖「原始写法 + 适配后写法」，页面展示哪一列都能搜到。
KEYWORD_COLUMNS = (
    ImportBatch.merchant_no,
    ImportBatch.merchant_no_normalized,
    ImportBatch.order_no,
    ImportBatch.order_no_normalized,
    ImportBatch.container_no,
    ImportBatch.vehicle_no,
)


def _keyword_pattern(keyword: str) -> str:
    """把用户输入转成 LIKE 模式，并转义 %、_ 与反斜杠，避免被当通配符。"""

    cleaned = (
        keyword.strip()
        .replace(LIKE_ESCAPE, LIKE_ESCAPE * 2)
        .replace("%", f"{LIKE_ESCAPE}%")
        .replace("_", f"{LIKE_ESCAPE}_")
    )
    return f"%{cleaned}%"


def _apply_keyword(query, keyword: str):
    """在商号 / 单号 / 柜号 / 车牌上做包含匹配，避免前端拉全量再过滤。"""

    pattern = _keyword_pattern(keyword)
    return query.filter(
        or_(*(column.like(pattern, escape=LIKE_ESCAPE) for column in KEYWORD_COLUMNS))
    )


def _pagination_info(total: int, page: int | None, page_size: int | None) -> dict:
    size = min(max(page_size or PAGE_SIZE_DEFAULT, 1), PAGE_SIZE_MAX)
    pages = max(1, (total + size - 1) // size)
    safe_page = min(max(page or 1, 1), pages)
    return {"total": total, "page": safe_page, "page_size": size, "pages": pages}


def _payload(
    date_range: dict | None,
    items: list[dict],
    page: int | None,
    page_size: int | None,
) -> dict:
    """不传分页参数时保持全量返回，传入时只回当页并附 ``pagination``。"""

    if page is None and page_size is None:
        return {"date_range": date_range, "settlements": items, "pagination": None}
    info = _pagination_info(len(items), page, page_size)
    start = (info["page"] - 1) * info["page_size"]
    return {
        "date_range": date_range,
        "settlements": items[start : start + info["page_size"]],
        "pagination": info,
    }


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
    keyword: str | None = None,
    page: int | None = None,
    page_size: int | None = None,
) -> dict:
    """按结算单汇总指定日期范围内的销售明细。

    未传日期时使用 ``[最新销售日期 - 1 个月, 最新销售日期]``，含两端；
    范围内没有明细的结算单不返回。``keyword`` 在商号 / 单号 / 柜号 / 车牌上做
    模糊匹配；``page`` / ``page_size`` 只会切分返回的列表，不影响 ``date_range``。
    """

    latest = db.query(func.max(SaleRecord.sale_date)).scalar()
    if latest is None:
        return _payload(None, [], page, page_size)
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
    if keyword and keyword.strip():
        query = _apply_keyword(query, keyword)
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
    return _payload(
        {"start_date": start, "end_date": end, "is_default": is_default},
        items,
        page,
        page_size,
    )


__all__ = [
    "PAGE_SIZE_DEFAULT",
    "PAGE_SIZE_MAX",
    "list_settlements",
    "one_month_before",
]
