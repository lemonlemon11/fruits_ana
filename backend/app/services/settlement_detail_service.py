"""结算单详情的结算摘要、销售周期和来源明细。"""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models import (
    ImportBatch,
    SaleRecord,
    SettlementAfterSaleItem,
    SettlementFeeItem,
    SettlementSummary,
)


SETTLEMENT_FIELDS = {
    "after_sales_amount": "after_sale_amount",
    "goods_amount": "goods_amount",
    "fee_amount": "fee_amount",
    "customs_tax": "customs_tax",
    "payable_amount": "payable_amount",
}

RECORD_PAGE_SIZE_DEFAULT = 50
RECORD_PAGE_SIZE_MAX = 200


def _number(value: Decimal | None) -> float | None:
    return round(float(value), 4) if value is not None else None


def _value_text(value: Decimal | int | float | None) -> str:
    if value is None:
        return ""
    if isinstance(value, Decimal):
        text = format(value, "f")
    else:
        text = format(float(value), ".4f")
    return text.rstrip("0").rstrip(".") or "0"


def _empty_settlement() -> dict:
    return {field: None for field in SETTLEMENT_FIELDS}


def _settlement(db: Session, batch_id: int) -> dict:
    summary = (
        db.query(SettlementSummary)
        .filter(SettlementSummary.import_batch_id == batch_id)
        .first()
    )
    if summary is None:
        return _empty_settlement()
    values = {}
    for field, model_field in SETTLEMENT_FIELDS.items():
        value = getattr(summary, model_field)
        if field == "after_sales_amount" and value is not None:
            value = abs(value)
        values[field] = _number(value)
    return values


def record_payload(record: SaleRecord, *, include_piece_count: bool = False) -> dict:
    payload = {
        "id": record.id,
        "source_file_id": record.source_file_id,
        "import_batch_id": record.import_batch_id,
        "sale_date": record.sale_date.isoformat(),
        "fruit_type": record.fruit_type,
        "grade": record.grade.value,
        "grade_raw": record.grade_raw,
        "spec_raw": record.spec_raw,
        "quantity": _number(record.quantity),
        "unit_price": _number(record.unit_price),
        "amount": _number(record.amount),
        "remark": record.remark,
        "sales_region": record.sales_region,
    }
    if include_piece_count:
        payload["piece_count"] = record.piece_count
    return payload


def get_settlement_context(
    db: Session, batch: ImportBatch, records: list[SaleRecord]
) -> dict:
    """返回详情页所需的结算、销售周期和来源明细。"""

    dates = [record.sale_date for record in records]
    return {
        "sales_period": {
            "start_date": min(dates).isoformat() if dates else None,
            "end_date": max(dates).isoformat() if dates else None,
        },
        "settlement": _settlement(db, batch.id),
        "records": [
            record_payload(record, include_piece_count=True) for record in records
        ],
    }


def get_settlement_records(
    db: Session,
    batch_id: int,
    *,
    page: int | None = None,
    page_size: int | None = None,
) -> dict:
    """返回该结算单的分页销售明细及整单汇总，供「查看明细」使用。"""

    base = db.query(SaleRecord).filter(SaleRecord.import_batch_id == batch_id)
    total = base.count()
    paginated = page is not None or page_size is not None
    size = min(max(page_size or RECORD_PAGE_SIZE_DEFAULT, 1), RECORD_PAGE_SIZE_MAX)
    pages = max(1, (total + size - 1) // size)
    safe_page = min(max(page or 1, 1), pages)

    query = (
        db.query(SaleRecord)
        .filter(SaleRecord.import_batch_id == batch_id)
        .order_by(SaleRecord.sale_date, SaleRecord.id)
    )
    if paginated:
        query = query.offset((safe_page - 1) * size).limit(size)
    records = [
        record_payload(record, include_piece_count=True) for record in query.all()
    ]

    quantity = db.query(func.sum(SaleRecord.quantity)).filter(
        SaleRecord.import_batch_id == batch_id
    ).scalar()
    amount = db.query(func.sum(SaleRecord.amount)).filter(
        SaleRecord.import_batch_id == batch_id
    ).scalar()
    dates = (
        db.query(func.min(SaleRecord.sale_date), func.max(SaleRecord.sale_date))
        .filter(SaleRecord.import_batch_id == batch_id)
        .first()
    )
    return {
        "records": records,
        "pagination": (
            {
                "total": total,
                "page": safe_page,
                "page_size": size,
                "pages": pages,
            }
            if paginated
            else None
        ),
        "totals": {
            "quantity": _number(Decimal(str(quantity))) if quantity is not None else 0.0,
            "amount": _number(Decimal(str(amount))) if amount is not None else 0.0,
        },
        "sales_period": {
            "start_date": dates[0].isoformat() if dates and dates[0] else None,
            "end_date": dates[1].isoformat() if dates and dates[1] else None,
        },
    }


def get_settlement_review(db: Session, merchant_no: str) -> dict | None:
    """按商号返回与导入二次确认页一致的只读复核槽位。"""

    batch = db.query(ImportBatch).filter(ImportBatch.merchant_no == merchant_no).first()
    if batch is None:
        return None

    sales = (
        db.query(SaleRecord)
        .filter(SaleRecord.import_batch_id == batch.id)
        .order_by(SaleRecord.id)
        .all()
    )
    after_items = (
        db.query(SettlementAfterSaleItem)
        .filter(SettlementAfterSaleItem.import_batch_id == batch.id)
        .order_by(SettlementAfterSaleItem.sort_order, SettlementAfterSaleItem.id)
        .all()
    )
    fee_items = (
        db.query(SettlementFeeItem)
        .filter(SettlementFeeItem.import_batch_id == batch.id)
        .order_by(SettlementFeeItem.sort_order, SettlementFeeItem.id)
        .all()
    )
    summary = (
        db.query(SettlementSummary)
        .filter(SettlementSummary.import_batch_id == batch.id)
        .first()
    )

    sales_amount = sum((record.amount for record in sales), Decimal("0"))
    sales_quantity = sum((record.quantity for record in sales), Decimal("0"))
    after_amount = sum(
        (abs(item.amount) if item.amount is not None else Decimal("0") for item in after_items),
        Decimal("0"),
    )
    fee_amount = sum((item.amount for item in fee_items), Decimal("0"))
    goods_amount = sales_amount - after_amount
    payable_amount = goods_amount - fee_amount

    computed_summary = {
        "sales_quantity": _value_text(sales_quantity),
        "sales_amount": _value_text(sales_amount),
        "after_sale_amount": _value_text(after_amount),
        "goods_amount": _value_text(goods_amount),
        "fee_amount": _value_text(fee_amount),
        "payable_amount": _value_text(payable_amount),
    }
    file_fields = {
        "sales_quantity": summary.file_sales_quantity if summary else None,
        "sales_amount": summary.file_sales_amount if summary else None,
        "after_sale_amount": summary.file_after_sale_amount if summary else None,
        "goods_amount": summary.file_goods_amount if summary else None,
        "fee_amount": summary.file_fee_amount if summary else None,
        "payable_amount": summary.file_payable_amount if summary else None,
    }
    file_summary = {
        key: _value_text(value) if value is not None else computed_summary[key]
        for key, value in file_fields.items()
    }

    payload = {
        "merchant_no": batch.merchant_no,
        "order_no": batch.order_no or "",
        "container_no": batch.container_no or "",
        "vehicle_no": batch.vehicle_no or "",
        "market": batch.market or "",
        "arrival_date": batch.arrival_date.isoformat() if batch.arrival_date else "",
        "arrival_quantity": batch.arrival_quantity,
        "sales": [
            {
                "source_row": record.source_row,
                "sale_date": record.sale_date.isoformat(),
                "variety": record.grade_raw if record.grade_raw is not None else record.grade.value,
                "head_count": record.piece_count or "",
                "spec_kg": record.spec_kg or "",
                "sales_quantity": _number(record.quantity),
                "unit_price": _number(record.unit_price),
                "amount": _number(record.amount),
                "remark": record.remark or "",
            }
            for record in sales
        ],
        "after_sales": [
            {
                "source_row": item.source_row,
                "content": item.content,
                "summary": item.summary or "",
                "amount": _number(abs(item.amount)) if item.amount is not None else 0.0,
            }
            for item in after_items
        ],
        "fees": [
            {
                "source_row": item.source_row,
                "name": item.name,
                "amount": _number(item.amount),
                "is_custom": item.is_custom,
            }
            for item in fee_items
        ],
        "file_summary": file_summary,
        "computed_summary": computed_summary,
        "issues": [],
    }

    file_name = batch.file_name or (
        "手工录单" if batch.source_type == "manual" else f"{batch.merchant_no}.xlsx"
    )
    return {
        "job_token": "readonly",
        "job_status": "readonly",
        "draft_token": "",
        "version": 1,
        "file_name": file_name,
        "payload": payload,
        "original_payload": payload,
    }


__all__ = [
    "get_settlement_context",
    "get_settlement_records",
    "get_settlement_review",
]
