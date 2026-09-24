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
UNKNOWN_BRAND = "未识别品牌"
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


def _brand_from_order_no(order_no: str | None, normalized: str | None = None) -> str:
    """按页面口径从单号 ``-`` 前截取品牌，与 ``series_name`` 一致。"""

    display_order_no = order_no_display(order_no, normalized)
    return series_name(display_order_no or order_no)


def _brand_from_batch(batch: ImportBatch) -> str:
    return _brand_from_order_no(batch.order_no, batch.order_no_normalized)


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
    brand_totals: list[dict] | None = None,
) -> dict:
    """不传分页参数时保持全量返回；传入时返回已切好的当页并附 ``pagination``。"""

    if page is None and page_size is None:
        return {
            "date_range": date_range,
            "settlements": items,
            "pagination": None,
            "brand_totals": brand_totals or [],
        }
    info = _pagination_info(len(items) if total is None else total, page, page_size)
    if total is None:
        start = (info["page"] - 1) * info["page_size"]
        items = items[start : start + info["page_size"]]
    return {
        "date_range": date_range,
        "settlements": items,
        "pagination": info,
        "brand_totals": brand_totals or [],
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
    brand_batch_ids: set[int] | None,
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
    if brand_batch_ids is not None:
        query = query.filter(ImportBatch.id.in_(brand_batch_ids))
    if keyword and keyword.strip():
        query = _apply_keyword(query, keyword)
    return query, aggregated


def _brand_batch_ids(db: Session, brand: str | None) -> set[int] | None:
    """按页面展示的品牌口径匹配批次 ID；品牌从单号 ``-`` 前截取。"""

    if not brand:
        return None
    rows = (
        db.query(
            ImportBatch.id,
            ImportBatch.order_no,
            ImportBatch.order_no_normalized,
        )
        .all()
    )
    matched = {
        row.id
        for row in rows
        if _brand_from_order_no(row.order_no, row.order_no_normalized) == brand
    }
    return matched or {-1}


def _brand_totals(db: Session, query, aggregated) -> list[dict]:
    """按单号前缀汇总当前筛选范围内的总件数与结算单数，分页不影响汇总。"""

    rows = query.with_entities(
        aggregated.c.batch_id, aggregated.c.total_quantity
    ).all()
    batch_ids = {row.batch_id for row in rows if row.batch_id}
    if not batch_ids:
        return []
    batches = {
        batch.id: batch
        for batch in db.query(ImportBatch).filter(ImportBatch.id.in_(batch_ids)).all()
    }
    grouped: dict[str, dict] = {}
    for row in rows:
        batch = batches.get(row.batch_id)
        if batch is None:
            continue
        brand = _brand_from_batch(batch)
        total = grouped.setdefault(
            brand, {"total_quantity": Decimal("0"), "settlement_count": 0}
        )
        total["total_quantity"] += _decimal(row.total_quantity)
        total["settlement_count"] += 1
    return [
        {
            "brand": brand,
            "total_quantity": rounded(total["total_quantity"]),
            "settlement_count": total["settlement_count"],
        }
        for brand, total in sorted(grouped.items())
    ]


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
        "brand": _brand_from_batch(batch),
        "fruit_type": agg.fruit_type or "榴莲",
        "series": _brand_from_batch(batch),
        "container_no": batch.container_no,
        "vehicle_no": batch.vehicle_no,
        "arrival_date": batch.arrival_date,
        "sale_date_start": agg.sale_date_start,
        "sale_date_end": agg.sale_date_end,
        "sales_amount": rounded(amount),
        "total_quantity": rounded(quantity),
        "average_price": rounded(amount / quantity) if quantity else None,
        "confirmed_at": batch.confirmed_at,
        "grade_quantities": {
            grade.value: rounded(_decimal(getattr(agg, f"grade_{grade.value.lower()}")))
            for grade in GRADES
        },
        "record_count": int(agg.record_count or 0),
    }


def _sorted_query(query, aggregated, sort_by: str | None, sort_order: str):
    """按列表允许的字段排序；空日期始终排在末尾，商号作为稳定次序。"""

    if sort_by is None:
        return query.order_by(
            aggregated.c.sale_date_end.desc(), ImportBatch.merchant_no.asc()
        )
    expressions = {
        "arrival_date": ImportBatch.arrival_date,
        "total_quantity": aggregated.c.total_quantity,
        "grade_a": aggregated.c.grade_a,
        "grade_b": aggregated.c.grade_b,
        "sales_amount": aggregated.c.sales_amount,
        "average_price": aggregated.c.sales_amount
        / func.nullif(aggregated.c.total_quantity, 0),
        "confirmed_at": ImportBatch.confirmed_at,
    }
    expression = expressions[sort_by]
    direction = expression.asc() if sort_order == "asc" else expression.desc()
    nulls_last = case((expression.is_(None), 1), else_=0).asc()
    return query.order_by(nulls_last, direction, ImportBatch.merchant_no.asc())


def list_settlements(
    db: Session,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    merchant_no: str | None = None,
    brand: str | None = None,
    keyword: str | None = None,
    page: int | None = None,
    page_size: int | None = None,
    sort_by: str | None = None,
    sort_order: str = "desc",
) -> dict:
    """按结算单汇总指定日期范围内的销售明细。

    未传日期时使用 ``[最新销售日期 - 1 个月, 最新销售日期]``，含两端；
    范围内没有明细的结算单不返回。``keyword`` 在商号 / 单号 / 柜号 / 车牌上做
    模糊匹配；``page`` / ``page_size`` 只会切分返回的列表，不影响 ``date_range``。
    """

    latest = db.query(func.max(SaleRecord.sale_date)).scalar()
    if latest is None:
        return _payload(None, [], page, page_size, brand_totals=[])
    is_default = start_date is None and end_date is None
    start = start_date or one_month_before(latest)
    end = end_date or latest

    brand_batch_ids = _brand_batch_ids(db, brand)
    query, aggregated = _aggregate_query(
        db,
        start=start,
        end=end,
        merchant_no=merchant_no,
        keyword=keyword,
        brand_batch_ids=brand_batch_ids,
    )
    brand_totals = _brand_totals(db, query, aggregated)
    query = _sorted_query(query, aggregated, sort_by, sort_order)
    if page is None and page_size is None:
        items = _settlement_items(db, query.all())
        return _payload(
            {"start_date": start, "end_date": end, "is_default": is_default},
            items,
            page,
            page_size,
            brand_totals=brand_totals,
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
        brand_totals=brand_totals,
    )


__all__ = [
    "PAGE_SIZE_DEFAULT",
    "PAGE_SIZE_MAX",
    "UNKNOWN_BRAND",
    "list_settlements",
    "one_month_before",
]
