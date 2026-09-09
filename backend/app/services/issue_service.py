"""数据质量问题统计。"""

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models import DataIssue


def get_issue_counts(db: Session) -> dict[str, int]:
    rows = (
        db.query(DataIssue.issue_type, func.count(DataIssue.id))
        .group_by(DataIssue.issue_type)
        .order_by(DataIssue.issue_type)
        .all()
    )
    counts = {issue_type: count for issue_type, count in rows}
    return {"total": sum(counts.values()), **counts}
