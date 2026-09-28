"""按商号的等级销售分析 HTTP 接口。"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..auth import require_current_user
from ..db import get_db
from ..schemas import (
    SeriesAnalysisRequest,
    SeriesAnalysisResponse,
    SettlementAnalysisRequest,
)
from ..services.ai_analysis_service import (
    AiCallFailed,
    AiNotConfigured,
    analyze_series_comparison,
)
from ..services.grade_detail_analysis_service import analyze_grade_detail
from ..services.settlement_analytics_service import (
    get_daily_trend,
    get_filter_options,
    get_grade_breakdown,
    get_grade_spec_breakdown,
    get_overview,
    get_settlement_comparison,
    get_settlement_detail,
)
from ..services.settlement_ai_analysis_service import analyze_settlement_detail
from ..services.series_analytics_service import (
    get_series_comparison,
    settlement_series_names,
)


# AI 分析至少要两张结算单才有对比意义；张数不设上限（ADR-047）。
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
    brand: str | None = None,
    country: str | None = None,
    market: str | None = None,
) -> dict:
    if start_date and end_date and start_date > end_date:
        raise HTTPException(422, "start_date 不能晚于 end_date")
    return {
        "start_date": start_date,
        "end_date": end_date,
        "merchant_no": merchant_no,
        "brand": brand,
        "country": country,
        "market": market,
    }


def _ensure_same_series(db: Session, merchant_nos: list[str]) -> None:
    """对比和 AI 分析都只能在同一个品牌内选择结算单。"""

    series_names = settlement_series_names(db, merchant_nos)
    if len(series_names) > 1:
        raise HTTPException(422, "只能在同一品牌内选择结算单进行对比")


def _analysis_scope(payload: SeriesAnalysisRequest, db: Session) -> list[str]:
    """校验并归一化 AI 分析的结算单范围；两个分析接口共用同一套规则。"""

    merchant_nos = list(
        dict.fromkeys(
            value.strip() for value in payload.merchant_no if value and value.strip()
        )
    )
    if len(merchant_nos) < MIN_ANALYSIS_SETTLEMENTS:
        raise HTTPException(422, "请至少选择两个结算单再生成分析")
    if payload.start_date and payload.end_date and payload.start_date > payload.end_date:
        raise HTTPException(422, "start_date 不能晚于 end_date")
    _ensure_same_series(db, merchant_nos)
    return merchant_nos


@router.get("/overview")
def overview(filters: dict = Depends(_filters), db: Session = Depends(get_db)):
    return get_overview(db, **filters)


@router.get("/trend")
def trend(filters: dict = Depends(_filters), db: Session = Depends(get_db)):
    return {"trend": get_daily_trend(db, **filters)}


@router.get("/filter-options")
def filter_options(filters: dict = Depends(_filters), db: Session = Depends(get_db)):
    """首页筛选条的品牌/国家/市场选项；不受 brand/country/market 影响，保证选项稳定。"""

    return get_filter_options(
        db,
        start_date=filters["start_date"],
        end_date=filters["end_date"],
        merchant_no=filters["merchant_no"],
    )


@router.get("/grade-breakdown")
def grade_breakdown(
    filters: dict = Depends(_filters),
    db: Session = Depends(get_db),
):
    return get_grade_breakdown(db, **filters)


@router.get("/grade-spec-breakdown")
def grade_spec_breakdown(
    filters: dict = Depends(_filters),
    db: Session = Depends(get_db),
):
    """按 等级 × 规格（头数 × KG）返回件数、金额、均价与等级内件数占比。"""

    return get_grade_spec_breakdown(db, **filters)


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
    """按勾选的结算单返回各等级独立对比与系列汇总。"""

    if start_date and end_date and start_date > end_date:
        raise HTTPException(422, "start_date 不能晚于 end_date")
    merchant_nos = list(
        dict.fromkeys(
            value.strip() for value in (merchant_no or []) if value and value.strip()
        )
    )
    _ensure_same_series(db, merchant_nos)
    return get_series_comparison(
        db,
        merchant_nos=merchant_nos,
        start_date=start_date,
        end_date=end_date,
    )


@router.post("/settlements/{merchant_no}/analysis", response_model=SeriesAnalysisResponse)
def settlement_detail_analysis(
    merchant_no: str,
    payload: SettlementAnalysisRequest,
    db: Session = Depends(get_db),
):
    """生成当前结算单与同品牌其他结算单的等级价格对比和经营建议。"""

    if payload.start_date and payload.end_date and payload.start_date > payload.end_date:
        raise HTTPException(422, "start_date 不能晚于 end_date")
    try:
        return analyze_settlement_detail(
            db,
            merchant_no=merchant_no,
            start_date=payload.start_date,
            end_date=payload.end_date,
            refresh=payload.refresh,
        )
    except AiNotConfigured as exc:
        raise HTTPException(503, str(exc)) from exc
    except AiCallFailed as exc:
        raise HTTPException(502, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.post("/series-comparison/analysis", response_model=SeriesAnalysisResponse)
def series_comparison_analysis(
    payload: SeriesAnalysisRequest, db: Session = Depends(get_db)
):
    """按勾选的结算单生成 AI 分析结论；相同条件会直接返回缓存。"""

    merchant_nos = _analysis_scope(payload, db)
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


@router.post("/grade-detail/analysis", response_model=SeriesAnalysisResponse)
def grade_detail_analysis(payload: SeriesAnalysisRequest, db: Session = Depends(get_db)):
    """按勾选的结算单生成等级细分（号别）AI 小结；相同条件直接返回缓存。"""

    merchant_nos = _analysis_scope(payload, db)
    try:
        return analyze_grade_detail(
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
