"""数据库模型对应的 API 请求和响应 DTO。"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from .models import StandardGrade


class ORMModel(BaseModel):
    """允许从 SQLAlchemy ORM 实例构造响应。"""

    model_config = ConfigDict(from_attributes=True)


class UserRead(BaseModel):
    id: int
    display_name: str


class RegisterRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=128)


class AuthResponse(BaseModel):
    user: UserRead


class SettlementListItem(BaseModel):
    merchant_no: str
    order_no: str | None
    container_no: str | None
    vehicle_no: str | None
    sale_date_start: date
    sale_date_end: date
    sales_amount: float
    total_quantity: float
    average_price: float | None
    grade_quantities: dict[str, float]
    record_count: int


class SettlementDateRange(BaseModel):
    start_date: date
    end_date: date
    is_default: bool


class SettlementListResponse(BaseModel):
    date_range: SettlementDateRange | None
    settlements: list[SettlementListItem]


class SettlementRecordRead(BaseModel):
    id: int
    source_file_id: int | None
    import_batch_id: int | None
    sale_date: date
    grade: str
    grade_raw: str | None
    spec_raw: str | None
    quantity: float | None
    unit_price: float | None
    amount: float | None
    remark: str | None


class SettlementRecordsResponse(BaseModel):
    merchant_no: str
    order_no: str | None
    container_no: str | None
    vehicle_no: str | None
    records: list[SettlementRecordRead]


class ImportBatchCreate(BaseModel):
    file_name: str | None = None
    merchant_no: str = Field(min_length=1, max_length=128)
    order_no: str | None = None
    container_no: str | None = None
    vehicle_no: str | None = None


class ImportBatchRead(ORMModel):
    id: int
    file_name: str | None
    merchant_no: str
    order_no: str | None
    container_no: str | None
    vehicle_no: str | None
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


class SettlementSummaryCreate(BaseModel):
    sales_amount: Decimal | None = None
    after_sale_amount: Decimal | None = None
    goods_amount: Decimal | None = None
    fee_amount: Decimal | None = None
    fee_detail: str | None = None
    customs_tax: Decimal | None = None
    payable_amount: Decimal | None = None
    remark: str | None = None


class SettlementSummaryRead(SettlementSummaryCreate, ORMModel):
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
    "DataIssueCreate",
    "DataIssueRead",
    "AuthResponse",
    "ImportBatchCreate",
    "ImportBatchRead",
    "LoginRequest",
    "RegisterRequest",
    "SaleRecordBase",
    "SaleRecordCreate",
    "SaleRecordRead",
    "SettlementDateRange",
    "SettlementListItem",
    "SettlementListResponse",
    "SettlementRecordRead",
    "SettlementRecordsResponse",
    "SourceFileCreate",
    "SourceFileRead",
    "StandardGrade",
    "SettlementSummaryCreate",
    "SettlementSummaryRead",
    "UserRead",
]
