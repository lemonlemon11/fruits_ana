"""手工录单的保存、读取与字段字典查询。"""

from __future__ import annotations

import json
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..models import (
    EntryDraft,
    EntryFieldOption,
    ImportBatch,
    SaleRecord,
    SettlementAfterSaleItem,
    SettlementFeeItem,
    SettlementRevision,
    SettlementSummary,
    StandardGrade,
    utc_now,
)
from ..parser.spec_range import SpecRange, parse_spec_range
from ..schemas import EntryCreate
from .field_conversion import convert_grade, match_market
from .merchant_no_naming import normalize_merchant_no
from .order_no_naming import normalize_order_no


MONEY_QUANTUM = Decimal("0.01")
QUANTITY_QUANTUM = Decimal("0.01")
FIXED_FEES = ("代卖佣金", "运费", "车位费", "入场费", "搬运费", "打冷费")


def _quantize(value: Decimal, quantum: Decimal) -> Decimal:
    return value.quantize(quantum, rounding=ROUND_HALF_UP)


def _money(value: Decimal) -> Decimal:
    return _quantize(value, MONEY_QUANTUM)


def _quantity(value: Decimal) -> Decimal:
    return _quantize(value, QUANTITY_QUANTUM)


@dataclass
class EntrySaveResult:
    """录单保存结果；conflict 时 existing_* 携带既有单信息。"""

    status: str
    merchant_no: str
    order_no: str | None = None
    existing_order_no: str | None = None
    existing_container_no: str | None = None
    existing_source_type: str | None = None
    conflict_reason: str | None = None


def list_field_options(db: Session, field_key: str) -> list[dict]:
    """返回指定字段的启用选项，按 sort_order、id 排序。"""

    rows = (
        db.query(EntryFieldOption)
        .filter(
            EntryFieldOption.field_key == field_key,
            EntryFieldOption.is_active.is_(True),
        )
        .order_by(EntryFieldOption.sort_order, EntryFieldOption.id)
        .all()
    )
    return [
        {"field": row.field_key, "value": row.value, "sort_order": row.sort_order}
        for row in rows
    ]


def _source_label(source_type: str | None) -> str:
    return "手工录单" if source_type == "manual" else "导入数据"


def _existing_conflict(
    db: Session,
    merchant_no: str,
    order_no: str | None,
    *,
    conflict_reason: str | None = None,
) -> EntrySaveResult | None:
    existing = db.query(ImportBatch).filter(ImportBatch.merchant_no == merchant_no).first()
    if existing is None:
        return None
    return EntrySaveResult(
        status="conflict",
        merchant_no=merchant_no,
        order_no=order_no,
        existing_order_no=existing.order_no,
        existing_container_no=existing.container_no,
        existing_source_type=existing.source_type,
        conflict_reason=conflict_reason or f"商号 {merchant_no} 已存在，需确认后覆盖",
    )


def _normalized_merchant_conflict(
    db: Session, merchant_no: str, normalized: str | None
) -> ImportBatch | None:
    if not normalized:
        return None
    return (
        db.query(ImportBatch)
        .filter(
            ImportBatch.merchant_no != merchant_no,
            ImportBatch.merchant_no_normalized == normalized,
        )
        .first()
    )


def _display_range(value) -> str:
    """读取时的规格展示值：能归一就展示规范文本，否则原样返回（不阻断读取）。"""

    parsed = parse_spec_range(value)
    if parsed is not None:
        return parsed.canonical
    return "" if value is None else str(value).strip()


def _spec_range(value, label: str) -> SpecRange | None:
    """解析规格文本；解析不出来直接拒绝入库（客户口径：不猜数，由人工补全）。"""

    text = "" if value is None else str(value).strip()
    if not text:
        return None
    parsed = parse_spec_range(text)
    if parsed is None:
        raise ValueError(f"{label}无法解析，请填写数字或区间（如 3/4、9/10、10）")
    return parsed


def _sale_model(batch_id: int, item, grade: StandardGrade) -> SaleRecord:
    amount = _money(item.sales_quantity * item.unit_price)
    head_count = _spec_range(item.head_count, "规格（头数）")
    spec_kg = _spec_range(item.spec_kg, "规格（KG）")
    return SaleRecord(
        import_batch_id=batch_id,
        sale_date=item.sale_date,
        fruit_type="榴莲",
        grade_raw=(item.variety or "").upper(),
        grade=grade,
        spec_raw=str(item.spec_kg or "").strip(),
        piece_count=head_count.canonical if head_count else None,
        piece_count_min=head_count.minimum if head_count else None,
        piece_count_max=head_count.maximum if head_count else None,
        spec_kg=spec_kg.canonical if spec_kg else None,
        spec_kg_min=spec_kg.minimum if spec_kg else None,
        spec_kg_max=spec_kg.maximum if spec_kg else None,
        quantity=_quantity(item.sales_quantity),
        unit_price=_money(item.unit_price),
        amount=amount,
        remark=item.remark,
    )


def _write_entry(db: Session, batch: ImportBatch, payload: EntryCreate) -> None:
    db.add(batch)
    db.flush()

    for sort_order, item in enumerate(payload.sales):
        db.add(_sale_model(batch.id, item, convert_grade(db, item.variety)))
    for sort_order, item in enumerate(payload.after_sales):
        db.add(
            SettlementAfterSaleItem(
                import_batch_id=batch.id,
                content=item.content.strip(),
                summary=item.summary.strip(),
                amount=abs(_money(item.amount)),
                sort_order=sort_order,
            )
        )
    for sort_order, item in enumerate(payload.fees):
        db.add(
            SettlementFeeItem(
                import_batch_id=batch.id,
                name=item.name.strip(),
                amount=_money(item.amount),
                is_custom=item.is_custom,
                sort_order=sort_order,
            )
        )

    sales_amount = sum(
        (_money(item.sales_quantity * item.unit_price) for item in payload.sales),
        Decimal("0"),
    )
    sales_quantity = sum(
        (_quantity(item.sales_quantity) for item in payload.sales),
        Decimal("0"),
    )
    after_amount = sum((abs(_money(item.amount)) for item in payload.after_sales), Decimal("0"))
    fee_amount = sum((_money(item.amount) for item in payload.fees), Decimal("0"))
    goods_amount = sales_amount - after_amount
    payable_amount = goods_amount - fee_amount
    db.add(
        SettlementSummary(
            import_batch_id=batch.id,
            sales_amount=_money(sales_amount),
            after_sale_amount=_money(after_amount),
            goods_amount=_money(goods_amount),
            fee_amount=_money(fee_amount),
            payable_amount=_money(payable_amount),
            sales_quantity=_quantity(sales_quantity),
            computed_sales_amount=_money(sales_amount),
            computed_quantity=_quantity(sales_quantity),
        )
    )


def save_entry(db: Session, payload: EntryCreate, user_id: int | None = None) -> EntrySaveResult:
    """按商号保存手工单；未确认覆盖时返回 conflict。"""

    merchant_no = payload.merchant_no.strip()
    if not merchant_no:
        raise ValueError("商号不能为空")
    for label, value in (
        ("柜号", payload.container_no),
        ("单号", payload.order_no),
        ("转运公司", payload.vehicle_no),
        ("市场", payload.market),
    ):
        if not value.strip():
            raise ValueError(f"{label}不能为空")
    if payload.arrival_date is None:
        raise ValueError("到达市场日期不能为空")
    if payload.arrival_quantity is None:
        raise ValueError("来货数量不能为空")
    if payload.arrival_quantity < 0:
        raise ValueError("来货数量不能为负数")
    if any(not item.content.strip() for item in payload.after_sales):
        raise ValueError("售后内容不能为空")
    if any(not item.name.strip() for item in payload.fees):
        raise ValueError("费用摘要不能为空")

    normalized_merchant = normalize_merchant_no(merchant_no)
    normalized_collision = _normalized_merchant_conflict(
        db, merchant_no, normalized_merchant
    )
    if normalized_collision is not None:
        return EntrySaveResult(
            status="conflict",
            merchant_no=merchant_no,
            order_no=payload.order_no,
            existing_order_no=normalized_collision.order_no,
            existing_container_no=normalized_collision.container_no,
            existing_source_type=normalized_collision.source_type,
            conflict_reason=(
                f"商号 {merchant_no} 归一化后与已有商号 {normalized_collision.merchant_no} 相同"
                f"（均为 {normalized_merchant}），不能保存"
            ),
        )

    existing = db.query(ImportBatch).filter(ImportBatch.merchant_no == merchant_no).first()
    if existing is not None and existing.source_type != "manual":
        return _existing_conflict(
            db,
            merchant_no,
            payload.order_no,
            conflict_reason=(
                f"商号 {merchant_no} 已由{_source_label(existing.source_type)}占用，"
                "不能通过手工录单覆盖"
            ),
        )
    if existing is not None and not payload.overwrite:
        return _existing_conflict(
            db,
            merchant_no,
            payload.order_no,
            conflict_reason=f"商号 {merchant_no} 已存在，需确认后覆盖",
        )

    old_payload = read_entry(db, merchant_no) if existing is not None else None
    if existing is not None:
        db.delete(existing)
        db.flush()

    batch = ImportBatch(
        merchant_no=merchant_no,
        merchant_no_normalized=normalize_merchant_no(merchant_no),
        order_no=payload.order_no,
        order_no_normalized=normalize_order_no(payload.order_no),
        container_no=payload.container_no,
        vehicle_no=payload.vehicle_no,
        source_type="manual",
        parse_mode="manual",
        market=match_market(db, payload.market),
        arrival_date=payload.arrival_date,
        arrival_quantity=payload.arrival_quantity,
        file_name=None,
        status="success",
        success_count=len(payload.sales),
        warning_count=0,
        failure_count=0,
    )
    try:
        _write_entry(db, batch, payload)
        if old_payload is not None:
            db.add(
                SettlementRevision(
                    import_batch_id=batch.id,
                    version=1,
                    section="manual",
                    field_name="full_payload",
                    old_value=json.dumps(old_payload, ensure_ascii=False, default=str),
                    new_value=json.dumps(
                        payload.model_dump(mode="json"), ensure_ascii=False, default=str
                    ),
                    change_type="manual",
                    reason="手工修改结算单",
                    changed_by=user_id,
                )
            )
        db.commit()
    except IntegrityError:
        db.rollback()
        concurrent = db.query(ImportBatch).filter(ImportBatch.merchant_no == merchant_no).first()
        if concurrent is not None:
            return _existing_conflict(
                db,
                merchant_no,
                payload.order_no,
                conflict_reason=(
                    f"商号 {merchant_no} 已由导入数据占用，不能通过手工录单覆盖"
                    if concurrent.source_type != "manual"
                    else f"商号 {merchant_no} 已存在，需确认后覆盖"
                ),
            )
        raise
    return EntrySaveResult(
        status="created" if existing is None else "saved",
        merchant_no=merchant_no,
        order_no=payload.order_no,
    )


def read_entry(db: Session, merchant_no: str) -> dict | None:
    """读取手工单；不存在或不是手工单返回 None。"""

    batch = (
        db.query(ImportBatch)
        .filter(
            ImportBatch.merchant_no == merchant_no,
            ImportBatch.source_type == "manual",
        )
        .first()
    )
    if batch is None:
        return None

    sales = (
        db.query(SaleRecord)
        .filter(SaleRecord.import_batch_id == batch.id)
        .order_by(SaleRecord.id)
        .all()
    )
    after_items = (
        db.query(SettlementAfterSaleItem)
        .filter(SettlementAfterSaleItem.import_batch_id == batch.id)
        .order_by(SettlementAfterSaleItem.sort_order, SettlementAfterSaleItem.id)
        .all()
    )
    fee_items = (
        db.query(SettlementFeeItem)
        .filter(SettlementFeeItem.import_batch_id == batch.id)
        .order_by(SettlementFeeItem.sort_order, SettlementFeeItem.id)
        .all()
    )
    return {
        "merchant_no": batch.merchant_no,
        "order_no": batch.order_no,
        "container_no": batch.container_no,
        "vehicle_no": batch.vehicle_no,
        "market": batch.market,
        "arrival_date": batch.arrival_date,
        "arrival_quantity": batch.arrival_quantity,
        "source_type": batch.source_type,
        "sales": [
            {
                "sale_date": record.sale_date,
                "variety": record.grade_raw if record.grade_raw is not None else record.grade.value,
                "head_count": _display_range(record.piece_count),
                "spec_kg": _display_range(record.spec_kg),
                "sales_quantity": record.quantity,
                "unit_price": record.unit_price,
                "remark": record.remark,
            }
            for record in sales
        ],
        "after_sales": [
            {
                "content": item.content,
                "summary": item.summary,
                "amount": abs(item.amount) if item.amount is not None else None,
            }
            for item in after_items
        ],
        "fees": [
            {
                "name": item.name,
                "amount": item.amount,
                "is_custom": item.is_custom,
            }
            for item in fee_items
        ],
    }


def _positive_number(value) -> bool:
    try:
        return float(value) > 0
    except (TypeError, ValueError):
        return False


def _entry_draft_sales_count(payload: dict) -> int:
    sales = payload.get("sales", []) if isinstance(payload, dict) else []
    if not isinstance(sales, list):
        return 0
    return sum(
        1
        for row in sales
        if isinstance(row, dict)
        and (
            str(row.get("sale_date") or "").strip()
            or _positive_number(row.get("sales_quantity"))
        )
    )


def _load_draft_payload(draft: EntryDraft | None) -> dict:
    if draft is None:
        return {}
    try:
        parsed = json.loads(draft.payload or "{}")
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _entry_draft_dict(draft: EntryDraft) -> dict:
    payload = _load_draft_payload(draft)
    return {
        "updated_at": draft.updated_at.isoformat(),
        "editing": draft.editing,
        "merchant_no": draft.merchant_no,
        "order_no": draft.order_no,
        "sales_count": _entry_draft_sales_count(payload),
        "payload": payload,
    }


def read_entry_draft(db: Session, user_id: int) -> dict | None:
    """读取当前用户最近一次暂存的手工录单草稿。"""

    draft = db.query(EntryDraft).filter(EntryDraft.user_id == user_id).one_or_none()
    if draft is None:
        return None
    return _entry_draft_dict(draft)


def save_entry_draft(
    db: Session,
    user_id: int,
    *,
    editing: bool,
    merchant_no: str,
    order_no: str,
    payload: dict,
) -> dict:
    """按用户 upsert 暂存草稿；不会校验正式录单的必填项。"""

    draft = db.query(EntryDraft).filter(EntryDraft.user_id == user_id).one_or_none()
    if draft is None:
        draft = EntryDraft(user_id=user_id)
        db.add(draft)
    draft.editing = editing
    draft.merchant_no = merchant_no or ""
    draft.order_no = order_no or ""
    draft.payload = json.dumps(payload, ensure_ascii=False, default=str)
    draft.updated_at = utc_now()
    db.commit()
    db.refresh(draft)
    return _entry_draft_dict(draft)


def clear_entry_draft(db: Session, user_id: int) -> None:
    """删除当前用户的暂存草稿；没有草稿时静默成功。"""

    draft = db.query(EntryDraft).filter(EntryDraft.user_id == user_id).one_or_none()
    if draft is None:
        return
    db.delete(draft)
    db.commit()


def ensure_manual_entry(db: Session, merchant_no: str) -> ImportBatch:
    """返回手工单批次，不存在或非手工单时抛出 ValueError。"""

    batch = (
        db.query(ImportBatch)
        .filter(
            ImportBatch.merchant_no == merchant_no,
            ImportBatch.source_type == "manual",
        )
        .first()
    )
    if batch is None:
        raise ValueError("该结算单不是手工录单，不能在此修改")
    return batch


__all__ = [
    "EntrySaveResult",
    "FIXED_FEES",
    "clear_entry_draft",
    "ensure_manual_entry",
    "list_field_options",
    "read_entry",
    "read_entry_draft",
    "save_entry",
    "save_entry_draft",
]
