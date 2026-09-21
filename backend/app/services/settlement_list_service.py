"""数据明细列表：按商号汇总结算单指标，支持关键词模糊搜索与分页。"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session

from ..models import ImportBatch, SaleRecord
from .analytics_core import GRADES, one_month_before, rounded
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
    total: int | None = None,
) -> dict:
    """不传分页参数时保持全量返回；传入时返回已切好的当页并附 ``pagination``。"""

    if page is None and page_size is None:
        return {"date_range": date_range, "settlements": items, "pagination": None}
    info = _pagination_info(len(items) if total is None else total, page, page_size)
    if total is None:
        start = (info["page"] - 1) * info["page_size"]
        items = items[start : start + info["page_size"]]
    return {
        "date_range": date_range,
        "settlements": items,
        "pagination": info,
    }


def _grade_quantity_sum(grade):
    """按等级生成条件求和列，避免为每张结算单拉回全部销售明细。"""

    return func.coalesce(
        func.sum(
            case(
                (SaleRecord.grade == grade.value, SaleRecord.quantity),
                else_=0,
            )
        ),
        0,
    ).label(f"grade_{grade.value.lower()}")


def _decimal(value) -> Decimal:
    return Decimal(str(value)) if value is not None else Decimal("0")


def _aggregate_query(
    db: Session,
    start: date,
    end: date,
    merchant_no: str | None,
    keyword: str | None,
):
    """在数据库内按结算单聚合，只返回页面需要的指标。"""

    aggregated = (
        db.query(
            SaleRecord.import_batch_id.label("batch_id"),
            func.min(SaleRecord.sale_date).label("sale_date_start"),
            func.max(SaleRecord.sale_date).label("sale_date_end"),
            func.max(SaleRecord.fruit_type).label("fruit_type"),
            func.coalesce(func.sum(SaleRecord.amount), 0).label("sales_amount"),
            func.coalesce(func.sum(SaleRecord.quantity), 0).label("total_quantity"),
            func.count(SaleRecord.id).label("record_count"),
            *[_grade_quantity_sum(grade) for grade in GRADES],
        )
        .filter(SaleRecord.sale_date >= start, SaleRecord.sale_date <= end)
        .group_by(SaleRecord.import_batch_id)
        .subquery()
    )
    query = db.query(aggregated).join(
        ImportBatch, ImportBatch.id == aggregated.c.batch_id
    )
    if merchant_no:
        query = query.filter(ImportBatch.merchant_no == merchant_no)
    if keyword and keyword.strip():
        query = _apply_keyword(query, keyword)
    return query, aggregated


def _settlement_items(db: Session, rows) -> list[dict]:
    batch_ids = {row.batch_id for row in rows if row.batch_id}
    batches = {
        batch.id: batch
        for batch in db.query(ImportBatch).filter(ImportBatch.id.in_(batch_ids)).all()
    } if batch_ids else {}
    return [
        _settlement_item(row, batches[row.batch_id])
        for row in rows
        if row.batch_id in batches
    ]


def _settlement_item(agg, batch: ImportBatch) -> dict:
    amount = _decimal(agg.sales_amount)
    quantity = _decimal(agg.total_quantity)
    return {
        "merchant_no": batch.merchant_no,
        "merchant_no_normalized": merchant_no_display(
            batch.merchant_no, batch.merchant_no_normalized
        ),
        "order_no": batch.order_no,
        "order_no_normalized": order_no_display(
            batch.order_no, batch.order_no_normalized
        ),
        "fruit_type": agg.fruit_type or "榴莲",
        "series": series_name(
            batch.order_no_normalized or batch.order_no
        ),
        "container_no": batch.container_no,
        "vehicle_no": batch.vehicle_no,
        "arrival_date": batch.arrival_date,
        "sale_date_start": agg.sale_date_start,
        "sale_date_end": agg.sale_date_end,
        "sales_amount": rounded(amount),
        "total_quantity": rounded(quantity),
        "average_price": rounded(amount / quantity) if quantity else None,
        "grade_quantities": {
            grade.value: rounded(_decimal(getattr(agg, f"grade_{grade.value.lower()}")))
            for grade in GRADES
        },
        "record_count": int(agg.record_count or 0),
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

    query, aggregated = _aggregate_query(
        db,
        start=start,
        end=end,
        merchant_no=merchant_no,
        keyword=keyword,
    )
    query = query.order_by(
        aggregated.c.sale_date_end.desc(), ImportBatch.merchant_no.asc()
    )
    if page is None and page_size is None:
        items = _settlement_items(db, query.all())
        return _payload(
            {"start_date": start, "end_date": end, "is_default": is_default},
            items,
            page,
            page_size,
        )

    total = query.count()
    info = _pagination_info(total, page, page_size)
    items = _settlement_items(
        db,
        query.offset(
            (info["page"] - 1) * info["page_size"]
        ).limit(info["page_size"]).all(),
    )
    return _payload(
        {"start_date": start, "end_date": end, "is_default": is_default},
        items,
        page,
        page_size,
        total=total,
    )


__all__ = [
    "PAGE_SIZE_DEFAULT",
    "PAGE_SIZE_MAX",
    "list_settlements",
    "one_month_before",
]
