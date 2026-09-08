"""水果销售分析平台的持久化模型。"""

from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from enum import Enum
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Enum as SqlEnum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utc_now() -> datetime:
    """返回带时区的当前 UTC 时间，便于跨时区追踪导入批次。"""

    return datetime.now(timezone.utc)


class StandardGrade(str, Enum):
    """平台统一使用的等级集合。"""

    A = "A"
    B = "B"
    C = "C"


# Grade 是对外更短的兼容别名，统一仍由 StandardGrade 定义取值。
Grade = StandardGrade


class ImportBatch(Base):
    """一次或一组文件导入的处理结果。"""

    __tablename__ = "import_batch"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    imported_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    status: Mapped[str] = mapped_column(String(32), default="pending", nullable=False)
    success_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    warning_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    failure_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    source_files: Mapped[list[SourceFile]] = relationship(
        back_populates="import_batch", cascade="all, delete-orphan"
    )
    sale_records: Mapped[list[SaleRecord]] = relationship(
        back_populates="import_batch", cascade="all, delete-orphan"
    )
    container_summaries: Mapped[list[ContainerSummary]] = relationship(
        back_populates="import_batch", cascade="all, delete-orphan"
    )
    data_issues: Mapped[list[DataIssue]] = relationship(
        back_populates="import_batch", cascade="all, delete-orphan"
    )


class SourceFile(Base):
    """原始结算单的保存引用和内容哈希。"""

    __tablename__ = "source_file"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    import_batch_id: Mapped[int] = mapped_column(
        ForeignKey("import_batch.id", ondelete="CASCADE"), nullable=False, index=True
    )
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_hash: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    storage_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    stored_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )

    import_batch: Mapped[ImportBatch] = relationship(back_populates="source_files")
    sale_records: Mapped[list[SaleRecord]] = relationship(back_populates="source_file")
    data_issues: Mapped[list[DataIssue]] = relationship(back_populates="source_file")


class SaleRecord(Base):
    """标准化后的销售明细事实。"""

    __tablename__ = "sale_record"
    __table_args__ = (
        CheckConstraint("grade IN ('A', 'B', 'C')", name="ck_sale_record_grade"),
        Index("ix_sale_record_sale_date", "sale_date"),
        Index("ix_sale_record_container_id", "container_id"),
        Index("ix_sale_record_grade", "grade"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    import_batch_id: Mapped[int | None] = mapped_column(
        ForeignKey("import_batch.id", ondelete="SET NULL"), nullable=True, index=True
    )
    source_file_id: Mapped[int | None] = mapped_column(
        ForeignKey("source_file.id", ondelete="SET NULL"), nullable=True, index=True
    )
    container_id: Mapped[str] = mapped_column(String(128), nullable=False)
    container_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sale_date: Mapped[date] = mapped_column(Date, nullable=False)
    fruit_type: Mapped[str] = mapped_column(String(64), default="榴莲", nullable=False)
    grade_raw: Mapped[str | None] = mapped_column(String(64), nullable=True)
    grade: Mapped[StandardGrade] = mapped_column(
        SqlEnum(
            StandardGrade,
            name="standard_grade",
            native_enum=False,
            create_constraint=False,
            validate_strings=True,
        ),
        nullable=False,
    )
    spec_raw: Mapped[str | None] = mapped_column(String(255), nullable=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    remark: Mapped[str | None] = mapped_column(Text, nullable=True)
    sales_region: Mapped[str | None] = mapped_column(String(128), nullable=True)

    import_batch: Mapped[ImportBatch | None] = relationship(back_populates="sale_records")
    source_file: Mapped[SourceFile | None] = relationship(back_populates="sale_records")
    data_issues: Mapped[list[DataIssue]] = relationship(back_populates="sale_record")


class ContainerSummary(Base):
    """按货柜保存的结算摘要，作为销售明细的辅助解释信息。"""

    __tablename__ = "container_summary"
    __table_args__ = (
        Index("ix_container_summary_container_id", "container_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    import_batch_id: Mapped[int] = mapped_column(
        ForeignKey("import_batch.id", ondelete="CASCADE"), nullable=False, index=True
    )
    container_id: Mapped[str] = mapped_column(String(128), nullable=False)
    container_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sales_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    after_sale_amount: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 4), nullable=True
    )
    goods_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    fee_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    fee_detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    customs_tax: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    payable_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    remark: Mapped[str | None] = mapped_column(Text, nullable=True)

    import_batch: Mapped[ImportBatch] = relationship(back_populates="container_summaries")


class DataIssue(Base):
    """导入过程中发现的字段、等级、金额或重复数据问题。"""

    __tablename__ = "data_issue"
    __table_args__ = (
        Index("ix_data_issue_import_batch_id", "import_batch_id"),
        Index("ix_data_issue_issue_type", "issue_type"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    import_batch_id: Mapped[int] = mapped_column(
        ForeignKey("import_batch.id", ondelete="CASCADE"), nullable=False
    )
    source_file_id: Mapped[int | None] = mapped_column(
        ForeignKey("source_file.id", ondelete="SET NULL"), nullable=True
    )
    sale_record_id: Mapped[int | None] = mapped_column(
        ForeignKey("sale_record.id", ondelete="SET NULL"), nullable=True
    )
    row_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    issue_type: Mapped[str] = mapped_column(String(64), nullable=False)
    severity: Mapped[str] = mapped_column(String(16), default="warning", nullable=False)
    field_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    raw_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )

    import_batch: Mapped[ImportBatch] = relationship(back_populates="data_issues")
    source_file: Mapped[SourceFile | None] = relationship(back_populates="data_issues")
    sale_record: Mapped[SaleRecord | None] = relationship(back_populates="data_issues")


__all__ = [
    "ContainerSummary",
    "DataIssue",
    "Grade",
    "ImportBatch",
    "SaleRecord",
    "SourceFile",
    "StandardGrade",
]
