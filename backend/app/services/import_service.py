"""销售明细文件解析与按商号导入服务。

导入以「商号」为业务唯一键：同一商号再次导入默认返回 ``conflict``，
确认覆盖后在同一事务内替换旧结算单（明细、摘要、问题记录一并删除）。
解析、数据质量记录和事实写入在同一个数据库提交中完成；无效行不会写入
``sale_record``，但会保留为 ``data_issue`` 供导入结果追踪。
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from decimal import Decimal

from ..models import (
    DataIssue,
    ImportBatch,
    SaleRecord,
    SettlementSummary,
    SourceFile,
)
from ..parser.settlement_parser import (
    ImportIssue,
    SettlementParseError,
    parse_settlement,
)
from .order_no_naming import normalize_order_no
from .merchant_no_naming import normalize_merchant_no
from .field_conversion import convert_grade


HASH_CHUNK_SIZE = 1024 * 1024
RECONCILE_TOLERANCE = Decimal("0.01")


@dataclass
class ImportResult:
    """导入操作结果，支持属性访问和 ``to_dict`` 序列化。"""

    status: str
    batch_id: int | None = None
    source_file_id: int | None = None
    merchant_no: str | None = None
    merchant_no_normalized: str | None = None
    order_no: str | None = None
    order_no_normalized: str | None = None
    container_no: str | None = None
    vehicle_no: str | None = None
    file_name: str | None = None
    existing_batch_id: int | None = None
    obsolete_storage_path: str | None = None
    error_summary: str | None = None
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
            "merchant_no": self.merchant_no,
            "merchant_no_normalized": self.merchant_no_normalized,
            "order_no": self.order_no,
            "order_no_normalized": self.order_no_normalized,
            "container_no": self.container_no,
            "vehicle_no": self.vehicle_no,
            "file_name": self.file_name,
            "existing_batch_id": self.existing_batch_id,
            "error_summary": self.error_summary,
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


def _batch_result(db: Session, batch: ImportBatch, status: str, filename: str) -> ImportResult:
    """按既有结算单生成结果（conflict 或覆盖前的提示）。"""

    return ImportResult(
        status=status,
        batch_id=batch.id,
        existing_batch_id=batch.id,
        merchant_no=batch.merchant_no,
        merchant_no_normalized=batch.merchant_no_normalized,
        order_no=batch.order_no,
        order_no_normalized=batch.order_no_normalized,
        container_no=batch.container_no,
        vehicle_no=batch.vehicle_no,
        file_name=filename,
        success_count=batch.success_count,
        warning_count=batch.warning_count,
        failure_count=batch.failure_count,
        issues=_result_issues(db, batch.id),
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


def _apply_reconciliation(
    summary_row: SettlementSummary, records: list[dict[str, Any]]
) -> None:
    """记录「系统按明细算的合计」并与文件写的合计对账，供二次确认页高亮。"""

    computed_amount = sum((record["amount"] for record in records), Decimal("0"))
    computed_quantity = sum((record["quantity"] for record in records), Decimal("0"))
    summary_row.computed_sales_amount = computed_amount
    summary_row.computed_quantity = computed_quantity

    mismatches: list[str] = []
    declared_amount = summary_row.sales_amount
    if declared_amount is not None and abs(declared_amount - computed_amount) > RECONCILE_TOLERANCE:
        mismatches.append(f"销售金额 文件{declared_amount} / 系统{computed_amount}")
    declared_quantity = summary_row.sales_quantity
    if declared_quantity is not None and abs(declared_quantity - computed_quantity) > RECONCILE_TOLERANCE:
        mismatches.append(f"件数 文件{declared_quantity} / 系统{computed_quantity}")
    summary_row.reconcile_status = "mismatch" if mismatches else "ok"
    summary_row.reconcile_detail = "；".join(mismatches)[:255] or None


def _prepare_import(
    db: Session,
    batch: ImportBatch,
    source: SourceFile,
    records: list[dict[str, Any]],
    issues: list[ImportIssue],
    summary: dict[str, Any] | None,
) -> None:
    db.flush()
    for record in records:
        record["grade"] = convert_grade(db, record.get("grade_raw"))
    db.add_all(_issue_models(batch.id, source.id, issues))
    db.add_all(_sale_models(batch.id, source.id, records))
    if summary:
        summary_row = SettlementSummary(import_batch_id=batch.id, **summary)
        _apply_reconciliation(summary_row, records)
        db.add(summary_row)
    source.row_count = len(records)
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
    overwrite: bool = False,
    brand: str | None = None,
) -> ImportResult:
    """按商号导入；解析先于写入，写入异常回滚全部对象。

    同一商号再次导入且 ``overwrite`` 为假时返回 ``conflict`` 且不写库；
    为真时在同一事务内替换旧结算单（明细、摘要、问题记录随之删除）。
    """

    path = Path(file_path)
    filename = original_filename or path.name
    try:
        parsed = parse_settlement(path, source_type)
    except SettlementParseError as exc:
        return ImportResult(
            status="failed",
            file_name=filename,
            failure_count=1,
            error_summary=str(exc),
        )

    meta = parsed.meta
    existing = db.query(ImportBatch).filter_by(merchant_no=meta.merchant_no).first()
    if existing is not None and not overwrite:
        return _batch_result(db, existing, "conflict", filename)

    obsolete_storage_path = None
    if existing is not None:
        obsolete_storage_path = _first_storage_path(db, existing.id)
        db.delete(existing)
        db.flush()

    file_hash = _hash_file(path)
    batch = ImportBatch(
        file_name=filename,
        status="pending",
        merchant_no=meta.merchant_no,
        merchant_no_normalized=normalize_merchant_no(meta.merchant_no),
        order_no=meta.order_no,
        order_no_normalized=normalize_order_no(meta.order_no),
        container_no=meta.container_no,
        vehicle_no=meta.vehicle_no,
        # 品牌由导入时人工选择；老规则解析链路标记 parse_mode=rule。
        brand=brand,
        parse_mode="rule",
    )
    source = SourceFile(
        file_name=filename,
        file_hash=file_hash,
        storage_path=str(path),
        brand=brand,
        import_batch=batch,
    )
    db.add(batch)
    db.add(source)
    try:
        _prepare_import(db, batch, source, parsed.records, parsed.issues, parsed.summary)
        db.commit()
    except IntegrityError:
        db.rollback()
        concurrent = db.query(ImportBatch).filter_by(merchant_no=meta.merchant_no).first()
        if concurrent is not None:
            return _batch_result(db, concurrent, "conflict", filename)
        raise
    except Exception:
        db.rollback()
        raise
    return ImportResult(
        status=batch.status,
        batch_id=batch.id,
        source_file_id=source.id,
        merchant_no=batch.merchant_no,
        merchant_no_normalized=batch.merchant_no_normalized,
        order_no=batch.order_no,
        order_no_normalized=batch.order_no_normalized,
        container_no=batch.container_no,
        vehicle_no=batch.vehicle_no,
        file_name=filename,
        obsolete_storage_path=obsolete_storage_path,
        success_count=batch.success_count,
        warning_count=batch.warning_count,
        failure_count=batch.failure_count,
        issues=parsed.issues,
    )


def _first_storage_path(db: Session, batch_id: int) -> str | None:
    """返回该结算单原始文件存储路径，供覆盖后清理旧文件使用。"""

    source = (
        db.query(SourceFile)
        .filter(SourceFile.import_batch_id == batch_id)
        .order_by(SourceFile.id)
        .first()
    )
    return source.storage_path if source else None


class ImportService:
    """面向依赖注入或 API 层的薄封装。"""

    def __init__(self, db: Session):
        self.db = db

    def import_file(
        self,
        file_path: str | Path,
        original_filename: str | None = None,
        source_type: str | None = None,
        overwrite: bool = False,
    ) -> ImportResult:
        return import_file(
            self.db, file_path, original_filename, source_type, overwrite=overwrite
        )


import_sales_file = import_file


__all__ = ["ImportIssue", "ImportResult", "ImportService", "import_file", "import_sales_file"]
