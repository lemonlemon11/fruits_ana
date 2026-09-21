"""数据质量问题统计。"""

from datetime import date

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models import DataIssue, ImportBatch, SaleRecord


def get_issue_counts(
    db: Session,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    merchant_no: str | None = None,
) -> dict[str, int]:
    query = (
        db.query(DataIssue.issue_type, func.count(DataIssue.id))
        .join(ImportBatch, ImportBatch.id == DataIssue.import_batch_id)
    )
    if merchant_no:
        query = query.filter(ImportBatch.merchant_no == merchant_no)
    if start_date or end_date:
        scoped_sales = db.query(SaleRecord.id).filter(
            SaleRecord.import_batch_id == ImportBatch.id
        )
        if start_date:
            scoped_sales = scoped_sales.filter(SaleRecord.sale_date >= start_date)
        if end_date:
            scoped_sales = scoped_sales.filter(SaleRecord.sale_date <= end_date)
        query = query.filter(scoped_sales.exists())
    rows = (
        query.group_by(DataIssue.issue_type)
        .order_by(DataIssue.issue_type)
        .all()
    )
    counts = {issue_type: count for issue_type, count in rows}
    return {"total": sum(counts.values()), **counts}
