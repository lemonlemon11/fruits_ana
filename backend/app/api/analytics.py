"""按商号的等级销售分析 HTTP 接口。"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import require_current_user
from ..db import get_db
from ..services.settlement_analytics_service import (
    get_daily_trend,
    get_overview,
    get_settlement_comparison,
    get_settlement_detail,
)


router = APIRouter(
    prefix="/api/analytics",
    tags=["analytics"],
    dependencies=[Depends(require_current_user)],
)


def _filters(
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    merchant_no: str | None = None,
) -> dict:
    if start_date and end_date and start_date > end_date:
        raise HTTPException(422, "start_date 不能晚于 end_date")
    return {
        "start_date": start_date,
        "end_date": end_date,
        "merchant_no": merchant_no,
    }


@router.get("/overview")
def overview(filters: dict = Depends(_filters), db: Session = Depends(get_db)):
    return get_overview(db, **filters)


@router.get("/trend")
def trend(filters: dict = Depends(_filters), db: Session = Depends(get_db)):
    return {"trend": get_daily_trend(db, **filters)}


@router.get("/settlement-comparison")
def settlement_comparison(
    filters: dict = Depends(_filters),
    include_all_settlements: bool = False,
    db: Session = Depends(get_db),
):
    return {
        "settlements": get_settlement_comparison(
            db, **filters, include_all_settlements=include_all_settlements
        )
    }


@router.get("/settlements/{merchant_no}")
def settlement_detail(
    merchant_no: str,
    filters: dict = Depends(_filters),
    db: Session = Depends(get_db),
):
    detail = get_settlement_detail(
        db,
        merchant_no,
        start_date=filters["start_date"],
        end_date=filters["end_date"],
    )
    if detail is None:
        raise HTTPException(404, "结算单不存在")
    return detail


__all__ = ["router"]
