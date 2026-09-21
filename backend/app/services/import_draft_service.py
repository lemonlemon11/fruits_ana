"""新模板多文件导入的草稿、复核、留痕与确认入库。"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any
from uuid import uuid4

from sqlalchemy.orm import Session

from ..models import (
    DataIssue,
    ImportBatch,
    ImportDraft,
    ImportJob,
    SaleRecord,
    SettlementAfterSaleItem,
    SettlementFeeItem,
    SettlementRevision,
    SettlementSummary,
    SourceFile,
)
from ..parser.settlement_template import SettlementTemplate
from ..parser.spec_range import parse_spec_range
from .field_conversion import convert_grade, match_market
from .merchant_no_naming import normalize_merchant_no
from .order_no_naming import normalize_order_no


MONEY_QUANTUM = Decimal("0.01")
QUANTITY_QUANTUM = Decimal("0.01")


class ImportConfirmBlocked(ValueError):
    """存在阻断问题时拒绝直接确认；force=true 时可带错提交。"""


def _money(value: Any) -> Decimal:
    number = Decimal(str(value or 0))
    return number.quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)


def _quantity(value: Any) -> Decimal:
    number = Decimal(str(value or 0))
    return number.quantize(QUANTITY_QUANTUM, rounding=ROUND_HALF_UP)


def _iso(value: date | datetime | None) -> str | None:
    if isinstance(value, datetime):
        return value.date().isoformat()
    return value.isoformat() if value else None


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _parse_json(value: str | None, fallback: Any) -> Any:
    if not value:
        return fallback
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return fallback


def parsed_draft_payload(parsed: SettlementTemplate) -> dict[str, Any]:
    """把解析结果转成前端可回填、后端可复核的 JSON 槽位。"""

    return {
        "merchant_no": parsed.merchant_no,
        "order_no": parsed.order_no or "",
        "container_no": parsed.container_no or "",
        "vehicle_no": parsed.vehicle_no or "",
        "market": parsed.market or "",
        "arrival_date": _iso(parsed.arrival_date) or "",
        "arrival_quantity": str(parsed.arrival_quantity or "0"),
        "sales": parsed.sales,
        "after_sales": parsed.after_sales,
        "fees": parsed.fees,
        "file_summary": parsed.file_summary,
        "computed_summary": parsed.computed_summary,
    }


def _computed_totals(payload: dict[str, Any]) -> dict[str, Decimal]:
    sales = payload.get("sales") or []
    sales_amount = sum(
        (_quantity(row.get("sales_quantity")) * _money(row.get("unit_price")))
        for row in sales
    )
    total_quantity = sum((_quantity(row.get("sales_quantity")) for row in sales), Decimal("0"))
    after_amount = sum(
        (abs(_money(row.get("amount"))) for row in payload.get("after_sales") or []),
        Decimal("0"),
    )
    fee_amount = sum((_money(row.get("amount")) for row in payload.get("fees") or []), Decimal("0"))
    goods_amount = sales_amount - after_amount
    payable_amount = goods_amount - fee_amount
    return {
        "sales_quantity": total_quantity,
        "sales_amount": sales_amount,
        "after_sale_amount": after_amount,
        "goods_amount": goods_amount,
        "fee_amount": fee_amount,
        "payable_amount": payable_amount,
    }


def _issue(code: str, severity: str, message: str, **extra: Any) -> dict[str, Any]:
    return {
        "code": code,
        "severity": severity,
        "message": message,
        "section": extra.get("section"),
        "row": extra.get("row"),
        "field": extra.get("field"),
        "raw_value": extra.get("raw_value"),
    }


def validate_draft_payload(payload: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, str]]:
    """校验当前草稿；返回问题数组与系统计算汇总。"""

    issues: list[dict[str, Any]] = []
    required_basic = (
        ("merchant_no", "商号"),
        ("order_no", "单号"),
        ("container_no", "柜号"),
        ("vehicle_no", "转运公司"),
        ("market", "市场"),
        ("arrival_date", "到达市场日期"),
        ("arrival_quantity", "来货数量"),
    )
    for field, label in required_basic:
        value = str(payload.get(field) or "").strip()
        if not value:
            issues.append(_issue("missing_field", "error", f"{label}不能为空", section="basic", field=field))

    arrival_date = str(payload.get("arrival_date") or "").strip()
    if arrival_date:
        try:
            date.fromisoformat(arrival_date)
        except ValueError:
            issues.append(_issue("invalid_date", "error", "到达市场日期不是有效日期", section="basic", field="arrival_date", raw_value=arrival_date))
    try:
        arrival_quantity = _quantity(payload.get("arrival_quantity"))
        if arrival_quantity < 0:
            issues.append(_issue("invalid_quantity", "error", "来货数量不能为负数", section="basic", field="arrival_quantity", raw_value=payload.get("arrival_quantity")))
        elif arrival_quantity != arrival_quantity.to_integral_value():
            issues.append(_issue("invalid_quantity", "error", "来货数量必须为整数", section="basic", field="arrival_quantity", raw_value=payload.get("arrival_quantity")))
    except Exception:
        issues.append(_issue("invalid_quantity", "error", "来货数量必须为数字", section="basic", field="arrival_quantity", raw_value=payload.get("arrival_quantity")))

    sales = payload.get("sales") or []
    for index, row in enumerate(sales, start=1):
        source_row = row.get("source_row") if isinstance(row, dict) else None
        if not str(row.get("sale_date") or "").strip():
            issues.append(_issue("missing_field", "error", "销售日期不能为空", section="sales", row=index, field="sale_date"))
        else:
            try:
                date.fromisoformat(str(row.get("sale_date")).strip())
            except ValueError:
                issues.append(_issue("invalid_date", "error", "销售日期不是有效日期", section="sales", row=index, field="sale_date", raw_value=row.get("sale_date")))
        variety = str(row.get("variety") or "").strip()
        if variety and not re.fullmatch(r"[A-Z]{1,3}", variety):
            issues.append(_issue("invalid_grade", "error", "品种必须是 1~3 个大写字母，如 A、AB、BC", section="sales", row=index, field="variety", raw_value=variety))
        head_count = str(row.get("head_count") or "").strip()
        if head_count and parse_spec_range(head_count) is None:
            issues.append(_issue("invalid_spec", "error", "规格（头数）无法解析", section="sales", row=index, field="head_count", raw_value=row.get("head_count")))
        spec_kg = str(row.get("spec_kg") or "").strip()
        if spec_kg and parse_spec_range(spec_kg) is None:
            issues.append(_issue("invalid_spec", "error", "规格（KG）无法解析", section="sales", row=index, field="spec_kg", raw_value=row.get("spec_kg")))
        try:
            quantity = _quantity(row.get("sales_quantity"))
        except Exception:
            quantity = Decimal("0")
        if quantity <= 0:
            issues.append(_issue("invalid_quantity", "error", "销售数量必须大于 0", section="sales", row=index, field="sales_quantity", raw_value=row.get("sales_quantity")))
        try:
            unit_price = _money(row.get("unit_price"))
        except Exception:
            unit_price = Decimal("0")
        if unit_price < 0:
            issues.append(_issue("invalid_price", "error", "单价不能为负数", section="sales", row=index, field="unit_price", raw_value=row.get("unit_price")))
        computed_amount = quantity * unit_price
        try:
            provided_amount = _money(row.get("amount"))
        except Exception:
            provided_amount = computed_amount
        if abs(provided_amount - computed_amount) > MONEY_QUANTUM:
            issues.append(_issue("amount_mismatch", "warning", f"金额 {provided_amount} 与数量×单价 {computed_amount} 不一致，入库时将按系统计算值修正", section="sales", row=index, field="amount", raw_value=row.get("amount")))

    for index, row in enumerate(payload.get("after_sales") or [], start=1):
        if not str(row.get("content") or "").strip():
            issues.append(_issue("missing_field", "error", "售后内容不能为空", section="after_sales", row=index, field="content"))
        try:
            _money(row.get("amount"))
        except Exception:
            issues.append(_issue("invalid_price", "error", "售后金额必须为数字", section="after_sales", row=index, field="amount", raw_value=row.get("amount")))

    for index, row in enumerate(payload.get("fees") or [], start=1):
        if not str(row.get("name") or "").strip():
            issues.append(_issue("missing_field", "error", "费用摘要不能为空", section="fees", row=index, field="name"))
        try:
            if _money(row.get("amount")) < 0:
                issues.append(_issue("invalid_price", "error", "费用金额不能为负数", section="fees", row=index, field="amount", raw_value=row.get("amount")))
        except Exception:
            issues.append(_issue("invalid_price", "error", "费用金额必须为数字", section="fees", row=index, field="amount", raw_value=row.get("amount")))

    computed = _computed_totals(payload)
    file_summary = payload.get("file_summary") or {}
    labels = {
        "sales_quantity": "总件数",
        "sales_amount": "销售金额",
        "after_sale_amount": "售后合计",
        "goods_amount": "货款合计",
        "fee_amount": "费用合计",
        "payable_amount": "应付贵方总金额",
    }
    for field, label in labels.items():
        raw = file_summary.get(field)
        if raw in (None, ""):
            continue
        try:
            declared = _money(raw)
        except Exception:
            continue
        if abs(declared - computed[field]) > MONEY_QUANTUM:
            issues.append(_issue("summary_mismatch", "warning", f"文件{label} {declared} 与系统计算 {computed[field]} 不一致，入库时将采用系统计算值", section="summary", field=field, raw_value=raw))

    computed_plain = {key: str(value.quantize(MONEY_QUANTUM)) for key, value in computed.items() if key != "sales_quantity"}
    computed_plain["sales_quantity"] = str(computed["sales_quantity"].quantize(QUANTITY_QUANTUM))
    return issues, computed_plain


def create_import_job(
    db: Session,
    parsed_files: list[tuple[SettlementTemplate, str, str, str]],
    user_id: int | None,
) -> dict[str, Any]:
    """为多个解析结果创建一条任务和若干草稿；不写正式表。"""

    job = ImportJob(
        token=uuid4().hex,
        status="pending",
        file_count=len(parsed_files),
        draft_count=len(parsed_files),
        created_by=user_id,
    )
    db.add(job)
    db.flush()

    drafts: list[dict[str, Any]] = []
    for parsed, file_name, file_hash, storage_path in parsed_files:
        payload = parsed_draft_payload(parsed)
        payload["market"] = match_market(db, payload.get("market"))
        issues, computed = validate_draft_payload(payload)
        payload["computed_summary"] = computed
        payload["issues"] = issues
        draft = ImportDraft(
            import_job_id=job.id,
            token=uuid4().hex,
            version=1,
            file_name=file_name,
            file_hash=file_hash,
            storage_path=storage_path,
            status="pending",
            payload=_json(payload),
            original_payload=_json(parsed_draft_payload(parsed)),
            issue_count=len(issues),
            parse_profile="settlement-template",
            parse_model=None,
            created_by=user_id,
        )
        db.add(draft)
        db.flush()
        drafts.append(
            {
                "token": draft.token,
                "file_name": draft.file_name,
                "merchant_no": payload["merchant_no"],
                "order_no": payload["order_no"],
                "issue_count": len(issues),
                "has_error": any(item["severity"] == "error" for item in issues),
                "version": draft.version,
            }
        )
    return _job_dict(job, drafts)


def get_import_job(db: Session, job_token: str) -> dict[str, Any] | None:
    job = db.query(ImportJob).filter(ImportJob.token == job_token).first()
    if job is None:
        return None
    drafts = (
        db.query(ImportDraft)
        .filter(ImportDraft.import_job_id == job.id)
        .order_by(ImportDraft.id)
        .all()
    )
    return _job_dict(
        job,
        [
            _draft_summary(draft)
            for draft in drafts
        ],
    )


def get_import_draft(db: Session, job_token: str, draft_token: str) -> dict[str, Any] | None:
    job = db.query(ImportJob).filter(ImportJob.token == job_token).first()
    if job is None:
        return None
    draft = (
        db.query(ImportDraft)
        .filter(ImportDraft.import_job_id == job.id, ImportDraft.token == draft_token)
        .first()
    )
    if draft is None:
        return None
    payload = _parse_json(draft.payload, {})
    original_payload = _parse_json(draft.original_payload, payload)
    issues, computed = validate_draft_payload(payload)
    payload["issues"] = issues
    payload["computed_summary"] = computed
    return {
        "job_token": job.token,
        "job_status": job.status,
        "draft_token": draft.token,
        "version": draft.version,
        "file_name": draft.file_name,
        "payload": payload,
        "original_payload": original_payload,
    }


def resolve_import_issue(db: Session, issue_id: int, user_id: int | None) -> dict[str, Any]:
    """把导入问题标记为人工已确认处理。"""

    issue = db.get(DataIssue, issue_id)
    if issue is None:
        raise ValueError("导入问题不存在")
    was_resolved = issue.resolved
    issue.resolved = True
    issue.resolved_by = user_id
    issue.resolved_at = datetime.now(issue.created_at.tzinfo)
    warning_count = None
    if not was_resolved and issue.severity == "warning":
        batch = db.get(ImportBatch, issue.import_batch_id)
        if batch is not None and batch.warning_count > 0:
            batch.warning_count -= 1
            warning_count = batch.warning_count
    db.commit()
    return {
        "id": issue.id,
        "resolved": issue.resolved,
        "warning_count": warning_count,
    }


def _revision_rows(
    old: dict[str, Any],
    new: dict[str, Any],
    section: str,
    source_row: int | None,
    *,
    old_prefix: str,
    new_prefix: str,
) -> list[SettlementRevision]:
    rows: list[SettlementRevision] = []
    fields = set(old) | set(new)
    for field in sorted(fields):
        old_value = old.get(field)
        new_value = new.get(field)
        if old_value == new_value:
            continue
        rows.append(
            SettlementRevision(
                section=section,
                source_row=source_row,
                field_name=f"{old_prefix}.{field}" if old_prefix else field,
                old_value=_json(old_value),
                new_value=_json(new_value),
                change_type="manual",
            )
        )
    return rows


def update_import_draft(
    db: Session,
    job_token: str,
    draft_token: str,
    payload: dict[str, Any],
    user_id: int | None,
) -> dict[str, Any]:
    job = db.query(ImportJob).filter(ImportJob.token == job_token).first()
    if job is None:
        raise ValueError("导入任务不存在")
    draft = (
        db.query(ImportDraft)
        .filter(ImportDraft.import_job_id == job.id, ImportDraft.token == draft_token)
        .first()
    )
    if draft is None:
        raise ValueError("导入草稿不存在")
    if draft.status != "pending":
        raise ValueError("该草稿已确认或已放弃，不能修改")

    old_payload = _parse_json(draft.payload, {})
    if not payload.get("file_summary"):
        payload["file_summary"] = old_payload.get("file_summary") or {}
    issues, computed = validate_draft_payload(payload)
    payload["computed_summary"] = computed
    payload["issues"] = issues
    draft.version += 1
    draft.payload = _json(payload)
    draft.issue_count = len(issues)
    draft.updated_by = user_id
    draft.updated_at = datetime.now(draft.created_at.tzinfo)
    draft.import_batch_id = None

    basic_fields = (
        "merchant_no",
        "order_no",
        "container_no",
        "vehicle_no",
        "market",
        "arrival_date",
        "arrival_quantity",
    )
    old_basic = {field: old_payload.get(field) for field in basic_fields}
    new_basic = {field: payload.get(field) for field in basic_fields}
    for revision in _revision_rows(
        old_basic, new_basic, "basic", None, old_prefix="old", new_prefix="new"
    ):
        revision.import_draft_id = draft.id
        revision.version = draft.version
        revision.changed_by = user_id
        revision.reason = "二次确认页人工修改"
        db.add(revision)

    for section in ("sales", "after_sales", "fees"):
        old_rows = old_payload.get(section) or []
        new_rows = payload.get(section) or []
        for index in range(max(len(old_rows), len(new_rows))):
            old_row = old_rows[index] if index < len(old_rows) else {}
            new_row = new_rows[index] if index < len(new_rows) else {}
            source_row = new_row.get("source_row") or old_row.get("source_row")
            for revision in _revision_rows(
                old_row, new_row, section, source_row, old_prefix="old", new_prefix="new"
            ):
                revision.import_draft_id = draft.id
                revision.version = draft.version
                revision.changed_by = user_id
                revision.reason = "二次确认页人工修改"
                db.add(revision)
    db.commit()
    return get_import_draft(db, job_token, draft_token)


def _write_batch(
    db: Session,
    draft: ImportDraft,
    payload: dict[str, Any],
    issues: list[dict[str, Any]],
    user_id: int | None,
) -> ImportBatch:
    merchant_no = str(payload["merchant_no"]).strip()
    manual_edit_count = (
        db.query(SettlementRevision)
        .filter(SettlementRevision.import_draft_id == draft.id)
        .count()
    )
    batch = ImportBatch(
        import_job_id=draft.import_job_id,
        file_name=draft.file_name,
        merchant_no=merchant_no,
        merchant_no_normalized=normalize_merchant_no(merchant_no),
        order_no=str(payload.get("order_no") or "").strip() or None,
        order_no_normalized=normalize_order_no(str(payload.get("order_no") or "").strip()),
        container_no=str(payload.get("container_no") or "").strip() or None,
        vehicle_no=str(payload.get("vehicle_no") or "").strip() or None,
        source_type="import",
        market=match_market(db, payload.get("market")),
        arrival_date=date.fromisoformat(payload["arrival_date"]) if payload.get("arrival_date") else None,
        arrival_quantity=int(_quantity(payload.get("arrival_quantity"))),
        parse_mode="template",
        status="pending",
        confirmed_by=user_id,
        confirmed_at=datetime.now(draft.created_at.tzinfo),
        manual_edit_count=manual_edit_count,
    )
    db.add(batch)
    db.flush()

    source = SourceFile(
        import_batch_id=batch.id,
        file_name=draft.file_name or merchant_no,
        file_hash=draft.file_hash or uuid4().hex,
        storage_path=draft.storage_path,
        row_count=len(payload.get("sales") or []),
    )
    db.add(source)
    db.flush()

    sales_amount = Decimal("0")
    for sort_order, row in enumerate(payload.get("sales") or []):
        quantity = _quantity(row.get("sales_quantity"))
        unit_price = _money(row.get("unit_price"))
        amount = quantity * unit_price
        sales_amount += amount
        head = parse_spec_range(row.get("head_count"))
        spec_kg = parse_spec_range(row.get("spec_kg"))
        variety = str(row.get("variety") or "").strip()
        record = SaleRecord(
            import_batch_id=batch.id,
            source_file_id=source.id,
            sale_date=date.fromisoformat(row["sale_date"]),
            fruit_type="榴莲",
            grade_raw=variety,
            grade=convert_grade(db, variety),
            spec_raw=str(row.get("spec_kg") or "").strip(),
            piece_count=head.canonical if head else None,
            piece_count_min=head.minimum if head else None,
            piece_count_max=head.maximum if head else None,
            spec_kg=spec_kg.canonical if spec_kg else None,
            spec_kg_min=spec_kg.minimum if spec_kg else None,
            spec_kg_max=spec_kg.maximum if spec_kg else None,
            quantity=quantity,
            unit_price=unit_price,
            amount=amount,
            remark=row.get("remark") or None,
            source_row=row.get("source_row"),
            raw_row_text=row.get("raw_row_text"),
        )
        db.add(record)

    after_amount = Decimal("0")
    for sort_order, row in enumerate(payload.get("after_sales") or []):
        amount = abs(_money(row.get("amount")))
        after_amount += amount
        db.add(
            SettlementAfterSaleItem(
                import_batch_id=batch.id,
                content=str(row.get("content") or "").strip() or "未填写内容",
                summary=str(row.get("summary") or "").strip(),
                amount=amount,
                source_row=row.get("source_row"),
                raw_row_text=row.get("raw_row_text"),
                sort_order=sort_order,
            )
        )

    fee_amount = Decimal("0")
    for sort_order, row in enumerate(payload.get("fees") or []):
        amount = _money(row.get("amount"))
        fee_amount += amount
        db.add(
            SettlementFeeItem(
                import_batch_id=batch.id,
                name=str(row.get("name") or "").strip() or "未填写摘要",
                amount=amount,
                source_row=row.get("source_row"),
                raw_row_text=row.get("raw_row_text"),
                sort_order=sort_order,
            )
        )

    goods_amount = sales_amount - after_amount
    payable_amount = goods_amount - fee_amount
    file_summary = payload.get("file_summary") or {}

    def _file_money(field: str) -> Decimal | None:
        value = file_summary.get(field)
        return _money(value) if value not in (None, "") else None

    def _file_quantity(field: str) -> Decimal | None:
        value = file_summary.get(field)
        return _quantity(value) if value not in (None, "") else None

    file_after_sale_amount = _file_money("after_sale_amount")

    summary = SettlementSummary(
        import_batch_id=batch.id,
        sales_amount=sales_amount,
        after_sale_amount=after_amount,
        goods_amount=goods_amount,
        fee_amount=fee_amount,
        payable_amount=payable_amount,
        sales_quantity=sum((_quantity(row.get("sales_quantity")) for row in payload.get("sales") or []), Decimal("0")),
        computed_sales_amount=sales_amount,
        computed_quantity=sum((_quantity(row.get("sales_quantity")) for row in payload.get("sales") or []), Decimal("0")),
        file_sales_quantity=_file_quantity("sales_quantity"),
        file_sales_amount=_file_money("sales_amount"),
        file_after_sale_amount=(
            abs(file_after_sale_amount)
            if file_after_sale_amount is not None
            else None
        ),
        file_goods_amount=_file_money("goods_amount"),
        file_fee_amount=_file_money("fee_amount"),
        file_fee_detail=file_summary.get("fee_detail"),
        file_payable_amount=_file_money("payable_amount"),
        reconcile_status="ok" if not any(item.get("field") in {"sales_amount", "sales_quantity", "after_sale_amount", "goods_amount", "fee_amount", "payable_amount"} for item in issues if item.get("severity") == "warning") else "mismatch",
        reconcile_detail="；".join(item["message"] for item in issues if item.get("section") == "summary") or None,
    )
    db.add(summary)

    for issue in issues:
        db.add(
            DataIssue(
                import_batch_id=batch.id,
                source_file_id=source.id,
                row_number=issue.get("row"),
                issue_type=issue["code"],
                severity=issue["severity"],
                field_name=issue.get("field"),
                message=issue["message"],
                raw_value=str(issue.get("raw_value") or ""),
                origin="reconcile" if issue.get("section") == "summary" else "rule",
                resolved=False,
            )
        )

    batch.success_count = len(payload.get("sales") or [])
    batch.warning_count = sum(1 for item in issues if item["severity"] == "warning")
    batch.failure_count = sum(1 for item in issues if item["severity"] == "error")
    batch.status = "success" if batch.failure_count == 0 else "partial"
    batch.error_summary = "；".join(item["message"] for item in issues[:5]) or None
    db.flush()
    return batch


def confirm_import_job(
    db: Session,
    job_token: str,
    *,
    force: bool = False,
    user_id: int | None = None,
) -> dict[str, Any]:
    job = db.query(ImportJob).filter(ImportJob.token == job_token).first()
    if job is None:
        raise ValueError("导入任务不存在")
    drafts = (
        db.query(ImportDraft)
        .filter(ImportDraft.import_job_id == job.id, ImportDraft.status == "pending")
        .order_by(ImportDraft.id)
        .all()
    )
    if not drafts:
        raise ValueError("该任务没有待确认草稿")

    blockers: list[dict[str, Any]] = []
    conflicts: list[dict[str, Any]] = []
    hard_conflicts: list[dict[str, Any]] = []
    draft_payloads: list[tuple[ImportDraft, dict[str, Any], list[dict[str, Any]]]] = []
    latest_by_merchant: dict[str, ImportDraft] = {}
    latest_by_normalized: dict[str, str] = {}
    for draft in drafts:
        payload = _parse_json(draft.payload, {})
        issues, computed = validate_draft_payload(payload)
        payload["computed_summary"] = computed
        draft.payload = _json(payload)
        draft_payloads.append((draft, payload, issues))
        merchant_no = payload.get("merchant_no")
        if merchant_no in latest_by_merchant:
            conflicts.append(
                {
                    "draft_token": draft.token,
                    "file_name": draft.file_name,
                    "merchant_no": merchant_no,
                    "reason": "同一导入任务内商号重复",
                }
            )
        else:
            latest_by_merchant[merchant_no] = draft
        if any(item["severity"] == "error" for item in issues):
            blockers.append({"draft_token": draft.token, "file_name": draft.file_name, "issues": issues})

        normalized = normalize_merchant_no(merchant_no)
        if normalized and normalized in latest_by_normalized and latest_by_normalized[normalized] != merchant_no:
            hard_conflicts.append(
                {
                    "draft_token": draft.token,
                    "file_name": draft.file_name,
                    "merchant_no": merchant_no,
                    "reason": f"商号 {merchant_no} 与 {latest_by_normalized[normalized]} 归一化后均为 {normalized}",
                }
            )
        else:
            latest_by_normalized[normalized or merchant_no] = merchant_no

        normalized_collision = (
            db.query(ImportBatch)
            .filter(
                ImportBatch.merchant_no != merchant_no,
                ImportBatch.merchant_no_normalized == normalized,
            )
            .first()
            if normalized
            else None
        )
        if normalized_collision is not None:
            hard_conflicts.append(
                {
                    "draft_token": draft.token,
                    "file_name": draft.file_name,
                    "merchant_no": merchant_no,
                    "reason": f"商号 {merchant_no} 归一化后与已有商号 {normalized_collision.merchant_no} 相同",
                }
            )

        existing = db.query(ImportBatch).filter(ImportBatch.merchant_no == merchant_no).first()
        if existing is not None:
            conflict = {
                "draft_token": draft.token,
                "file_name": draft.file_name,
                "merchant_no": merchant_no,
            }
            if existing.source_type != "import":
                hard_conflicts.append(
                    {
                        **conflict,
                        "reason": f"商号 {merchant_no} 已由手工录单占用，导入不能覆盖",
                    }
                )
            else:
                conflicts.append({**conflict, "reason": "该商号已存在，确认后覆盖"})

    if hard_conflicts:
        raise ImportConfirmBlocked(
            json.dumps(
                {"blockers": blockers, "conflicts": [*hard_conflicts, *conflicts]},
                ensure_ascii=False,
            )
        )

    if blockers and not force:
        raise ImportConfirmBlocked(json.dumps({"blockers": blockers, "conflicts": conflicts}, ensure_ascii=False))
    if conflicts and not force:
        raise ImportConfirmBlocked(json.dumps({"blockers": blockers, "conflicts": conflicts}, ensure_ascii=False))

    confirmed = []
    drafts_to_write = []
    if force:
        for draft, payload, issues in draft_payloads:
            merchant_no = payload.get("merchant_no")
            if latest_by_merchant.get(merchant_no) is draft:
                drafts_to_write.append((draft, payload, issues))
            else:
                draft.status = "discarded"
    else:
        drafts_to_write = draft_payloads

    overwritten_by_draft: dict[str, dict[str, Any]] = {}
    for draft, payload, issues in drafts_to_write:
        if force:
            existing = db.query(ImportBatch).filter(ImportBatch.merchant_no == payload.get("merchant_no")).first()
            if existing is not None:
                if existing.source_type != "import":
                    raise ImportConfirmBlocked(
                        json.dumps(
                            {
                                "blockers": blockers,
                                "conflicts": [
                                    {
                                        "draft_token": draft.token,
                                        "file_name": draft.file_name,
                                        "merchant_no": payload.get("merchant_no"),
                                        "reason": "商号已由手工录单占用，导入不能覆盖",
                                    }
                                ],
                            },
                            ensure_ascii=False,
                        )
                    )
                overwritten_by_draft[draft.token] = {
                    "merchant_no": existing.merchant_no,
                    "order_no": existing.order_no,
                    "container_no": existing.container_no,
                    "vehicle_no": existing.vehicle_no,
                    "source_type": existing.source_type,
                    "parse_mode": existing.parse_mode,
                    "file_name": existing.file_name,
                }
                db.delete(existing)
                db.flush()
        batch = _write_batch(db, draft, payload, issues, user_id)
        overwritten = overwritten_by_draft.get(draft.token)
        if overwritten is not None:
            db.add(
                SettlementRevision(
                    import_batch_id=batch.id,
                    version=1,
                    section="import",
                    field_name="full_batch",
                    old_value=json.dumps(overwritten, ensure_ascii=False, default=str),
                    new_value=json.dumps(
                        {
                            "merchant_no": batch.merchant_no,
                            "order_no": batch.order_no,
                            "container_no": batch.container_no,
                            "vehicle_no": batch.vehicle_no,
                            "source_type": batch.source_type,
                            "parse_mode": batch.parse_mode,
                            "file_name": batch.file_name,
                        },
                        ensure_ascii=False,
                        default=str,
                    ),
                    change_type="import",
                    reason="导入覆盖同商号结算单",
                    changed_by=user_id,
                )
            )
        draft.status = "confirmed"
        draft.confirmed_by = user_id
        draft.confirmed_at = datetime.now(draft.created_at.tzinfo)
        draft.import_batch_id = batch.id
        confirmed.append(
            {
                "draft_token": draft.token,
                "file_name": draft.file_name,
                "merchant_no": batch.merchant_no,
                "batch_id": batch.id,
                "status": batch.status,
                "error_count": batch.failure_count,
                "warning_count": batch.warning_count,
            }
        )

    job.status = "confirmed"
    job.confirmed_count = len(confirmed)
    job.confirmed_by = user_id
    job.confirmed_at = datetime.now(job.created_at.tzinfo)
    db.commit()
    return {"job_token": job.token, "status": job.status, "confirmed": confirmed}


def discard_import_job(db: Session, job_token: str) -> dict[str, Any]:
    job = db.query(ImportJob).filter(ImportJob.token == job_token).first()
    if job is None:
        raise ValueError("导入任务不存在")
    drafts = (
        db.query(ImportDraft)
        .filter(ImportDraft.import_job_id == job.id, ImportDraft.status == "pending")
        .all()
    )
    for draft in drafts:
        draft.status = "discarded"
    job.status = "discarded"
    db.commit()
    return {"job_token": job.token, "status": job.status}


def _job_dict(job: ImportJob, drafts: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "token": job.token,
        "status": job.status,
        "file_count": job.file_count,
        "draft_count": job.draft_count,
        "confirmed_count": job.confirmed_count,
        "created_at": job.created_at.isoformat(),
        "drafts": drafts,
    }


def _draft_summary(draft: ImportDraft) -> dict[str, Any]:
    payload = _parse_json(draft.payload, {}) or {}
    issues = payload.get("issues") or []
    return {
        "token": draft.token,
        "file_name": draft.file_name,
        "merchant_no": payload.get("merchant_no", ""),
        "order_no": payload.get("order_no", ""),
        "issue_count": len(issues) or draft.issue_count,
        "has_error": any(item.get("severity") == "error" for item in issues),
        "version": draft.version,
        "status": draft.status,
    }


__all__ = [
    "ImportConfirmBlocked",
    "confirm_import_job",
    "create_import_job",
    "discard_import_job",
    "get_import_draft",
    "get_import_job",
    "parsed_draft_payload",
    "update_import_draft",
    "validate_draft_payload",
]
