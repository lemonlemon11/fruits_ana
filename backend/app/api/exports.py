"""管理者报表导出和销售明细来源追溯。"""

from __future__ import annotations

import csv
from datetime import date, datetime, timezone
from io import BytesIO, StringIO
from urllib.parse import quote

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..auth import require_current_user
from ..db import get_db
from ..models import ImportBatch, SaleRecord, SourceFile
from ..services.analytics_service import get_grade_summary
from ..services.order_no_naming import order_no_display
from ..services.merchant_no_naming import merchant_no_display
from ..services.entry_export import build_settlement_template_workbook, render_entry_pdf, load_entry
from ..services.field_conversion import grade_mapping_note
from ..services.settlement_list_export import (
    build_settlements_workbook,
    settlements_export_filename,
)


router = APIRouter(
    prefix="/api/exports",
    tags=["exports"],
    dependencies=[Depends(require_current_user)],
)
XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _attachment(filename: str) -> dict[str, str]:
    """按 RFC 5987 编码文件名，避免中文商号导致响应头损坏。"""

    return {
        "Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename, safe='')}"
    }


@router.get("/overview.csv")
def export_overview_csv(
    start_date: date | None = None,
    end_date: date | None = None,
    merchant_no: str | None = None,
    db: Session = Depends(get_db),
):
    summary = get_grade_summary(
        db,
        start_date=start_date,
        end_date=end_date,
        merchant_no=merchant_no,
    )
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(["filter_start_date", start_date.isoformat() if start_date else "all"])
    writer.writerow(["filter_end_date", end_date.isoformat() if end_date else "all"])
    writer.writerow(["filter_merchant_no", _spreadsheet_safe(merchant_no or "all")])
    writer.writerow(["generated_at_utc", datetime.now(timezone.utc).isoformat()])
    writer.writerow(["grade_mapping", grade_mapping_note(db)])
    writer.writerow(
        ["grade", "sales_quantity", "sales_amount", "weighted_avg_price", "quantity_share"]
    )
    for grade in summary["grades"]:
        writer.writerow([grade[name] for name in ("grade", "sales_quantity", "sales_amount", "weighted_avg_price", "quantity_share")])
    payload = BytesIO(output.getvalue().encode("utf-8-sig"))
    headers = {"Content-Disposition": 'attachment; filename="grade-overview.csv"'}
    return StreamingResponse(payload, media_type="text/csv", headers=headers)


@router.get("/settlements.xlsx")
def export_settlement_list_xlsx(
    start_date: date | None = None,
    end_date: date | None = None,
    merchant_no: str | None = None,
    db: Session = Depends(get_db),
):
    """导出「数据明细」里的结算单列表，口径与列表页当前筛选范围一致。"""

    if start_date and end_date and start_date > end_date:
        raise HTTPException(422, "start_date 不能晚于 end_date")
    payload = build_settlements_workbook(
        db, start_date=start_date, end_date=end_date, merchant_no=merchant_no
    )
    filename = settlements_export_filename(start_date, end_date, merchant_no)
    return StreamingResponse(
        BytesIO(payload), media_type=XLSX_MEDIA_TYPE, headers=_attachment(filename)
    )


@router.get("/settlements/{merchant_no}.xlsx")
def export_settlement_xlsx(
    merchant_no: str,
    start_date: date | None = None,
    end_date: date | None = None,
    db: Session = Depends(get_db),
):
    batch = db.query(ImportBatch).filter_by(merchant_no=merchant_no).first()
    records = _records(db, merchant_no, start_date, end_date)
    if not records:
        raise HTTPException(404, "筛选范围内没有该结算单销售数据")
    payload = _settlement_workbook(db, batch, records, start_date, end_date)
    display = order_no_display(
        getattr(batch, "order_no", None),
        getattr(batch, "order_no_normalized", None),
    )
    merchant = merchant_no_display(
        getattr(batch, "merchant_no", None) or merchant_no,
        getattr(batch, "merchant_no_normalized", None),
    )
    parts = "-".join(part for part in (merchant, display) if part)
    headers = _attachment(f"settlement-{parts or merchant_no}.xlsx")
    return StreamingResponse(BytesIO(payload), media_type=XLSX_MEDIA_TYPE, headers=headers)


@router.get("/settlements/{merchant_no}/template.xlsx")
def export_settlement_template_xlsx(merchant_no: str, db: Session = Depends(get_db)):
    """按结算单模板导出单张结算单，列表里任意一行都能导出同一版式。"""

    try:
        payload = build_settlement_template_workbook(db, merchant_no)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
    batch = db.query(ImportBatch).filter_by(merchant_no=merchant_no).first()
    display = order_no_display(
        getattr(batch, "order_no", None), getattr(batch, "order_no_normalized", None)
    )
    merchant = merchant_no_display(
        getattr(batch, "merchant_no", None) or merchant_no,
        getattr(batch, "merchant_no_normalized", None),
    )
    parts = "-".join(part for part in (merchant, display) if part)
    return StreamingResponse(
        BytesIO(payload),
        media_type=XLSX_MEDIA_TYPE,
        headers=_attachment(f"{parts or merchant_no}-结算单.xlsx"),
    )


@router.get("/records/{record_id}/source")
def trace_record_source(record_id: int, db: Session = Depends(get_db)):
    record = db.get(SaleRecord, record_id)
    if not record:
        raise HTTPException(404, "销售明细不存在")
    source = db.get(SourceFile, record.source_file_id) if record.source_file_id else None
    return {
        "record": _record_dict(record),
        "source_file": _source_dict(source),
        "import_batch_id": record.import_batch_id,
    }


def _records(db, merchant_no, start_date, end_date):
    query = (
        db.query(SaleRecord)
        .join(ImportBatch, SaleRecord.import_batch_id == ImportBatch.id)
        .filter(ImportBatch.merchant_no == merchant_no)
    )
    if start_date:
        query = query.filter(SaleRecord.sale_date >= start_date)
    if end_date:
        query = query.filter(SaleRecord.sale_date <= end_date)
    return query.order_by(SaleRecord.sale_date, SaleRecord.id).all()


def _settlement_workbook(db, batch, records, start_date, end_date):
    detail = pd.DataFrame([_record_dict(record) for record in records])
    detail = detail.map(_spreadsheet_safe)
    summary = _group_metrics(detail, "grade")
    trend = _group_metrics(detail, "sale_date")
    settlement = batch if batch is not None else None
    metadata = pd.DataFrame(
        [
            [
                "商号（适配后）",
                _spreadsheet_safe(
                    merchant_no_display(
                        getattr(settlement, "merchant_no", None),
                        getattr(settlement, "merchant_no_normalized", None),
                    )
                    or "全部"
                ),
            ],
            [
                "原始商号",
                _spreadsheet_safe(getattr(settlement, "merchant_no", None) or "—"),
            ],
            [
                "单号（适配后）",
                _spreadsheet_safe(
                    order_no_display(
                        getattr(settlement, "order_no", None),
                        getattr(settlement, "order_no_normalized", None),
                    )
                    or "—"
                ),
            ],
            [
                "原始单号",
                _spreadsheet_safe(getattr(settlement, "order_no", None) or "—"),
            ],
            ["柜号", _spreadsheet_safe(getattr(settlement, "container_no", None) or "—")],
            ["转运车号", _spreadsheet_safe(getattr(settlement, "vehicle_no", None) or "—")],
            ["开始日期", start_date.isoformat() if start_date else "全部"],
            ["结束日期", end_date.isoformat() if end_date else "全部"],
            ["生成时间(UTC)", datetime.now(timezone.utc).isoformat()],
            ["等级映射", f"{grade_mapping_note(db)}；明细等级原文保留在 grade_raw"],
        ],
        columns=["项目", "内容"],
    )
    output = BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        metadata.to_excel(writer, sheet_name="说明", index=False)
        summary.to_excel(writer, sheet_name="等级汇总", index=False)
        trend.to_excel(writer, sheet_name="每日趋势", index=False)
        detail.to_excel(writer, sheet_name="销售明细", index=False)
    return output.getvalue()


def _group_metrics(frame, key):
    grouped = frame.groupby(key, as_index=False).agg(
        sales_quantity=("quantity", "sum"), sales_amount=("amount", "sum")
    )
    grouped["weighted_avg_price"] = (
        grouped["sales_amount"] / grouped["sales_quantity"]
    )
    return grouped


def _record_dict(record):
    return {
        "id": record.id,
        "source_file_id": record.source_file_id,
        "sale_date": record.sale_date.isoformat(),
        "grade": record.grade.value,
        "grade_raw": record.grade_raw,
        "spec_raw": record.spec_raw,
        "quantity": float(record.quantity),
        "unit_price": float(record.unit_price),
        "amount": float(record.amount),
    }


def _source_dict(source):
    if not source:
        return None
    return {
        "id": source.id,
        "file_name": source.file_name,
        "file_hash": source.file_hash,
        "import_batch_id": source.import_batch_id,
        "stored_at": source.stored_at,
    }


def _spreadsheet_safe(value):
    if isinstance(value, str) and value.startswith(("=", "+", "-", "@", "\t", "\r")):
        return f"'{value}"
    return value


@router.get("/settlements/{merchant_no}/template.pdf")
def export_settlement_template_pdf(merchant_no: str, db: Session = Depends(get_db)):
    """按财务报表样式导出 PDF（WeasyPrint 渲染）。"""

    try:
        entry = load_entry(db, merchant_no)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
    payload = render_entry_pdf(entry)
    batch = db.query(ImportBatch).filter_by(merchant_no=merchant_no).first()
    display = order_no_display(
        getattr(batch, "order_no", None), getattr(batch, "order_no_normalized", None)
    )
    merchant = merchant_no_display(
        getattr(batch, "merchant_no", None) or merchant_no,
        getattr(batch, "merchant_no_normalized", None),
    )
    parts = "-".join(part for part in (merchant, display) if part)
    return StreamingResponse(
        BytesIO(payload),
        media_type="application/pdf",
        headers=_attachment(f"{parts or merchant_no}-结算单.pdf"),
    )
