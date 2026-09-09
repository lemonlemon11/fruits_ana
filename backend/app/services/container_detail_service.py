"""货柜详情的结算摘要、销售周期和来源明细。"""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy.orm import Session

from ..models import ContainerSummary, ImportBatch, SaleRecord


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


def _settlement(
    db: Session, container_id: str, records: list[SaleRecord]
) -> dict:
    batch_ids = {
        record.import_batch_id
        for record in records
        if record.import_batch_id is not None
    }
    query = (
        db.query(ContainerSummary)
        .join(ImportBatch, ContainerSummary.import_batch_id == ImportBatch.id)
        .filter(ContainerSummary.container_id == container_id)
        .order_by(ImportBatch.imported_at.desc(), ContainerSummary.id.desc())
    )
    if batch_ids:
        query = query.filter(ContainerSummary.import_batch_id.in_(batch_ids))
    summary = query.first()
    return _empty_settlement() if summary is None else {
        field: _number(getattr(summary, model_field)) if summary else None
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
    }


def get_container_context(
    db: Session, container_id: str, records: list[SaleRecord]
) -> dict:
    """返回详情页所需的结算、销售周期和来源明细。"""

    dates = [record.sale_date for record in records]
    return {
        "sales_period": {
            "start_date": min(dates).isoformat() if dates else None,
            "end_date": max(dates).isoformat() if dates else None,
        },
        "settlement": _settlement(db, container_id, records),
        "records": [_record_payload(record) for record in records],
    }


__all__ = ["get_container_context"]
