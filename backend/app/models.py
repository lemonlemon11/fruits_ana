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
from sqlalchemy.dialects.mysql import DATETIME as MySQLDateTime
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
PRECISE_DATETIME = DateTime(timezone=True).with_variant(
    MySQLDateTime(fsp=6),
    "mysql",
)


class User(Base):
    """平台认证用户。"""

    __tablename__ = "user"
    __table_args__ = (Index("ux_user_display_name", "display_name", unique=True),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # display_name 同时作为登录用户名，规范化后全局唯一。
    display_name: Mapped[str] = mapped_column(String(80), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(512), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        PRECISE_DATETIME, default=utc_now, nullable=False
    )
    last_login_at: Mapped[datetime | None] = mapped_column(
        PRECISE_DATETIME, nullable=True
    )
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)

    sessions: Mapped[list[UserSession]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class UserSession(Base):
    """可撤销的服务端会话记录，只保存 opaque token 的哈希。"""

    __tablename__ = "user_session"
    __table_args__ = (Index("ux_user_session_token_hash", "token_hash", unique=True),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        PRECISE_DATETIME, default=utc_now, nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(PRECISE_DATETIME, nullable=False)

    user: Mapped[User] = relationship(back_populates="sessions")


class ImportBatch(Base):
    """一张结算单（以商号为业务唯一键）的导入结果。"""

    __tablename__ = "import_batch"
    __table_args__ = (Index("ux_import_batch_merchant_no", "merchant_no", unique=True),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # 商号是我司商业合同唯一单据号；单号/柜号/转运车号允许重复或缺失。
    merchant_no: Mapped[str] = mapped_column(String(128), nullable=False)
    order_no: Mapped[str | None] = mapped_column(String(128), nullable=True)
    container_no: Mapped[str | None] = mapped_column(String(128), nullable=True)
    vehicle_no: Mapped[str | None] = mapped_column(String(128), nullable=True)
    imported_at: Mapped[datetime] = mapped_column(
        PRECISE_DATETIME, default=utc_now, nullable=False
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
    settlement_summaries: Mapped[list[SettlementSummary]] = relationship(
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
        PRECISE_DATETIME, default=utc_now, nullable=False
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
        Index("ix_sale_record_grade", "grade"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    import_batch_id: Mapped[int | None] = mapped_column(
        ForeignKey("import_batch.id", ondelete="SET NULL"), nullable=True, index=True
    )
    source_file_id: Mapped[int | None] = mapped_column(
        ForeignKey("source_file.id", ondelete="SET NULL"), nullable=True, index=True
    )
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


class SettlementSummary(Base):
    """按结算单保存的结算摘要，作为销售明细的辅助解释信息。"""

    __tablename__ = "settlement_summary"
    __table_args__ = (
        Index("ux_settlement_summary_batch", "import_batch_id", unique=True),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    import_batch_id: Mapped[int] = mapped_column(
        ForeignKey("import_batch.id", ondelete="CASCADE"), nullable=False, index=True
    )
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

    import_batch: Mapped[ImportBatch] = relationship(back_populates="settlement_summaries")


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
        PRECISE_DATETIME, default=utc_now, nullable=False
    )

    import_batch: Mapped[ImportBatch] = relationship(back_populates="data_issues")
    source_file: Mapped[SourceFile | None] = relationship(back_populates="data_issues")
    sale_record: Mapped[SaleRecord | None] = relationship(back_populates="data_issues")


class AiAnalysis(Base):
    """AI 分析结论缓存：按「功能 + 勾选条件 + 日期范围」缓存一份结论，避免重复调用大模型。"""

    __tablename__ = "ai_analysis"
    __table_args__ = (Index("ux_ai_analysis_cache_key", "cache_key", unique=True),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    cache_key: Mapped[str] = mapped_column(String(64), nullable=False)
    feature: Mapped[str] = mapped_column(String(64), nullable=False)
    model: Mapped[str] = mapped_column(String(120), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        PRECISE_DATETIME, default=utc_now, nullable=False
    )


__all__ = [
    "AiAnalysis",
    "DataIssue",
    "Grade",
    "ImportBatch",
    "SaleRecord",
    "SettlementSummary",
    "SourceFile",
    "StandardGrade",
    "User",
    "UserSession",
]
