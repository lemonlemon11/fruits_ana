"""水果销售分析平台的持久化模型。"""

from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from enum import Enum
from typing import Any

from sqlalchemy import (
    Boolean,
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
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.mysql import DATETIME as MySQLDateTime, MEDIUMTEXT as MySQLMediumText
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utc_now() -> datetime:
    """返回带时区的当前 UTC 时间，便于跨时区追踪导入批次。"""

    return datetime.now(timezone.utc)


class StandardGrade(str, Enum):
    """平台统一使用的等级集合。"""

    A = "A"
    B = "B"
    AB = "AB"
    C = "C"
    D = "D"
    E = "E"
    F = "F"
    OTHER = "OTHER"


# Grade 是对外更短的兼容别名，统一仍由 StandardGrade 定义取值。
Grade = StandardGrade
PRECISE_DATETIME = DateTime(timezone=True).with_variant(
    MySQLDateTime(fsp=6),
    "mysql",
)
# 解析草稿要装整份槽位 JSON，TEXT 的 64KB 上限不够，MySQL 用 MEDIUMTEXT。
PARSE_PAYLOAD = Text().with_variant(MySQLMediumText(), "mysql")


class User(Base):
    """平台认证用户。"""

    __tablename__ = "user"
    __table_args__ = (
        Index("ux_user_display_name", "display_name", unique=True),
        Index("ux_user_email", "email"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # display_name 同时作为登录用户名，规范化后全局唯一。
    display_name: Mapped[str] = mapped_column(String(80), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(512), nullable=False)
    email: Mapped[str | None] = mapped_column(
        String(320), nullable=True, comment="用户邮箱，nullable 兼容老用户"
    )
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


class VerificationCode(Base):
    """验证码记录，支持注册和重置密码两种用途。"""

    __tablename__ = "verification_code"
    __table_args__ = (
        Index("ix_verification_code_email", "email"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(320), nullable=False, comment="接收验证码的邮箱")
    code: Mapped[str] = mapped_column(String(6), nullable=False, comment="6 位纯数字验证码")
    purpose: Mapped[str] = mapped_column(
        String(20), default="register", nullable=False,
        comment="用途：register / reset_password"
    )
    created_at: Mapped[datetime] = mapped_column(
        PRECISE_DATETIME, default=utc_now, nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(
        PRECISE_DATETIME, nullable=False, comment="过期时间，默认 10 分钟"
    )
    verified_at: Mapped[datetime | None] = mapped_column(
        PRECISE_DATETIME, nullable=True, comment="验证通过时间，非空表示已验证"
    )
    attempt_count: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False, comment="已尝试验证次数"
    )

class PasswordResetToken(Base):
    """密码重置令牌，验证码校验通过后发放，一次性使用。"""

    __tablename__ = "password_reset_token"
    __table_args__ = (
        Index("ix_password_reset_token_email", "email"),
        Index("ix_password_reset_token_token_hash", "token_hash"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(320), nullable=False, comment="关联邮箱")
    token_hash: Mapped[str] = mapped_column(
        String(64), nullable=False, unique=True, comment="令牌 SHA-256 哈希"
    )
    created_at: Mapped[datetime] = mapped_column(
        PRECISE_DATETIME, default=utc_now, nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(
        PRECISE_DATETIME, nullable=False, comment="过期时间，默认 5 分钟"
    )
    used_at: Mapped[datetime | None] = mapped_column(
        PRECISE_DATETIME, nullable=True, comment="使用时间，非空表示已使用"
    )





class AdminRole(Base):
    """只读映射管理端创建的业务角色。"""

    __tablename__ = "admin_role"
    __table_args__ = (Index("ux_admin_role_code", "code", unique=True),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        PRECISE_DATETIME, default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        PRECISE_DATETIME, default=utc_now, onupdate=utc_now, nullable=False
    )


class AdminPermission(Base):
    """只读映射管理端创建的业务权限点。"""

    __tablename__ = "admin_permission"
    __table_args__ = (
        Index("ux_admin_permission_code", "code", unique=True),
        Index("ix_admin_permission_module", "module"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(80), nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    module: Mapped[str] = mapped_column(String(64), default="admin", nullable=False)
    permission_type: Mapped[str] = mapped_column(
        String(16), default="action", nullable=False
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        PRECISE_DATETIME, default=utc_now, nullable=False
    )


class AdminUserRole(Base):
    """只读映射用户与业务角色关系。"""

    __tablename__ = "admin_user_role"
    __table_args__ = (
        UniqueConstraint("user_id", "role_id", name="ux_admin_user_role"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role_id: Mapped[int] = mapped_column(
        ForeignKey("admin_role.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        PRECISE_DATETIME, default=utc_now, nullable=False
    )


class AdminRolePermission(Base):
    """只读映射业务角色与权限点关系。"""

    __tablename__ = "admin_role_permission"
    __table_args__ = (
        UniqueConstraint("role_id", "permission_id", name="ux_admin_role_permission"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    role_id: Mapped[int] = mapped_column(
        ForeignKey("admin_role.id", ondelete="CASCADE"), nullable=False, index=True
    )
    permission_id: Mapped[int] = mapped_column(
        ForeignKey("admin_permission.id", ondelete="CASCADE"), nullable=False, index=True
    )


class AdminMenu(Base):
    """只读映射管理端维护的业务菜单，用于侧边导航的名称、图标与排序。"""

    __tablename__ = "admin_menu"
    __table_args__ = (Index("ix_admin_menu_parent_id", "parent_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("admin_menu.id", ondelete="CASCADE"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    menu_type: Mapped[str] = mapped_column(String(16), default="menu", nullable=False)
    route_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    component: Mapped[str | None] = mapped_column(String(255), nullable=True)
    icon: Mapped[str | None] = mapped_column(String(64), nullable=True)
    permission_code: Mapped[str | None] = mapped_column(String(80), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        PRECISE_DATETIME, default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        PRECISE_DATETIME, default=utc_now, onupdate=utc_now, nullable=False
    )


class AdminRoleMenu(Base):
    """只读映射业务角色与菜单关系。"""

    __tablename__ = "admin_role_menu"
    __table_args__ = (
        UniqueConstraint("role_id", "menu_id", name="ux_admin_role_menu"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    role_id: Mapped[int] = mapped_column(
        ForeignKey("admin_role.id", ondelete="CASCADE"), nullable=False, index=True
    )
    menu_id: Mapped[int] = mapped_column(
        ForeignKey("admin_menu.id", ondelete="CASCADE"), nullable=False, index=True
    )


class ImportJob(Base):
    """一次多文件导入任务；确认前只产生草稿，不产生正式销售事实。"""

    __tablename__ = "import_job"
    __table_args__ = (
        Index("ux_import_job_token", "token", unique=True),
        Index("ix_import_job_status", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    token: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), default="pending", server_default=text("'pending'"), nullable=False
    )
    file_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    draft_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    confirmed_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        PRECISE_DATETIME, default=utc_now, nullable=False
    )
    confirmed_by: Mapped[int | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL"), nullable=True
    )
    confirmed_at: Mapped[datetime | None] = mapped_column(
        PRECISE_DATETIME, nullable=True
    )

    batches: Mapped[list["ImportBatch"]] = relationship(back_populates="import_job")
    drafts: Mapped[list["ImportDraft"]] = relationship(back_populates="import_job")


class ImportBatch(Base):
    """一张结算单（以商号为业务唯一键）的导入结果。"""

    __tablename__ = "import_batch"
    __table_args__ = (Index("ux_import_batch_merchant_no", "merchant_no", unique=True),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    import_job_id: Mapped[int | None] = mapped_column(
        ForeignKey("import_job.id", ondelete="SET NULL"), nullable=True, index=True
    )
    file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # 商号是我司商业合同唯一单据号；单号/柜号/转运车号允许重复或缺失。
    merchant_no: Mapped[str] = mapped_column(String(128), nullable=False)
    # 适配后的商号：页面统一展示用；merchant_no 仍是业务唯一键与接口参数（ADR-016）。
    merchant_no_normalized: Mapped[str | None] = mapped_column(String(128), nullable=True)
    order_no: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # 适配后的单号：页面统一展示用；order_no 始终保留填写人员的原始写法（ADR-015）。
    order_no_normalized: Mapped[str | None] = mapped_column(String(128), nullable=True)
    container_no: Mapped[str | None] = mapped_column(String(128), nullable=True)
    vehicle_no: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # server_default 与迁移脚本 add_entry_schema.py 的 `DEFAULT 'import'` 对齐，
    # 避免 create_all 与迁移脚本两条建表路径产出不同 DDL。
    source_type: Mapped[str] = mapped_column(
        String(16), default="import", server_default=text("'import'"), nullable=False
    )
    market: Mapped[str | None] = mapped_column(String(128), nullable=True)
    arrival_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    arrival_quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # 品牌＝导入时人工选的「品种」（香香 / 宝贝 / 晴牌），分析按它聚合，不再靠单号猜。
    brand: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    # 解析链路：rule（旧规则解析）/ llm（品牌提示词 + 大模型）/ manual（手工录单）。
    parse_mode: Mapped[str] = mapped_column(
        String(16), default="rule", server_default=text("'rule'"), nullable=False
    )
    # 品牌解析配置版本（如 xiangxiang@1），出问题时可定位到具体那版提示词。
    parse_profile: Mapped[str | None] = mapped_column(String(64), nullable=True)
    parse_model: Mapped[str | None] = mapped_column(String(120), nullable=True)
    parse_confidence: Mapped[Decimal | None] = mapped_column(Numeric(4, 3), nullable=True)
    # 二次确认留痕：谁在什么时候确认入库、人工一共改了几处。
    confirmed_by: Mapped[int | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL"), nullable=True
    )
    confirmed_at: Mapped[datetime | None] = mapped_column(
        PRECISE_DATETIME, nullable=True
    )
    manual_edit_count: Mapped[int] = mapped_column(
        Integer, default=0, server_default=text("0"), nullable=False
    )
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
    after_sale_items: Mapped[list[SettlementAfterSaleItem]] = relationship(
        back_populates="import_batch", cascade="all, delete-orphan"
    )
    fee_items: Mapped[list[SettlementFeeItem]] = relationship(
        back_populates="import_batch", cascade="all, delete-orphan"
    )
    import_drafts: Mapped[list[ImportDraft]] = relationship(
        back_populates="import_batch"
    )
    import_job: Mapped[ImportJob | None] = relationship(back_populates="batches")


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
    brand: Mapped[str | None] = mapped_column(String(32), nullable=True)
    sheet_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    row_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    parse_profile: Mapped[str | None] = mapped_column(String(64), nullable=True)
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
        CheckConstraint(
            "grade IN ('A', 'B', 'AB', 'C', 'D', 'E', 'F', 'OTHER')",
            name="ck_sale_record_grade",
        ),
        Index("ix_sale_record_sale_date", "sale_date"),
        Index("ix_sale_record_grade", "grade"),
        Index("ix_sale_record_date_grade", "sale_date", "grade"),
        # 规格/头数已是一等分析维度：分桶与排序都走派生端点列。
        Index("ix_sale_record_spec_kg", "spec_kg_min", "spec_kg_max"),
        Index("ix_sale_record_piece_count", "piece_count_min", "piece_count_max"),
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
    # 规格（头数 / KG）统一存归一后的文本（``3/4``、``9/10``），派生 min/max 供聚合与索引。
    piece_count: Mapped[str | None] = mapped_column(String(32), nullable=True)
    piece_count_min: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    piece_count_max: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    spec_kg: Mapped[str | None] = mapped_column(String(32), nullable=True)
    spec_kg_min: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    spec_kg_max: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    remark: Mapped[str | None] = mapped_column(Text, nullable=True)
    sales_region: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # A9 后缀（熟 / 裂 / 尾 / 黄皮 / 硬包 / 不售后…）：单独存便于展示，不参与任何计算。
    suffix: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # 逐行溯源：原文件行号 + 整行原文，供二次确认页「文件原文 vs 解析结果」并排对照。
    source_row: Mapped[int | None] = mapped_column(Integer, nullable=True)
    raw_row_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 大模型解析置信度与「待人工复核」标记（标红阻断保存）。
    confidence: Mapped[Decimal | None] = mapped_column(Numeric(4, 3), nullable=True)
    needs_review: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("0"), nullable=False
    )
    review_note: Mapped[str | None] = mapped_column(String(255), nullable=True)

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
    # 上面金额字段保存「确认后自洽的计算值」；下面 file_* 保存文件原值用于对账与溯源。
    sales_quantity: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    file_sales_quantity: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 4), nullable=True
    )
    file_sales_amount: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 4), nullable=True
    )
    file_after_sale_amount: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 4), nullable=True
    )
    file_goods_amount: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 4), nullable=True
    )
    file_fee_amount: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 4), nullable=True
    )
    file_fee_detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    file_customs_tax: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 4), nullable=True
    )
    file_payable_amount: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 4), nullable=True
    )
    computed_sales_amount: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 4), nullable=True
    )
    computed_quantity: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 4), nullable=True
    )
    reconcile_status: Mapped[str | None] = mapped_column(String(16), nullable=True)
    reconcile_detail: Mapped[str | None] = mapped_column(String(255), nullable=True)
    remark: Mapped[str | None] = mapped_column(Text, nullable=True)

    import_batch: Mapped[ImportBatch] = relationship(back_populates="settlement_summaries")


class SettlementAfterSaleItem(Base):
    """手工录单的售后明细行。"""

    __tablename__ = "settlement_after_sale_item"
    __table_args__ = (
        Index("ix_settlement_after_sale_item_batch", "import_batch_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    import_batch_id: Mapped[int] = mapped_column(
        ForeignKey("import_batch.id", ondelete="CASCADE"), nullable=False
    )
    content: Mapped[str] = mapped_column(String(255), nullable=False)
    summary: Mapped[str] = mapped_column(String(255), nullable=False)
    # 非销售行（损耗 / 抽检 / 补果 / 硬包）没有金额，允许留空而不是写 0。
    amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    # after_sale / loss / inspection / replenish / hard_pack / other。
    item_type: Mapped[str] = mapped_column(
        String(32), default="after_sale", server_default=text("'after_sale'"), nullable=False
    )
    quantity: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    source_row: Mapped[int | None] = mapped_column(Integer, nullable=True)
    raw_row_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    import_batch: Mapped[ImportBatch] = relationship(back_populates="after_sale_items")


class SettlementFeeItem(Base):
    """手工录单的支出费用行，包含固定六项与自定义费用。"""

    __tablename__ = "settlement_fee_item"
    __table_args__ = (
        Index("ix_settlement_fee_item_batch", "import_batch_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    import_batch_id: Mapped[int] = mapped_column(
        ForeignKey("import_batch.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    is_custom: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # commission / freight / parking / entry / carry / cold / customs / other。
    fee_kind: Mapped[str | None] = mapped_column(String(32), nullable=True)
    source_row: Mapped[int | None] = mapped_column(Integer, nullable=True)
    raw_row_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    import_batch: Mapped[ImportBatch] = relationship(back_populates="fee_items")


class EntryFieldOption(Base):
    """录单页字段下拉字典，由管理端 fruit_admin 维护。"""

    __tablename__ = "entry_field_option"
    __table_args__ = (
        Index("ux_entry_field_option", "field_key", "value", unique=True),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    field_key: Mapped[str] = mapped_column(String(32), nullable=False)
    value: Mapped[str] = mapped_column(String(64), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        PRECISE_DATETIME, default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        PRECISE_DATETIME, default=utc_now, onupdate=utc_now, nullable=False
    )


class EntryDraft(Base):
    """手工录单的暂存草稿：按登录用户保留一份未提交内容。"""

    __tablename__ = "entry_draft"
    __table_args__ = (
        Index("ux_entry_draft_user", "user_id", unique=True),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), nullable=False
    )
    editing: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    merchant_no: Mapped[str] = mapped_column(String(128), default="", nullable=False)
    order_no: Mapped[str] = mapped_column(String(128), default="", nullable=False)
    payload: Mapped[str] = mapped_column(PARSE_PAYLOAD, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        PRECISE_DATETIME, default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        PRECISE_DATETIME, default=utc_now, onupdate=utc_now, nullable=False
    )


class AdminFieldConversionRule(Base):
    """管理端维护的字段转换规则，业务侧读取后生成统计字段。"""

    __tablename__ = "admin_field_conversion_rule"
    __table_args__ = (
        Index("ux_admin_field_conversion_rule", "field_key", "source_value", unique=True),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    field_key: Mapped[str] = mapped_column(String(32), nullable=False)
    source_value: Mapped[str] = mapped_column(String(64), nullable=False)
    target_value: Mapped[str] = mapped_column(String(64), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        PRECISE_DATETIME, default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        PRECISE_DATETIME, default=utc_now, onupdate=utc_now, nullable=False
    )


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
    # 问题来源：rule（规则校验）/ llm（模型解析）/ reconcile（合计对账）。
    origin: Mapped[str] = mapped_column(
        String(16), default="rule", server_default=text("'rule'"), nullable=False
    )
    # 人工在二次确认页改完后置位，用于统计「哪些问题最终没被人处理」。
    resolved: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("0"), nullable=False
    )
    resolved_by: Mapped[int | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL"), nullable=True
    )
    resolved_at: Mapped[datetime | None] = mapped_column(
        PRECISE_DATETIME, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        PRECISE_DATETIME, default=utc_now, nullable=False
    )

    import_batch: Mapped[ImportBatch] = relationship(back_populates="data_issues")
    source_file: Mapped[SourceFile | None] = relationship(back_populates="data_issues")
    sale_record: Mapped[SaleRecord | None] = relationship(back_populates="data_issues")


class ImportDraft(Base):
    """单文件解析出的录单草稿：确认前先落库，便于反复复核与留痕。"""

    __tablename__ = "import_draft"
    __table_args__ = (
        Index("ux_import_draft_token", "token", unique=True),
        Index("ix_import_draft_status", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    import_job_id: Mapped[int | None] = mapped_column(
        ForeignKey("import_job.id", ondelete="SET NULL"), nullable=True, index=True
    )
    token: Mapped[str] = mapped_column(String(64), nullable=False)
    version: Mapped[int] = mapped_column(
        Integer, default=1, server_default=text("1"), nullable=False
    )
    brand: Mapped[str | None] = mapped_column(String(32), nullable=True)
    file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    file_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    storage_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    # pending（待确认）/ confirmed（已入库）/ discarded（放弃）。
    status: Mapped[str] = mapped_column(
        String(16), default="pending", server_default=text("'pending'"), nullable=False
    )
    # 槽位 JSON + 问题清单：模型输出的原始结构与标红原因都留在这里。
    payload: Mapped[str] = mapped_column(PARSE_PAYLOAD, nullable=False)
    original_payload: Mapped[str | None] = mapped_column(PARSE_PAYLOAD, nullable=True)
    issue_count: Mapped[int] = mapped_column(
        Integer, default=0, server_default=text("0"), nullable=False
    )
    parse_profile: Mapped[str | None] = mapped_column(String(64), nullable=True)
    parse_model: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        PRECISE_DATETIME, default=utc_now, nullable=False
    )
    updated_by: Mapped[int | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL"), nullable=True
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        PRECISE_DATETIME, nullable=True
    )
    confirmed_by: Mapped[int | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL"), nullable=True
    )
    confirmed_at: Mapped[datetime | None] = mapped_column(
        PRECISE_DATETIME, nullable=True
    )
    import_batch_id: Mapped[int | None] = mapped_column(
        ForeignKey("import_batch.id", ondelete="SET NULL"), nullable=True, index=True
    )

    import_batch: Mapped[ImportBatch | None] = relationship(back_populates="import_drafts")
    import_job: Mapped[ImportJob | None] = relationship(back_populates="drafts")


class SettlementRevision(Base):
    """导入确认与后续手工修改的统一留痕。"""

    __tablename__ = "settlement_revision"
    __table_args__ = (
        Index("ix_settlement_revision_batch", "import_batch_id"),
        Index("ix_settlement_revision_draft", "import_draft_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    import_batch_id: Mapped[int | None] = mapped_column(
        ForeignKey("import_batch.id", ondelete="CASCADE"), nullable=True, index=True
    )
    import_draft_id: Mapped[int | None] = mapped_column(
        ForeignKey("import_draft.id", ondelete="SET NULL"), nullable=True, index=True
    )
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    section: Mapped[str] = mapped_column(String(32), nullable=False)
    source_row: Mapped[int | None] = mapped_column(Integer, nullable=True)
    field_name: Mapped[str] = mapped_column(String(64), nullable=False)
    old_value: Mapped[str | None] = mapped_column(PARSE_PAYLOAD, nullable=True)
    new_value: Mapped[str | None] = mapped_column(PARSE_PAYLOAD, nullable=True)
    change_type: Mapped[str] = mapped_column(String(16), default="manual", nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    changed_by: Mapped[int | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL"), nullable=True
    )
    changed_at: Mapped[datetime] = mapped_column(
        PRECISE_DATETIME, default=utc_now, nullable=False
    )


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


class AdminNotification(Base):
    """管理端写入、用户端只读的站内通知。"""

    __tablename__ = "admin_notification"
    __table_args__ = (
        Index("ix_admin_notification_created_at", "created_at"),
        Index("ix_admin_notification_publish_at", "publish_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    notification_type: Mapped[str] = mapped_column(
        String(32), default="announcement", nullable=False
    )
    priority: Mapped[str] = mapped_column(
        String(16), default="normal", nullable=False
    )
    target_type: Mapped[str] = mapped_column(
        String(16), default="all", nullable=False
    )
    target_role_ids: Mapped[str | None] = mapped_column(Text, nullable=True)
    target_user_ids: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    publish_at: Mapped[datetime | None] = mapped_column(PRECISE_DATETIME, nullable=True)
    expire_at: Mapped[datetime | None] = mapped_column(PRECISE_DATETIME, nullable=True)
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        PRECISE_DATETIME, default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        PRECISE_DATETIME, default=utc_now, onupdate=utc_now, nullable=False
    )


class AdminNotificationRecipient(Base):
    """当前用户与通知的阅读状态。"""

    __tablename__ = "admin_notification_recipient"
    __table_args__ = (
        Index(
            "ux_admin_notification_recipient",
            "notification_id",
            "user_id",
            unique=True,
        ),
        Index("ix_admin_notification_recipient_user_id", "user_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    notification_id: Mapped[int] = mapped_column(
        ForeignKey("admin_notification.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), nullable=False
    )
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    read_at: Mapped[datetime | None] = mapped_column(PRECISE_DATETIME, nullable=True)
    last_reminded_at: Mapped[datetime | None] = mapped_column(
        PRECISE_DATETIME, nullable=True
    )
    remind_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        PRECISE_DATETIME, default=utc_now, nullable=False
    )


__all__ = [
    "AdminPermission",
    "AdminRole",
    "AdminRolePermission",
    "AdminUserRole",
    "AdminNotification",
    "AdminNotificationRecipient",
    "AiAnalysis",
    "AdminFieldConversionRule",
    "DataIssue",
    "EntryDraft",
    "EntryFieldOption",
    "Grade",
    "ImportBatch",
    "ImportDraft",
    "ImportJob",
    "SaleRecord",
    "SettlementAfterSaleItem",
    "SettlementFeeItem",
    "SettlementRevision",
    "SettlementSummary",
    "SourceFile",
    "StandardGrade",
    "User",
    "UserSession",
]


# 数据库列注释：统一给所有已注册模型补 MySQL `COMMENT`。
# 放在模型定义之后、应用启动前的 `Base.metadata.create_all` 之前生效。
FIELD_COMMENTS: dict[str, str] = {
    "id": "主键",
    "action": "操作类型",
    "after_data": "变更后数据",
    "after_sale_amount": "售后金额",
    "amount": "金额",
    "arrival_date": "到达日期",
    "arrival_quantity": "到货数量",
    "before_data": "变更前数据",
    "brand": "品牌",
    "cache_key": "缓存键",
    "change_type": "变更类型",
    "changed_at": "修改时间",
    "changed_by": "修改人",
    "code": "编码",
    "component": "前端组件",
    "computed_quantity": "计算数量",
    "computed_sales_amount": "计算销售金额",
    "confidence": "置信度",
    "confirmed_at": "确认时间",
    "confirmed_by": "确认人",
    "confirmed_count": "已确认数量",
    "container_no": "柜号",
    "content": "内容",
    "created_at": "创建时间",
    "created_by": "创建人",
    "customs_tax": "清关税费",
    "description": "描述",
    "display_name": "显示名称（登录用户名）",
    "draft_count": "草稿数",
    "editing": "是否修改中",
    "error_summary": "错误摘要",
    "expire_at": "过期时间",
    "expires_at": "过期时间",
    "failure_count": "失败数",
    "feature": "功能标识",
    "fee_amount": "费用金额",
    "fee_detail": "费用明细",
    "fee_kind": "费用类型",
    "field_key": "字段标识",
    "field_name": "字段名",
    "file_after_sale_amount": "文件售后金额",
    "file_count": "文件数",
    "file_customs_tax": "文件清关税费",
    "file_fee_amount": "文件费用金额",
    "file_fee_detail": "文件费用明细",
    "file_goods_amount": "文件货款金额",
    "file_hash": "文件哈希",
    "file_name": "文件名",
    "file_payable_amount": "文件应付金额",
    "file_sales_amount": "文件销售金额",
    "file_sales_quantity": "文件销售数量",
    "fruit_type": "水果类型",
    "goods_amount": "货款金额",
    "grade": "等级",
    "grade_raw": "原始等级",
    "icon": "图标",
    "import_batch_id": "导入批次ID",
    "import_draft_id": "导入草稿ID",
    "import_job_id": "导入任务ID",
    "imported_at": "导入时间",
    "ip": "IP地址",
    "is_active": "是否启用",
    "is_custom": "是否自定义",
    "is_published": "是否发布",
    "is_read": "是否已读",
    "is_super_admin": "是否超级管理员",
    "is_system": "是否系统内置",
    "issue_count": "问题数量",
    "issue_type": "问题类型",
    "item_type": "项目类型",
    "key": "配置键",
    "last_login_at": "最后登录时间",
    "last_reminded_at": "最近提醒时间",
    "manual_edit_count": "人工修改数",
    "market": "市场",
    "menu_id": "菜单ID",
    "menu_type": "菜单类型",
    "merchant_no": "商号",
    "merchant_no_normalized": "规范化商号",
    "message": "消息",
    "model": "模型",
    "module": "模块",
    "name": "名称",
    "needs_review": "是否需要复核",
    "new_value": "新值",
    "notification_id": "通知ID",
    "notification_type": "通知类型",
    "old_value": "旧值",
    "order_no": "单号",
    "order_no_normalized": "规范化单号",
    "origin": "来源",
    "original_payload": "原始载荷",
    "parent_id": "父级ID",
    "parse_confidence": "解析置信度",
    "parse_mode": "解析方式",
    "parse_model": "解析模型",
    "parse_profile": "解析配置",
    "password_hash": "密码哈希",
    "payable_amount": "应付金额",
    "payload": "载荷",
    "permission_code": "权限编码",
    "permission_id": "权限ID",
    "permission_type": "权限类型",
    "piece_count": "件数",
    "piece_count_max": "件数上限",
    "piece_count_min": "件数下限",
    "priority": "优先级",
    "publish_at": "发布时间",
    "quantity": "数量",
    "raw_row_text": "原始行文本",
    "raw_value": "原始值",
    "read_at": "阅读时间",
    "reason": "原因",
    "reconcile_detail": "对账明细",
    "reconcile_status": "对账状态",
    "remark": "备注",
    "remind_count": "提醒次数",
    "resolved": "是否已解决",
    "resolved_at": "解决时间",
    "resolved_by": "解决人",
    "review_note": "复核备注",
    "role_id": "角色ID",
    "route_path": "路由路径",
    "row_count": "行数",
    "row_number": "行号",
    "sale_date": "销售日期",
    "sale_record_id": "销售记录ID",
    "sales_amount": "销售金额",
    "sales_quantity": "销售数量",
    "sales_region": "销售区域",
    "section": "区块",
    "severity": "严重程度",
    "sheet_name": "工作表名",
    "sort_order": "排序",
    "source_file_id": "源文件ID",
    "source_row": "源行号",
    "source_type": "来源类型",
    "source_value": "源值",
    "spec_kg": "规格重量",
    "spec_kg_max": "规格重量上限",
    "spec_kg_min": "规格重量下限",
    "spec_raw": "原始规格",
    "status": "状态",
    "storage_path": "存储路径",
    "stored_at": "存储时间",
    "success": "是否成功",
    "success_count": "成功数",
    "suffix": "后缀",
    "summary": "摘要",
    "target_id": "目标ID",
    "target_role_ids": "目标角色ID列表",
    "target_type": "目标类型",
    "target_user_ids": "目标用户ID列表",
    "target_value": "目标值",
    "title": "标题",
    "token": "令牌",
    "token_hash": "令牌哈希",
    "unit_price": "单价",
    "updated_at": "更新时间",
    "updated_by": "更新人",
    "user_agent": "用户代理",
    "user_id": "用户ID",
    "username": "用户名",
    "value": "值",
    "vehicle_no": "转运车号",
    "version": "版本",
    "warning_count": "警告数",
}


for _table in Base.metadata.tables.values():
    for _column in _table.columns:
        _comment = FIELD_COMMENTS.get(_column.name)
        if _comment:
            _column.comment = _comment
