"""数据库模型对应的 API 请求和响应 DTO。"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from .models import StandardGrade


class ORMModel(BaseModel):
    """允许从 SQLAlchemy ORM 实例构造响应。"""

    model_config = ConfigDict(from_attributes=True)


class ImportBatchCreate(BaseModel):
    file_name: str | None = None


class ImportBatchRead(ORMModel):
    id: int
    file_name: str | None
    imported_at: datetime
    status: str
    success_count: int
    warning_count: int
    failure_count: int
    error_summary: str | None


class SourceFileCreate(BaseModel):
    file_name: str = Field(min_length=1, max_length=255)
    file_hash: str = Field(min_length=1, max_length=128)
    storage_path: str | None = None


class SourceFileRead(ORMModel):
    id: int
    import_batch_id: int
    file_name: str
    file_hash: str
    storage_path: str | None
    stored_at: datetime


class SaleRecordBase(BaseModel):
    container_id: str = Field(min_length=1, max_length=128)
    container_name: str | None = None
    sale_date: date
    fruit_type: str = "榴莲"
    grade_raw: str | None = None
    grade: StandardGrade
    spec_raw: str | None = None
    quantity: Decimal
    unit_price: Decimal
    amount: Decimal
    remark: str | None = None
    sales_region: str | None = None


class SaleRecordCreate(SaleRecordBase):
    import_batch_id: int | None = None
    source_file_id: int | None = None


class SaleRecordRead(SaleRecordBase, ORMModel):
    id: int
    import_batch_id: int | None
    source_file_id: int | None


class ContainerSummaryCreate(BaseModel):
    container_id: str = Field(min_length=1, max_length=128)
    container_name: str | None = None
    sales_amount: Decimal | None = None
    after_sale_amount: Decimal | None = None
    goods_amount: Decimal | None = None
    fee_amount: Decimal | None = None
    fee_detail: str | None = None
    customs_tax: Decimal | None = None
    payable_amount: Decimal | None = None
    remark: str | None = None


class ContainerSummaryRead(ContainerSummaryCreate, ORMModel):
    id: int
    import_batch_id: int


class DataIssueCreate(BaseModel):
    issue_type: str = Field(min_length=1, max_length=64)
    severity: str = "warning"
    row_number: int | None = None
    field_name: str | None = None
    message: str = Field(min_length=1)
    raw_value: str | None = None


class DataIssueRead(DataIssueCreate, ORMModel):
    id: int
    import_batch_id: int
    source_file_id: int | None
    sale_record_id: int | None
    created_at: datetime


__all__ = [
    "ContainerSummaryCreate",
    "ContainerSummaryRead",
    "DataIssueCreate",
    "DataIssueRead",
    "ImportBatchCreate",
    "ImportBatchRead",
    "SaleRecordBase",
    "SaleRecordCreate",
    "SaleRecordRead",
    "SourceFileCreate",
    "SourceFileRead",
    "StandardGrade",
]
