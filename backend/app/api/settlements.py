"""数据明细：结算单列表与单张结算单的全部明细。"""

from __future__ import annotations

from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..auth import require_current_user
from ..db import get_db
from ..models import ImportBatch
from ..schemas import SettlementListResponse, SettlementRecordsResponse
from ..services.settlement_detail_service import (
    RECORD_PAGE_SIZE_MAX,
    get_settlement_records,
    get_settlement_review,
)
from ..services.settlement_delete_service import delete_settlement
from ..services.settlement_list_service import PAGE_SIZE_MAX, list_settlements
from ..services.order_no_naming import order_no_display
from ..services.merchant_no_naming import merchant_no_display


router = APIRouter(
    prefix="/api/settlements",
    tags=["settlements"],
    dependencies=[Depends(require_current_user)],
)


@router.get("", response_model=SettlementListResponse)
def settlements(
    start_date: date | None = None,
    end_date: date | None = None,
    merchant_no: str | None = None,
    brand: str | None = None,
    keyword: str | None = None,
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=PAGE_SIZE_MAX),
    sort_by: Literal[
        "arrival_date",
        "total_quantity",
        "grade_a",
        "grade_b",
        "sales_amount",
        "average_price",
        "confirmed_at",
    ] | None = None,
    sort_order: Literal["asc", "desc"] = "desc",
    db: Session = Depends(get_db),
):
    """结算单列表；``keyword`` 模糊匹配商号 / 单号 / 柜号 / 车牌，分页参数可选。"""

    if start_date and end_date and start_date > end_date:
        raise HTTPException(422, "start_date 不能晚于 end_date")
    return list_settlements(
        db,
        start_date=start_date,
        end_date=end_date,
        merchant_no=merchant_no,
        brand=brand,
        keyword=keyword,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_order=sort_order,
    )


@router.get("/{merchant_no}/records", response_model=SettlementRecordsResponse)
def settlement_records(
    merchant_no: str,
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=RECORD_PAGE_SIZE_MAX),
    db: Session = Depends(get_db),
):
    batch = db.query(ImportBatch).filter_by(merchant_no=merchant_no).first()
    if batch is None:
        raise HTTPException(404, "结算单不存在")
    records = get_settlement_records(
        db, batch.id, page=page, page_size=page_size
    )
    return {
        "merchant_no": batch.merchant_no,
        "merchant_no_normalized": merchant_no_display(
            batch.merchant_no, batch.merchant_no_normalized
        ),
        "order_no": batch.order_no,
        "order_no_normalized": order_no_display(
            batch.order_no, batch.order_no_normalized
        ),
        "container_no": batch.container_no,
        "vehicle_no": batch.vehicle_no,
        **records,
    }


@router.get("/{merchant_no}/review")
def settlement_review(
    merchant_no: str,
    db: Session = Depends(get_db),
):
    """按商号读取结算单复核视图；仅供只读查看，不产生修改。"""

    result = get_settlement_review(db, merchant_no)
    if result is None:
        raise HTTPException(404, "结算单不存在")
    return result


@router.delete("/{merchant_no}")
def delete_settlement_by_merchant(
    merchant_no: str,
    db: Session = Depends(get_db),
):
    """删除录错的结算单，连带移除销售明细、售后、费用、汇总与留痕。"""

    result = delete_settlement(db, merchant_no)
    if result is None:
        raise HTTPException(404, "结算单不存在")
    return result


__all__ = ["router"]
