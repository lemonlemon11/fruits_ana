"""数据库模型对应的 API 请求和响应 DTO。"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .models import StandardGrade
from .parser.spec_range import parse_spec_range


class ORMModel(BaseModel):
    """允许从 SQLAlchemy ORM 实例构造响应。"""

    model_config = ConfigDict(from_attributes=True)


class UserRead(BaseModel):
    id: int
    display_name: str
    permissions: list[str] = Field(default_factory=list)


class RegisterRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=128)
    remember_me: bool = False


class AuthResponse(BaseModel):
    user: UserRead


class NotificationRead(BaseModel):
    id: int
    title: str
    content: str
    notification_type: str
    priority: str
    publish_at: datetime | None
    is_read: bool
    read_at: datetime | None


class NotificationListResponse(BaseModel):
    items: list[NotificationRead]
    unread_count: int


class NotificationUnreadCount(BaseModel):
    unread_count: int


class SettlementListItem(BaseModel):
    merchant_no: str
    merchant_no_normalized: str | None = None
    order_no: str | None
    order_no_normalized: str | None = None
    series: str
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


class SettlementPagination(BaseModel):
    total: int
    page: int
    page_size: int
    pages: int


class SettlementListResponse(BaseModel):
    date_range: SettlementDateRange | None
    settlements: list[SettlementListItem]
    pagination: SettlementPagination | None = None


class SettlementRecordRead(BaseModel):
    id: int
    source_file_id: int | None
    import_batch_id: int | None
    sale_date: date
    fruit_type: str | None = None
    grade: str
    grade_raw: str | None
    spec_raw: str | None
    quantity: float | None
    unit_price: float | None
    amount: float | None
    remark: str | None
    sales_region: str | None = None


class SettlementRecordsResponse(BaseModel):
    merchant_no: str
    merchant_no_normalized: str | None = None
    order_no: str | None
    order_no_normalized: str | None = None
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
    merchant_no_normalized: str | None = None
    order_no: str | None
    order_no_normalized: str | None = None
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


class SeriesAnalysisRequest(BaseModel):
    """「系列对比」AI 分析的请求体。"""

    merchant_no: list[str] = Field(default_factory=list)
    start_date: date | None = None
    end_date: date | None = None
    refresh: bool = False


class SettlementAnalysisRequest(BaseModel):
    """结算单详情同品牌 AI 分析的请求体。"""

    start_date: date | None = None
    end_date: date | None = None
    refresh: bool = False


class SeriesAnalysisResponse(BaseModel):
    """AI 分析结论。"""

    content: str
    model: str
    generated_at: datetime
    cached: bool


class EntrySaleItemCreate(BaseModel):
    """销售明细行；头数与 KG 为文本（支持 ``3/4``、``9/10`` 区间写法）。"""

    sale_date: date
    variety: str = Field(pattern=r"^[A-Z]{1,3}$")
    head_count: str = Field(min_length=1, max_length=32)
    spec_kg: str = Field(min_length=1, max_length=32)
    sales_quantity: Decimal = Field(gt=0)
    unit_price: Decimal = Field(gt=0)
    remark: str | None = None

    @field_validator("head_count", "spec_kg")
    @classmethod
    def _check_range(cls, value: str, info) -> str:
        parsed = parse_spec_range(value)
        if parsed is None:
            label = "规格（头数）" if info.field_name == "head_count" else "规格（KG）"
            raise ValueError(f"{label}无法解析，请填写数字或区间（如 3/4、9/10、10）")
        return parsed.canonical


class EntryAfterSaleItemCreate(BaseModel):
    content: str = Field(min_length=1, max_length=255)
    summary: str = Field(default="", max_length=255)
    amount: Decimal = Field(ge=0)


class EntryFeeItemCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    amount: Decimal = Field(ge=0)
    is_custom: bool = False


class EntryCreate(BaseModel):
    merchant_no: str = Field(min_length=1, max_length=128)
    order_no: str = Field(min_length=1, max_length=128)
    container_no: str = Field(min_length=1, max_length=128)
    vehicle_no: str = Field(min_length=1, max_length=128)
    market: str = Field(min_length=1, max_length=128)
    arrival_date: date
    arrival_quantity: int = Field(ge=0)
    sales: list[EntrySaleItemCreate] = Field(min_length=1)
    after_sales: list[EntryAfterSaleItemCreate] = Field(default_factory=list)
    fees: list[EntryFeeItemCreate] = Field(default_factory=list)
    overwrite: bool = False


class EntrySaleItemRead(BaseModel):
    """读取用的销售明细行：只做展示，不跑写入侧的区间校验（历史数据不强求规范）。"""

    sale_date: date
    variety: str
    head_count: str
    spec_kg: str
    sales_quantity: Decimal
    unit_price: Decimal
    remark: str | None = None


class EntryRead(BaseModel):
    merchant_no: str
    order_no: str | None
    container_no: str | None
    vehicle_no: str | None
    market: str | None
    arrival_date: date | None
    arrival_quantity: int | None
    source_type: str
    sales: list[EntrySaleItemRead]
    after_sales: list[EntryAfterSaleItemCreate]
    fees: list[EntryFeeItemCreate]


class AskMessage(BaseModel):
    """问答的历史消息，只保留文本，避免把结构化内容塞回提示词。"""

    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class AskRequest(BaseModel):
    """自然语言提问的请求体。"""

    question: str = Field(min_length=1, max_length=500)
    history: list[AskMessage] = Field(default_factory=list, max_length=10)


class AskStep(BaseModel):
    """一次工具调用，用于向用户展示「这个数是从哪来的」。"""

    tool: str
    args: dict
    summary: str


class AskResponse(BaseModel):
    """问答结果：正文 + 数据来源。"""

    answer: str
    steps: list[AskStep] = Field(default_factory=list)
    model: str


__all__ = [
    "DataIssueCreate",
    "DataIssueRead",
    "EntryAfterSaleItemCreate",
    "EntryCreate",
    "EntryFeeItemCreate",
    "EntryRead",
    "EntrySaleItemCreate",
    "AskMessage",
    "AskRequest",
    "AskResponse",
    "AskStep",
    "AuthResponse",
    "NotificationListResponse",
    "NotificationRead",
    "NotificationUnreadCount",
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
    "SettlementPagination",
    "SeriesAnalysisRequest",
    "SeriesAnalysisResponse",
    "SettlementAnalysisRequest",
    "SettlementRecordRead",
    "SettlementRecordsResponse",
    "SourceFileCreate",
    "SourceFileRead",
    "StandardGrade",
    "SettlementSummaryCreate",
    "SettlementSummaryRead",
    "UserRead",
]
