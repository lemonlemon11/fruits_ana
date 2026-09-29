"""按商号组织的对比、详情与异常计算。"""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from ..models import ImportBatch, SaleRecord
from .analytics_core import (
    DEFAULT_THRESHOLDS,
    AnomalyThresholds,
    GRADES,
    batch_brand,
    daily_quantity_anomalies,
    grade_contribution,
    grade_metrics,
    group_by_merchant,
    metrics,
    rank_values,
    raw_metrics,
    records as core_records,
    rounded,
    settlement_anomalies,
    settlement_map,
    share,
    short_cache_get,
    short_cache_put,
)
from .order_no_naming import order_no_display, series_name
from .merchant_no_naming import merchant_no_display
from .settlement_detail_service import record_payload


def _records(db: Session, **filters) -> list[SaleRecord]:
    return core_records(db, **filters)


def get_grade_summary(
    db: Session,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    merchant_no: str | None = None,
    brand: str | None = None,
    country: str | None = None,
    market: str | None = None,
) -> dict:
    filtered = _records(
        db,
        start_date=start_date,
        end_date=end_date,
        merchant_no=merchant_no,
        brand=brand,
        country=country,
        market=market,
    )
    return {"total": metrics(filtered), "grades": grade_metrics(filtered)}


def get_grade_breakdown(
    db: Session,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    merchant_no: str | None = None,
    brand: str | None = None,
    country: str | None = None,
    market: str | None = None,
    include_records: bool = True,
) -> dict:
    """返回等级图表所需的数据：等级汇总与销售明细。

    ``market_brand_containers`` 是「卖得怎么样」页市场销售分析的数据源：
    按市场 × 品牌统计结算单（商号）数量——柜号存在一柜两单，不能按柜号去重；
    跟随全部筛选（含 market），前端按返回数据切换全部/单市场两种展示。
    ``include_records=False`` 时省略逐条销售明细（移动端首页只需要市场柜数
    聚合，明细会让响应膨胀到 150KB+）。
    """

    filtered = _records(
        db,
        start_date=start_date,
        end_date=end_date,
        merchant_no=merchant_no,
        brand=brand,
        country=country,
        market=market,
    )
    batches = settlement_map(db, filtered)
    market_brand_counts: Counter[tuple[str, str]] = Counter()
    for batch_id in {record.import_batch_id for record in filtered}:
        batch = batches.get(batch_id)
        if batch is None:
            continue
        market_name = batch.market or "未标注市场"
        market_brand_counts[(market_name, batch_brand(batch))] += 1
    record_payloads = []
    if include_records:
        for record in filtered:
            payload = record_payload(record, include_piece_count=True)
            batch = batches.get(record.import_batch_id)
            # 品牌口径与柜数统计一致（brand 列优先，回退单号中文前缀）。
            payload["brand"] = batch_brand(batch) if batch is not None else None
            record_payloads.append(payload)
    return {
        "grades": grade_metrics(filtered),
        "records": record_payloads,
        "market_brand_containers": [
            {"market": market_name, "brand": brand_name, "container_count": count}
            for (market_name, brand_name), count in sorted(
                market_brand_counts.items(), key=lambda item: (-item[1], item[0])
            )
        ],
    }


def get_grade_spec_breakdown(
    db: Session,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    merchant_no: str | None = None,
    brand: str | None = None,
    country: str | None = None,
    market: str | None = None,
) -> dict:
    """按 等级 × 规格（头数 × KG）聚合销售件数、金额、均价与等级内占比。"""

    filtered = _records(
        db,
        start_date=start_date,
        end_date=end_date,
        merchant_no=merchant_no,
        brand=brand,
        country=country,
        market=market,
    )

    grouped: dict[str, dict[tuple[str | None, str | None], list[SaleRecord]]] = {}
    for record in filtered:
        grouped.setdefault(record.grade.value, {}).setdefault(
            (record.piece_count, record.spec_kg), []
        ).append(record)

    grades = []
    for grade in GRADES:
        buckets = grouped.get(grade.value)
        if not buckets:
            continue
        grade_records = [item for items in buckets.values() for item in items]
        total = metrics(grade_records)
        total_quantity = Decimal(str(total["sales_quantity"]))
        specs = []
        for (piece_count, spec_kg), items in buckets.items():
            current = metrics(items)
            quantity = Decimal(str(current["sales_quantity"]))
            share = quantity / total_quantity if total_quantity else None
            specs.append(
                {
                    "piece_count": piece_count,
                    "spec_kg": spec_kg,
                    **current,
                    "quantity_share": rounded(share) if share is not None else None,
                }
            )
        specs.sort(key=lambda spec: -spec["sales_quantity"])
        grades.append({"grade": grade.value, "total": total, "specs": specs})

    return {"grades": grades}


def get_overview(db: Session, **filters) -> dict:
    """兼容导出统一总览实现，避免多个入口各自计算口径。"""

    from .overview_service import get_overview as build_overview

    return build_overview(db, **filters)


def get_daily_trend(
    db: Session,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    merchant_no: str | None = None,
    brand: str | None = None,
    country: str | None = None,
    market: str | None = None,
) -> list[dict]:
    grouped: dict[date, list[SaleRecord]] = defaultdict(list)
    for record in _records(
        db,
        start_date=start_date,
        end_date=end_date,
        merchant_no=merchant_no,
        brand=brand,
        country=country,
        market=market,
    ):
        grouped[record.sale_date].append(record)
    return [
        {
            "sale_date": sale_date.isoformat(),
            **metrics(grouped[sale_date]),
            "container_count": len(
                {
                    record.import_batch_id
                    for record in grouped[sale_date]
                    if record.import_batch_id
                }
            ),
        }
        for sale_date in sorted(grouped)
    ]


def get_filter_options(
    db: Session,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    merchant_no: str | None = None,
) -> dict:
    """筛选条选项：窗口内有销售的结算单按品牌/国家/市场聚合计数，
    并返回有销售记录的年度/月度（降序），供日期快速筛选下拉使用。

    刻意不接受 brand/country/market 入参，保证筛选后选项列表依然稳定完整；
    品牌/国家/市场沿用调用方日期窗口（默认最近一个销售月），年/月选项则
    扫全量销售日期——快捷下拉的意义就是跳到窗口外的历史期间，不能被窗口截断。

    结果按 (日期窗口, 商号) 做 60s 进程内缓存：底层是多次远程库往返的全量
    聚合，而选项列表本就以分钟级新鲜度足够。
    """

    cache_key = f"filter-options:{start_date}:{end_date}:{merchant_no}"
    cached = short_cache_get(cache_key)
    if cached is not None:
        return cached
    filtered = _records(
        db, start_date=start_date, end_date=end_date, merchant_no=merchant_no
    )
    batches = settlement_map(db, filtered)
    brand_counts: Counter[str] = Counter()
    country_counts: Counter[str] = Counter()
    market_counts: Counter[str] = Counter()
    seen: set[int] = set()
    for record in filtered:
        batch_id = record.import_batch_id
        if not batch_id or batch_id in seen:
            continue
        seen.add(batch_id)
        batch = batches.get(batch_id)
        if batch is None:
            continue
        brand_counts[batch_brand(batch)] += 1
        if batch.country:
            country_counts[batch.country] += 1
        if batch.market:
            market_counts[batch.market] += 1

    sale_dates = db.query(SaleRecord.sale_date).distinct()
    if merchant_no:
        sale_dates = sale_dates.join(
            ImportBatch, SaleRecord.import_batch_id == ImportBatch.id
        ).filter(ImportBatch.merchant_no == merchant_no)
    years: set[int] = set()
    months: set[str] = set()
    for (sale_date,) in sale_dates:
        years.add(sale_date.year)
        months.add(sale_date.strftime("%Y-%m"))

    def options(counter: Counter[str]) -> list[dict]:
        return [
            {"name": name, "settlement_count": count}
            for name, count in counter.most_common()
        ]

    payload = {
        "brands": options(brand_counts),
        "countries": options(country_counts),
        "markets": options(market_counts),
        "years": sorted(years, reverse=True),
        "months": sorted(months, reverse=True),
    }
    short_cache_put(cache_key, payload)
    return payload


def get_settlement_comparison(
    db: Session,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    merchant_no: str | None = None,
    brand: str | None = None,
    country: str | None = None,
    market: str | None = None,
    include_all_settlements: bool = False,
) -> list[dict]:
    scope_merchant = None if include_all_settlements else merchant_no
    filtered = _records(
        db,
        start_date=start_date,
        end_date=end_date,
        merchant_no=scope_merchant,
        brand=brand,
        country=country,
        market=market,
    )
    batches = settlement_map(db, filtered)
    grouped = group_by_merchant(filtered, batches)
    totals = {key: raw_metrics(items) for key, items in grouped.items()}
    overall_quantity = sum(
        (item["quantity"] for item in totals.values()), Decimal("0")
    )
    overall_amount = sum((item["amount"] for item in totals.values()), Decimal("0"))
    rank_fields = {
        "sales_quantity": rank_values(totals, "quantity"),
        "sales_amount": rank_values(totals, "amount"),
        "weighted_avg_price": rank_values(totals, "average"),
    }
    items = []
    for merchant in sorted(grouped):
        current = grouped[merchant]
        dates = [record.sale_date for record in current]
        batch = batches[current[0].import_batch_id]
        items.append(
            {
                "merchant_no": merchant,
                "merchant_no_normalized": merchant_no_display(
                    batch.merchant_no, batch.merchant_no_normalized
                ),
                "order_no": batch.order_no,
                "order_no_normalized": order_no_display(
                    batch.order_no, batch.order_no_normalized
                ),
                "series": series_name(
                    order_no_display(batch.order_no, batch.order_no_normalized)
                    or batch.order_no
                ),
                "container_no": batch.container_no,
                "vehicle_no": batch.vehicle_no,
                "start_date": min(dates).isoformat(),
                "end_date": max(dates).isoformat(),
                "total": metrics(current),
                "grades": grade_metrics(current),
                "rank": {
                    field: ranks[merchant] for field, ranks in rank_fields.items()
                },
                "sales_quantity_share": share(
                    totals[merchant]["quantity"], overall_quantity
                ),
                "sales_amount_share": share(
                    totals[merchant]["amount"], overall_amount
                ),
                "grade_contribution": grade_contribution(current, overall_quantity),
            }
        )
    return items


def get_settlement_detail(
    db: Session,
    merchant_no: str,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    thresholds: AnomalyThresholds = DEFAULT_THRESHOLDS,
) -> dict | None:
    batch = get_settlement(db, merchant_no)
    if batch is None:
        return None
    current = _records(
        db, start_date=start_date, end_date=end_date, merchant_no=merchant_no
    )
    baseline = _records(db, start_date=start_date, end_date=end_date)
    batches = settlement_map(db, baseline)
    from .settlement_detail_service import get_settlement_context

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
        # 国家与品牌：基础信息条与规格表的品牌列依赖这两个字段（brand 列优先，回退单号中文前缀）。
        "country": batch.country,
        "brand": batch_brand(batch),
        "source_type": batch.source_type,
        "market": batch.market,
        "arrival_date": batch.arrival_date.isoformat() if batch.arrival_date else None,
        "arrival_quantity": batch.arrival_quantity,
        "total": metrics(current),
        "grades": grade_metrics(current),
        "trend": get_daily_trend(
            db, start_date=start_date, end_date=end_date, merchant_no=merchant_no
        ),
        **get_settlement_context(db, batch, current),
        "operating_anomalies": [
            *settlement_anomalies(current, baseline, batches, thresholds),
            *daily_quantity_anomalies(current, thresholds),
        ],
    }


def get_settlement(db: Session, merchant_no: str):
    from ..models import ImportBatch

    return db.query(ImportBatch).filter_by(merchant_no=merchant_no).first()


def get_issue_counts(db: Session) -> dict[str, int]:
    from .issue_service import get_issue_counts as count_issues

    return count_issues(db)


def get_operating_anomalies(
    db: Session,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    merchant_no: str | None = None,
    thresholds: AnomalyThresholds = DEFAULT_THRESHOLDS,
) -> list[dict]:
    anomalies: list[dict] = []
    baseline = _records(db, start_date=start_date, end_date=end_date)
    baseline_batches = settlement_map(db, baseline)
    scoped = _records(
        db, start_date=start_date, end_date=end_date, merchant_no=merchant_no
    )
    scoped_batches = settlement_map(db, scoped)
    grouped = group_by_merchant(scoped, scoped_batches)
    for merchant in sorted(grouped):
        for anomaly in settlement_anomalies(
            grouped[merchant], baseline, baseline_batches, thresholds
        ):
            anomalies.append(
                {
                    "merchant_no": merchant,
                    "merchant_no_normalized": merchant_no_display(merchant),
                    **anomaly,
                }
            )
    for anomaly in daily_quantity_anomalies(scoped, thresholds):
        anomalies.append(
            {
                "merchant_no": merchant_no,
                "merchant_no_normalized": merchant_no_display(merchant_no),
                **anomaly,
            }
        )
    return anomalies


__all__ = [
    "DEFAULT_THRESHOLDS",
    "AnomalyThresholds",
    "get_daily_trend",
    "get_filter_options",
    "get_grade_breakdown",
    "get_grade_summary",
    "get_issue_counts",
    "get_operating_anomalies",
    "get_overview",
    "get_settlement",
    "get_settlement_comparison",
    "get_settlement_detail",
]
