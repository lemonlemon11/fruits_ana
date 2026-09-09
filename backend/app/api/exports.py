"""管理者报表导出和销售明细来源追溯。"""

from __future__ import annotations

import csv
from datetime import date, datetime, timezone
from io import BytesIO, StringIO

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import SaleRecord, SourceFile
from ..services.analytics_service import get_grade_summary


router = APIRouter(prefix="/api/exports", tags=["exports"])
XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@router.get("/overview.csv")
def export_overview_csv(
    start_date: date | None = None,
    end_date: date | None = None,
    container_id: str | None = None,
    db: Session = Depends(get_db),
):
    summary = get_grade_summary(
        db,
        start_date=start_date,
        end_date=end_date,
        container_id=container_id,
    )
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(["filter_start_date", start_date.isoformat() if start_date else "all"])
    writer.writerow(["filter_end_date", end_date.isoformat() if end_date else "all"])
    writer.writerow(["filter_container_id", _spreadsheet_safe(container_id or "all")])
    writer.writerow(["generated_at_utc", datetime.now(timezone.utc).isoformat()])
    writer.writerow(["grade_mapping", "BC -> C"])
    writer.writerow(
        ["grade", "sales_quantity", "sales_amount", "weighted_avg_price", "quantity_share"]
    )
    for grade in summary["grades"]:
        writer.writerow([grade[name] for name in ("grade", "sales_quantity", "sales_amount", "weighted_avg_price", "quantity_share")])
    payload = BytesIO(output.getvalue().encode("utf-8-sig"))
    headers = {"Content-Disposition": 'attachment; filename="grade-overview.csv"'}
    return StreamingResponse(payload, media_type="text/csv", headers=headers)


@router.get("/containers/{container_id}.xlsx")
def export_container_xlsx(
    container_id: str,
    start_date: date | None = None,
    end_date: date | None = None,
    db: Session = Depends(get_db),
):
    records = _records(db, container_id, start_date, end_date)
    if not records:
        raise HTTPException(404, "筛选范围内没有该货柜销售数据")
    payload = _container_workbook(container_id, records, start_date, end_date)
    headers = {
        "Content-Disposition": f'attachment; filename="container-{container_id}.xlsx"'
    }
    return StreamingResponse(BytesIO(payload), media_type=XLSX_MEDIA_TYPE, headers=headers)


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


def _records(db, container_id, start_date, end_date):
    query = db.query(SaleRecord).filter(SaleRecord.container_id == container_id)
    if start_date:
        query = query.filter(SaleRecord.sale_date >= start_date)
    if end_date:
        query = query.filter(SaleRecord.sale_date <= end_date)
    return query.order_by(SaleRecord.sale_date, SaleRecord.id).all()


def _container_workbook(container_id, records, start_date, end_date):
    detail = pd.DataFrame([_record_dict(record) for record in records])
    detail = detail.map(_spreadsheet_safe)
    summary = _group_metrics(detail, "grade")
    trend = _group_metrics(detail, "sale_date")
    metadata = pd.DataFrame(
        [
            ["货柜号", _spreadsheet_safe(container_id)],
            ["开始日期", start_date.isoformat() if start_date else "全部"],
            ["结束日期", end_date.isoformat() if end_date else "全部"],
            ["生成时间(UTC)", datetime.now(timezone.utc).isoformat()],
            ["等级映射", "BC 统一计入 C，原始等级保留在 grade_raw"],
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
        "container_id": record.container_id,
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
