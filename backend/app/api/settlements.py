"""数据明细：结算单列表与单张结算单的全部明细。"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..auth import require_current_user
from ..db import get_db
from ..models import ImportBatch
from ..schemas import SettlementListResponse, SettlementRecordsResponse
from ..services.settlement_detail_service import get_settlement_records
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
    keyword: str | None = None,
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=PAGE_SIZE_MAX),
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
        keyword=keyword,
        page=page,
        page_size=page_size,
    )


@router.get("/{merchant_no}/records", response_model=SettlementRecordsResponse)
def settlement_records(merchant_no: str, db: Session = Depends(get_db)):
    batch = db.query(ImportBatch).filter_by(merchant_no=merchant_no).first()
    if batch is None:
        raise HTTPException(404, "结算单不存在")
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
        "records": get_settlement_records(db, batch.id),
    }


__all__ = ["router"]
