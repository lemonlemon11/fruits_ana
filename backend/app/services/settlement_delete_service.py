"""按商号删除结算单，并清理关联明细与原始文件引用。"""

from __future__ import annotations

from pathlib import Path

from sqlalchemy.orm import Session

from ..logging_config import get_logger
from ..models import ImportBatch, SettlementRevision, SourceFile


logger = get_logger()


def _is_unreferenced_storage(db: Session, storage_path: str) -> bool:
    """原始文件不再被任何结算单引用时返回 True。"""

    return (
        db.query(SourceFile.id)
        .filter(SourceFile.storage_path == storage_path)
        .first()
        is None
    )


def delete_settlement(db: Session, merchant_no: str) -> dict | None:
    """删除指定结算单；不存在时返回 None。"""

    batch = (
        db.query(ImportBatch)
        .filter(ImportBatch.merchant_no == merchant_no)
        .first()
    )
    if batch is None:
        return None

    logger.info("delete settlement start merchant_no=%s batch_id=%s", merchant_no, batch.id)

    storage_paths = [
        row.storage_path
        for row in db.query(SourceFile.storage_path)
        .filter(SourceFile.import_batch_id == batch.id)
        .all()
        if row.storage_path
    ]

    # SettlementRevision 没有挂在 ImportBatch relationship 上，SQLite 下不会自动级联。
    db.query(SettlementRevision).filter(
        SettlementRevision.import_batch_id == batch.id
    ).delete(synchronize_session=False)
    db.delete(batch)
    db.commit()
    logger.info("delete settlement committed merchant_no=%s batch_id=%s", merchant_no, batch.id)

    for storage_path in storage_paths:
        if _is_unreferenced_storage(db, storage_path):
            try:
                Path(storage_path).unlink(missing_ok=True)
            except OSError:
                # 文件清理失败不影响结算单数据删除结果。
                logger.warning(
                    "delete settlement source file cleanup failed storage_path=%s",
                    storage_path,
                )
                continue

    return {"deleted": True, "merchant_no": batch.merchant_no}


__all__ = ["delete_settlement"]
