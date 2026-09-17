"""把分析服务的原始返回压成适合放进提示词的精简载荷。

原始返回里有柜号、明细行、`record_ids` 这类模型用不上的字段，直接丢给模型既贵又
容易跑题。这里只保留聚合数字，并用中文键名，方便模型直接引用与措辞。
"""

from __future__ import annotations

from typing import Any


# 趋势最多保留的天数，够回答「哪天卖得多」即可。
MAX_TREND_POINTS = 14
# 经营提醒最多保留的条数。
MAX_ANOMALIES = 5


def _count(value: Any) -> int | float:
    """件数、金额这类计数去掉多余小数位，避免模型写出 ``581745.0 元``。"""

    number = round(float(value), 2)
    return int(number) if number == int(number) else number


def _price(value: Any) -> float:
    return round(float(value), 2)


def _share(value: Any) -> float:
    return round(float(value), 4)


def _totals(total: dict) -> dict:
    return {
        "件数": _count(total["sales_quantity"]),
        "金额": _count(total["sales_amount"]),
        "平均每公斤售价": _price(total["weighted_avg_price"]),
    }


def _grade_rows(grades: Any) -> list[dict]:
    return [
        {
            "等级": row["grade"],
            "件数": _count(row["sales_quantity"]),
            "金额": _count(row["sales_amount"]),
            "平均每公斤售价": _price(row["weighted_avg_price"]),
            "件数占比": _share(row["quantity_share"]),
        }
        for row in grades
    ]


def _settlement_head(row: dict) -> dict:
    return {
        "商号": row["merchant_no"],
        "单号": row.get("order_no_normalized"),
        "品牌": row.get("series"),
    }


def _trend_rows(trend: Any) -> list[dict]:
    return [
        {
            "日期": row["sale_date"],
            "件数": _count(row["sales_quantity"]),
            "金额": _count(row["sales_amount"]),
            "平均每公斤售价": _price(row["weighted_avg_price"]),
        }
        for row in list(trend)[:MAX_TREND_POINTS]
    ]


def _anomalies(items: Any) -> list[dict]:
    return [
        {
            "商号": item.get("merchant_no_normalized") or item.get("merchant_no"),
            "类型": item.get("type"),
            "说明": item.get("reason"),
            "实际值": _price(item.get("metric")),
            "整体基准": _price(item.get("baseline")),
        }
        for item in list(items)[:MAX_ANOMALIES]
    ]


def _date_range(result: dict) -> dict | None:
    rng = result.get("date_range")
    if not rng:
        return None
    return {
        "开始日期": str(rng["start_date"]),
        "结束日期": str(rng["end_date"]),
        "是否为默认区间": bool(rng.get("is_default", False)),
    }


def compact_settlement_list(result: dict) -> dict:
    return {
        "日期范围": _date_range(result),
        "结算单": [
            {
                **_settlement_head(row),
                "销售日期": f"{row['sale_date_start']}~{row['sale_date_end']}",
                "件数": _count(row["total_quantity"]),
                "金额": _count(row["sales_amount"]),
                "平均每公斤售价": _price(row["average_price"]),
                "各等级件数": {
                    key: _count(value)
                    for key, value in row["grade_quantities"].items()
                    if value
                },
            }
            for row in result.get("settlements", [])
        ],
    }


def compact_overview(result: dict) -> dict:
    return {
        "合计": _totals(result["total"]),
        "各等级": _grade_rows(result["grades"]),
        "每天": _trend_rows(result.get("trend") or []),
        "经营提醒": _anomalies(result.get("operating_anomalies") or []),
    }


def compact_ranking(rows: Any) -> list[dict]:
    return [
        {
            **_settlement_head(row),
            "销售日期": f"{row['start_date']}~{row['end_date']}",
            "合计": _totals(row["total"]),
            "各等级": _grade_rows(row["grades"]),
            "排名": {
                "按件数": row["rank"]["sales_quantity"],
                "按金额": row["rank"]["sales_amount"],
                "按平均每公斤售价": row["rank"]["weighted_avg_price"],
            },
            "件数占比": _share(row["sales_quantity_share"]),
            "金额占比": _share(row["sales_amount_share"]),
        }
        for row in rows
    ]


def compact_detail(detail: dict) -> dict:
    records = detail.get("records") or []
    return {
        **_settlement_head(detail),
        "门店来源": "手工录单" if detail.get("source_type") == "manual" else "导入",
        "市场": detail.get("market"),
        "到货日期": detail.get("arrival_date"),
        "销售期间": detail.get("sales_period"),
        "合计": _totals(detail["total"]),
        "各等级": _grade_rows(detail["grades"]),
        "每天": _trend_rows(detail.get("trend") or []),
        "结算信息": detail.get("settlement"),
        "经营提醒": _anomalies(detail.get("operating_anomalies") or []),
        "明细行数": len(records),
    }


def compact_comparison(result: dict) -> dict:
    return {
        "所选结算单": [
            {
                **_settlement_head(row),
                "销售日期": f"{row['start_date']}~{row['end_date']}",
                "合计": _totals(row["total"]),
                "各等级": _grade_rows(row["grades"]),
            }
            for row in result.get("settlements", [])
        ],
        "品牌汇总": [
            {
                "品牌": row["name"],
                "结算单数": row["settlement_count"],
                "合计": _totals(row["total"]),
                "各等级": _grade_rows(row["grades"]),
            }
            for row in result.get("series", [])
        ],
        "合计": _totals(result["total"]["total"]),
        "号别结论": (result.get("grade_details") or {}).get("insights") or {},
    }


__all__ = [
    "compact_comparison",
    "compact_detail",
    "compact_overview",
    "compact_ranking",
    "compact_settlement_list",
]
