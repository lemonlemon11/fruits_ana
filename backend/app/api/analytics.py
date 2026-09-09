"""等级销售分析 HTTP 接口。"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..services.analytics_service import (
    get_container_comparison,
    get_container_detail,
    get_daily_trend,
    get_overview,
    get_issue_counts,
    get_operating_anomalies,
)


router = APIRouter(prefix="/api/analytics", tags=["analytics"])


def _filters(
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    container_id: str | None = None,
) -> dict:
    if start_date and end_date and start_date > end_date:
        raise HTTPException(422, "start_date 不能晚于 end_date")
    return {
        "start_date": start_date,
        "end_date": end_date,
        "container_id": container_id,
    }


@router.get("/overview")
def overview(filters: dict = Depends(_filters), db: Session = Depends(get_db)):
    return get_overview(db, **filters)


@router.get("/trend")
def trend(filters: dict = Depends(_filters), db: Session = Depends(get_db)):
    return {"trend": get_daily_trend(db, **filters)}


@router.get("/container-comparison")
def container_comparison(
    filters: dict = Depends(_filters),
    include_all_containers: bool = False,
    db: Session = Depends(get_db),
):
    return {
        "containers": get_container_comparison(
            db, **filters, include_all_containers=include_all_containers
        )
    }


@router.get("/containers/{container_id}")
def container_detail(
    container_id: str,
    filters: dict = Depends(_filters),
    db: Session = Depends(get_db),
):
    detail = get_container_detail(
        db,
        container_id,
        start_date=filters["start_date"],
        end_date=filters["end_date"],
    )
    if detail is None:
        raise HTTPException(404, "货柜不存在")
    return detail


__all__ = ["router"]
