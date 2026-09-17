"""手工录单、读取、修改、导出与字段选项接口。"""

from __future__ import annotations

from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..auth import require_permission
from ..db import get_db
from ..models import User
from ..schemas import EntryCreate, EntryRead
from ..services.entry_export import build_entry_workbook
from ..services.entry_service import (
    ensure_manual_entry,
    list_field_options,
    read_entry,
    save_entry,
)


router = APIRouter(prefix="/api/entry", tags=["entry"])
XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _content_disposition(merchant_no: str) -> dict[str, str]:
    return {
        "Content-Disposition": f'attachment; filename="entry-{merchant_no}.xlsx"'
    }


@router.get("/field-options")
def field_options(
    field: str = Query(default="market", pattern="^(market|variety|brand)$"),
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("entry:view")),
):
    return {"options": list_field_options(db, field)}


@router.post("", response_model=EntryRead, status_code=201)
def create_entry(
    payload: EntryCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("entry:create")),
):
    try:
        result = save_entry(db, payload, user.id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if result.status == "conflict":
        message = f"商号 {result.merchant_no} 已存在"
        if result.existing_order_no:
            message += f"，当前结算单：{result.existing_order_no}"
        raise HTTPException(status_code=409, detail=message)
    entry = read_entry(db, result.merchant_no)
    if entry is None:
        raise HTTPException(status_code=500, detail="手工单保存后读取失败")
    return entry


@router.get("/{merchant_no}", response_model=EntryRead)
def get_entry(
    merchant_no: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("entry:view")),
):
    entry = read_entry(db, merchant_no)
    if entry is None:
        raise HTTPException(status_code=404, detail="手工单不存在")
    return entry


@router.put("/{merchant_no}", response_model=EntryRead)
def update_entry(
    merchant_no: str,
    payload: EntryCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("entry:update")),
):
    try:
        ensure_manual_entry(db, merchant_no)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if payload.merchant_no != merchant_no:
        raise HTTPException(status_code=422, detail="merchant_no 不能修改")
    payload.overwrite = True
    try:
        result = save_entry(db, payload, user.id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if result.status == "conflict":
        raise HTTPException(status_code=409, detail="修改冲突，请重试")
    entry = read_entry(db, merchant_no)
    if entry is None:
        raise HTTPException(status_code=500, detail="手工单修改后读取失败")
    return entry


@router.get("/{merchant_no}/export.xlsx")
def export_entry(
    merchant_no: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("entry:export")),
):
    try:
        content = build_entry_workbook(db, merchant_no)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return StreamingResponse(
        BytesIO(content),
        media_type=XLSX_MEDIA_TYPE,
        headers=_content_disposition(merchant_no),
    )


__all__ = ["router"]
