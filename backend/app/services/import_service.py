"""销售明细文件解析与幂等导入服务。

解析、数据质量记录和事实写入在同一个数据库提交中完成。无效行不会
写入 ``sale_record``，但会保留为 ``data_issue`` 供导入结果追踪。
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..models import ContainerSummary, DataIssue, ImportBatch, SaleRecord, SourceFile
from ..parser.settlement_parser import ImportIssue, read_settlement_with_summary


HASH_CHUNK_SIZE = 1024 * 1024


@dataclass
class ImportResult:
    """导入操作结果，支持属性访问和 ``to_dict`` 序列化。"""

    status: str
    batch_id: int | None = None
    source_file_id: int | None = None
    success_count: int = 0
    warning_count: int = 0
    failure_count: int = 0
    issues: list[ImportIssue] = field(default_factory=list)

    @property
    def import_batch_id(self) -> int | None:
        return self.batch_id

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "batch_id": self.batch_id,
            "source_file_id": self.source_file_id,
            "success_count": self.success_count,
            "warning_count": self.warning_count,
            "failure_count": self.failure_count,
            "issues": [issue.__dict__.copy() for issue in self.issues],
        }


def _result_issues(db: Session, batch_id: int) -> list[ImportIssue]:
    return [
        ImportIssue(
            issue_type=item.issue_type,
            severity=item.severity,
            row_number=item.row_number,
            field_name=item.field_name,
            message=item.message,
            raw_value=item.raw_value,
        )
        for item in db.query(DataIssue).filter(DataIssue.import_batch_id == batch_id).all()
    ]


def _duplicate_result(db: Session, source: SourceFile) -> ImportResult:
    batch = db.get(ImportBatch, source.import_batch_id)
    return ImportResult(
        status="duplicate",
        batch_id=source.import_batch_id,
        source_file_id=source.id,
        success_count=batch.success_count if batch else 0,
        warning_count=batch.warning_count if batch else 0,
        failure_count=batch.failure_count if batch else 0,
        issues=_result_issues(db, source.import_batch_id),
    )


def _issue_models(batch_id: int, source_id: int, issues: list[ImportIssue]):
    return [
        DataIssue(
            import_batch_id=batch_id,
            source_file_id=source_id,
            row_number=item.row_number,
            issue_type=item.issue_type,
            severity=item.severity,
            field_name=item.field_name,
            message=item.message,
            raw_value=item.raw_value,
        )
        for item in issues
    ]


def _sale_models(batch_id: int, source_id: int, records: list[dict[str, Any]]):
    return [
        SaleRecord(import_batch_id=batch_id, source_file_id=source_id, **record)
        for record in records
    ]


def _prepare_import(
    db: Session,
    batch: ImportBatch,
    source: SourceFile,
    records: list[dict[str, Any]],
    issues: list[ImportIssue],
    summary: dict[str, Any] | None,
) -> None:
    db.flush()
    db.add_all(_issue_models(batch.id, source.id, issues))
    db.add_all(_sale_models(batch.id, source.id, records))
    if summary:
        db.add(ContainerSummary(import_batch_id=batch.id, **summary))
    batch.success_count = len(records)
    batch.warning_count = sum(item.severity == "warning" for item in issues)
    batch.failure_count = sum(item.severity == "error" for item in issues)
    batch.status = "success" if batch.failure_count == 0 else "partial"
    batch.error_summary = "; ".join(item.message for item in issues[:5]) or None


def _hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(HASH_CHUNK_SIZE):
            digest.update(chunk)
    return digest.hexdigest()


def import_file(
    db: Session,
    file_path: str | Path,
    original_filename: str | None = None,
    source_type: str | None = None,
) -> ImportResult:
    """以原始字节哈希幂等导入；解析先于写入，写入异常回滚全部对象。"""

    path = Path(file_path)
    file_hash = _hash_file(path)
    filename = original_filename or path.name
    existing = db.query(SourceFile).filter_by(file_hash=file_hash).first()
    if existing:
        return _duplicate_result(db, existing)

    records, issues, summary = read_settlement_with_summary(path, source_type)
    batch = ImportBatch(file_name=filename, status="pending")
    source = SourceFile(
        file_name=filename,
        file_hash=file_hash,
        storage_path=str(path),
        import_batch=batch,
    )
    db.add(batch)
    db.add(source)
    try:
        _prepare_import(db, batch, source, records, issues, summary)
        db.commit()
    except IntegrityError:
        db.rollback()
        duplicate = db.query(SourceFile).filter_by(file_hash=file_hash).first()
        if duplicate:
            return _duplicate_result(db, duplicate)
        raise
    except Exception:
        db.rollback()
        raise
    return ImportResult(
        status=batch.status,
        batch_id=batch.id,
        source_file_id=source.id,
        success_count=batch.success_count,
        warning_count=batch.warning_count,
        failure_count=batch.failure_count,
        issues=issues,
    )


class ImportService:
    """面向依赖注入或 API 层的薄封装。"""

    def __init__(self, db: Session):
        self.db = db

    def import_file(
        self,
        file_path: str | Path,
        original_filename: str | None = None,
        source_type: str | None = None,
    ) -> ImportResult:
        return import_file(self.db, file_path, original_filename, source_type)


import_sales_file = import_file


__all__ = ["ImportIssue", "ImportResult", "ImportService", "import_file", "import_sales_file"]
