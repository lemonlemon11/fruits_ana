"""结算单详情的结算摘要、销售周期和来源明细。"""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy.orm import Session

from ..models import ImportBatch, SaleRecord, SettlementSummary


SETTLEMENT_FIELDS = {
    "after_sales_amount": "after_sale_amount",
    "fee_amount": "fee_amount",
    "customs_tax": "customs_tax",
    "payable_amount": "payable_amount",
}


def _number(value: Decimal | None) -> float | None:
    return round(float(value), 4) if value is not None else None


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
    return {
        field: _number(getattr(summary, model_field))
        for field, model_field in SETTLEMENT_FIELDS.items()
    }


def _record_payload(record: SaleRecord) -> dict:
    return {
        "id": record.id,
        "source_file_id": record.source_file_id,
        "import_batch_id": record.import_batch_id,
        "sale_date": record.sale_date.isoformat(),
        "grade": record.grade.value,
        "grade_raw": record.grade_raw,
        "spec_raw": record.spec_raw,
        "quantity": _number(record.quantity),
        "unit_price": _number(record.unit_price),
        "amount": _number(record.amount),
        "remark": record.remark,
    }


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
        "records": [_record_payload(record) for record in records],
    }


def get_settlement_records(db: Session, batch_id: int) -> list[dict]:
    """返回该结算单的全部销售明细，供「查看明细」使用。"""

    query = (
        db.query(SaleRecord)
        .filter(SaleRecord.import_batch_id == batch_id)
        .order_by(SaleRecord.sale_date, SaleRecord.id)
    )
    return [_record_payload(record) for record in query.all()]


__all__ = ["get_settlement_context", "get_settlement_records"]
