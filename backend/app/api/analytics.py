"""按商号的等级销售分析 HTTP 接口。"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..auth import require_current_user
from ..db import get_db
from ..schemas import SeriesAnalysisRequest, SeriesAnalysisResponse
from ..services.ai_analysis_service import (
    AiCallFailed,
    AiNotConfigured,
    analyze_series_comparison,
)
from ..services.settlement_analytics_service import (
    get_daily_trend,
    get_overview,
    get_settlement_comparison,
    get_settlement_detail,
)
from ..services.series_analytics_service import get_series_comparison


# AI 分析一次最多覆盖的结算单数量，与前端勾选上限保持一致。
MAX_ANALYSIS_SETTLEMENTS = 6
MIN_ANALYSIS_SETTLEMENTS = 2


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


@router.get("/series-comparison")
def series_comparison(
    merchant_no: list[str] | None = Query(default=None),
    start_date: date | None = None,
    end_date: date | None = None,
    db: Session = Depends(get_db),
):
    """按勾选的结算单返回 A/B/C 独立对比、价差与系列汇总。"""

    if start_date and end_date and start_date > end_date:
        raise HTTPException(422, "start_date 不能晚于 end_date")
    return get_series_comparison(
        db,
        merchant_nos=merchant_no or [],
        start_date=start_date,
        end_date=end_date,
    )


@router.post("/series-comparison/analysis", response_model=SeriesAnalysisResponse)
def series_comparison_analysis(
    payload: SeriesAnalysisRequest, db: Session = Depends(get_db)
):
    """按勾选的结算单生成 AI 分析结论；相同条件会直接返回缓存。"""

    merchant_nos = list(
        dict.fromkeys(
            value.strip() for value in payload.merchant_no if value and value.strip()
        )
    )
    if len(merchant_nos) < MIN_ANALYSIS_SETTLEMENTS:
        raise HTTPException(422, "请至少选择两个结算单再生成分析")
    if len(merchant_nos) > MAX_ANALYSIS_SETTLEMENTS:
        raise HTTPException(
            422, f"一次最多分析 {MAX_ANALYSIS_SETTLEMENTS} 张结算单"
        )
    if payload.start_date and payload.end_date and payload.start_date > payload.end_date:
        raise HTTPException(422, "start_date 不能晚于 end_date")
    try:
        return analyze_series_comparison(
            db,
            merchant_nos=merchant_nos,
            start_date=payload.start_date,
            end_date=payload.end_date,
            refresh=payload.refresh,
        )
    except AiNotConfigured as exc:
        raise HTTPException(503, str(exc)) from exc
    except AiCallFailed as exc:
        raise HTTPException(502, str(exc)) from exc


__all__ = ["router"]
