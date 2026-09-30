"""一次读取明细并组装按商号组织的总览响应。"""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from ..models import SettlementSummary
from .analytics_core import (
    DEFAULT_THRESHOLDS,
    AnomalyThresholds,
    daily_quantity_anomalies,
    grade_metrics,
    group_by_merchant,
    metrics,
    records,
    resolve_date_window,
    settlement_anomalies,
    settlement_map,
)
from .issue_service import get_issue_counts
from .merchant_no_naming import merchant_no_display
from .order_no_naming import order_no_display


def get_overview(
    db: Session,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    merchant_no: str | None = None,
    brand: str | None = None,
    country: str | None = None,
    market: str | None = None,
    thresholds: AnomalyThresholds = DEFAULT_THRESHOLDS,
) -> dict:
    effective_start, effective_end, _ = resolve_date_window(
        db, start_date, end_date
    )
    filtered = records(
        db,
        start_date=effective_start,
        end_date=effective_end,
        merchant_no=merchant_no,
        brand=brand,
        country=country,
        market=market,
    )
    batches = settlement_map(db, filtered)
    by_day: dict[date, list] = defaultdict(list)
    for record in filtered:
        by_day[record.sale_date].append(record)
    grouped = group_by_merchant(filtered, batches)
    if (
        merchant_no is None
        and brand is None
        and country is None
        and market is None
    ):
        baseline, baseline_batches = filtered, batches
    else:
        # 异常检测的基线保持同一品牌/国家/市场口径，只放开商号维度。
        baseline = records(
            db,
            start_date=effective_start,
            end_date=effective_end,
            brand=brand,
            country=country,
            market=market,
        )
        baseline_batches = settlement_map(db, baseline)
    anomalies = []
    for key, items in grouped.items():
        anomalies.extend(
            {"merchant_no": key, "merchant_no_normalized": merchant_no_display(key), **item}
            for item in settlement_anomalies(items, baseline, baseline_batches, thresholds)
        )
    anomalies.extend(
        {
            "merchant_no": merchant_no,
            "merchant_no_normalized": merchant_no_display(merchant_no),
            **item,
        }
        for item in daily_quantity_anomalies(filtered, thresholds)
    )
    # 应付金额口径 = 窗口内各结算单摘要 payable_amount 之和（无摘要的结算单不计），
    # 与结算单列表 / 详情页同源（SettlementSummary.payable_amount）。
    window_batch_ids = {record.import_batch_id for record in filtered}
    payable_total = None
    if window_batch_ids:
        summary_rows = (
            db.query(SettlementSummary.payable_amount)
            .filter(
                SettlementSummary.import_batch_id.in_(window_batch_ids),
                SettlementSummary.payable_amount.isnot(None),
            )
            .all()
        )
        if summary_rows:
            payable_total = round(
                float(sum((row.payable_amount for row in summary_rows), Decimal("0"))),
                4,
            )
    return {
        # 总柜数口径 = 结算单数（import_batch_id 去重，一柜两单不去重柜号），
        # 与市场销售分析柜数 / 趋势接口 container_count 一致；件数合计仍走 sales_quantity。
        "total": {
            **metrics(filtered),
            "container_count": len({record.import_batch_id for record in filtered}),
            "payable_amount": payable_total,
        },
        "grades": grade_metrics(filtered),
        "trend": [
            {"sale_date": day.isoformat(), **metrics(by_day[day])}
            for day in sorted(by_day)
        ],
        "settlements": [
            {
                "merchant_no": key,
                "merchant_no_normalized": merchant_no_display(
                    batches[items[0].import_batch_id].merchant_no,
                    batches[items[0].import_batch_id].merchant_no_normalized,
                ),
                "order_no": batches[items[0].import_batch_id].order_no,
                "order_no_normalized": order_no_display(
                    batches[items[0].import_batch_id].order_no,
                    batches[items[0].import_batch_id].order_no_normalized,
                ),
                "container_no": batches[items[0].import_batch_id].container_no,
                "total": metrics(items),
                "grades": grade_metrics(items),
            }
            for key, items in sorted(grouped.items())
        ],
        "issue_counts": get_issue_counts(
            db,
            start_date=effective_start,
            end_date=effective_end,
            merchant_no=merchant_no,
        ),
        "operating_anomalies": anomalies,
    }
