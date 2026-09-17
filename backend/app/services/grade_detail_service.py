"""按细分等级（号别）聚合销售指标。

分桶口径见 ADR-013：单号各自成桶、区间原样成桶、品质后缀只做标记。
聚合键为「果类 + 标签」，因此在出现第二种水果时会自动分组，不会互相覆盖。

传入 ``batches``（结算单映射）时，额外产出跨结算单、跨号别与带品质标记的对比，
供 AI 小结引用；这些数字全部由后端算好，大模型只负责组织语言，不参与计算。
"""

from __future__ import annotations

from collections import defaultdict
from decimal import Decimal

from ..models import ImportBatch, SaleRecord
from ..parser.grade_detail import (
    QUALITY_MARKS,
    UNRECOGNIZED_LABEL,
    GradeDetail,
    parse_grade_detail,
)
from .analytics_core import metrics, rounded, share
from .merchant_no_naming import merchant_no_display

_MARK_ORDER = {mark: index for index, mark in enumerate(QUALITY_MARKS)}
# 对比类结论最多各带 8 条，避免数据包过长推高 token 成本。
_MAX_INSIGHT_ROWS = 8

BucketKey = tuple[str, str, str]
Entry = tuple[SaleRecord, GradeDetail]


def _ordered_marks(marks: set[str]) -> list[str]:
    return sorted(marks, key=lambda mark: _MARK_ORDER.get(mark, len(_MARK_ORDER)))


def _diff(high: float, low: float) -> float:
    """两个指标相减，用 Decimal 避免浮点误差写进给大模型的数字里。"""

    return rounded(Decimal(str(high)) - Decimal(str(low)))


def _price_rankings(buckets: list[dict]) -> list[dict]:
    """按平均每公斤售价从高到低排列号别，并标出哪些是区间写法。"""

    rows = [
        {
            "号别": row["label"],
            "大等级": row["grade"],
            "是否区间": "/" in row["label"],
            "件数": row["sales_quantity"],
            "平均每公斤售价": row["weighted_avg_price"],
            "金额占比": row["amount_share"],
        }
        for row in buckets
        if row["weighted_avg_price"] is not None
    ]
    rows.sort(key=lambda row: row["平均每公斤售价"], reverse=True)
    return rows


def _grade_price_gaps(buckets: list[dict]) -> list[dict]:
    """同一个大等级里最贵与最便宜的号别差多少，例如 A6 比 A5 贵多少。"""

    grouped: dict[str, list[dict]] = defaultdict(list)
    for row in buckets:
        if row["weighted_avg_price"] is not None:
            grouped[row["grade"]].append(row)
    gaps = []
    for grade, rows in sorted(grouped.items()):
        if len(rows) < 2:
            continue
        top = max(rows, key=lambda row: row["weighted_avg_price"])
        bottom = min(rows, key=lambda row: row["weighted_avg_price"])
        gaps.append(
            {
                "大等级": grade,
                "最贵号别": top["label"],
                "最贵平均每公斤售价": top["weighted_avg_price"],
                "最便宜号别": bottom["label"],
                "最便宜平均每公斤售价": bottom["weighted_avg_price"],
                "相差": _diff(top["weighted_avg_price"], bottom["weighted_avg_price"]),
            }
        )
    return gaps


def _grade_rollup(
    buckets: list[dict], total_quantity: Decimal, total_amount: Decimal
) -> list[dict]:
    """把号别桶按大等级合并好，避免模型自己去加号别的数字。"""

    grouped: dict[str, list[dict]] = defaultdict(list)
    for row in buckets:
        grouped[row["grade"]].append(row)
    rows = []
    for grade, items in sorted(grouped.items()):
        quantity = sum(
            (Decimal(str(row["sales_quantity"])) for row in items), Decimal("0")
        )
        amount = sum((Decimal(str(row["sales_amount"])) for row in items), Decimal("0"))
        quantity_share = share(quantity, total_quantity)
        amount_share = share(amount, total_amount)
        rows.append(
            {
                "大等级": grade,
                "号别数量": len(items),
                "件数": rounded(quantity),
                "金额": rounded(amount),
                "平均每公斤售价": rounded(amount / quantity) if quantity else None,
                "件数占比": quantity_share,
                "金额占比": amount_share,
                "金额占比减件数占比": (
                    _diff(amount_share, quantity_share)
                    if amount_share is not None and quantity_share is not None
                    else None
                ),
            }
        )
    return rows


def _settlement_price_gaps(
    grouped: dict[BucketKey, list[Entry]], batches: dict[int, ImportBatch]
) -> list[dict]:
    """同一个号别在不同结算单之间的价格差，用来判断货与货本身差在哪。"""

    rows = []
    for key, entries in grouped.items():
        by_settlement: dict[str, list[SaleRecord]] = defaultdict(list)
        for record, _detail in entries:
            batch = batches.get(record.import_batch_id)
            if batch is not None:
                by_settlement[
                    merchant_no_display(batch.merchant_no, batch.merchant_no_normalized)
                    or batch.merchant_no
                ].append(record)
        priced = []
        for merchant_no, items in by_settlement.items():
            current = metrics(items)
            if current["weighted_avg_price"] is not None:
                priced.append((merchant_no, current["weighted_avg_price"], current["sales_quantity"]))
        if len(priced) < 2:
            continue
        top = max(priced, key=lambda row: row[1])
        bottom = min(priced, key=lambda row: row[1])
        rows.append(
            {
                "号别": key[2],
                "最高价商号": top[0],
                "最高平均每公斤售价": top[1],
                "最高价件数": top[2],
                "最低价商号": bottom[0],
                "最低平均每公斤售价": bottom[1],
                "最低价件数": bottom[2],
                "相差": _diff(top[1], bottom[1]),
            }
        )
    rows.sort(key=lambda row: row["相差"], reverse=True)
    return rows[:_MAX_INSIGHT_ROWS]


def _quality_mark_gaps(grouped: dict[BucketKey, list[Entry]]) -> list[dict]:
    """同一个号别里，带品质标记（熟/裂/黄皮）与不带标记的货价格差多少。

    品质标记只做标记、不参与分桶（ADR-013），这里只用来解释价格差异。
    """

    rows = []
    for key, entries in grouped.items():
        marked = [record for record, detail in entries if detail.quality_marks]
        plain = [record for record, detail in entries if not detail.quality_marks]
        if not marked or not plain:
            continue
        marked_metrics = metrics(marked)
        plain_metrics = metrics(plain)
        marked_price = marked_metrics["weighted_avg_price"]
        plain_price = plain_metrics["weighted_avg_price"]
        if marked_price is None or plain_price is None:
            continue
        rows.append(
            {
                "号别": key[2],
                "带标记件数": marked_metrics["sales_quantity"],
                "带标记平均每公斤售价": marked_price,
                "无标记件数": plain_metrics["sales_quantity"],
                "无标记平均每公斤售价": plain_price,
                "相差": _diff(marked_price, plain_price),
            }
        )
    rows.sort(key=lambda row: abs(row["相差"]), reverse=True)
    return rows[:_MAX_INSIGHT_ROWS]


def _insights(
    grouped: dict[BucketKey, list[Entry]],
    buckets: list[dict],
    batches: dict[int, ImportBatch],
    total_quantity: Decimal,
    total_amount: Decimal,
) -> dict:
    return {
        "大等级汇总": _grade_rollup(buckets, total_quantity, total_amount),
        "号别价格排名": _price_rankings(buckets),
        "同级号别价格差": _grade_price_gaps(buckets),
        "同号别跨结算单价格差": _settlement_price_gaps(grouped, batches),
        "品质标记对比": _quality_mark_gaps(grouped),
    }


def grade_detail_metrics(
    records: list[SaleRecord], batches: dict[int, ImportBatch] | None = None
) -> dict:
    """返回细分等级阶梯、未识别写法；给定结算单映射时附带对比结论。"""

    grouped: dict[BucketKey, list[Entry]] = defaultdict(list)
    unrecognized: list[SaleRecord] = []
    for record in records:
        detail = parse_grade_detail(
            record.grade_raw,
            record.fruit_type,
            stat_grade=record.grade.value,
        )
        if detail is None:
            unrecognized.append(record)
            continue
        grouped[(detail.fruit_type, detail.grade, detail.label)].append((record, detail))

    total_quantity = sum((item.quantity for item in records), Decimal("0"))
    total_amount = sum((item.amount for item in records), Decimal("0"))
    buckets = []
    for (fruit_type, grade, label), entries in grouped.items():
        items = [record for record, _detail in entries]
        current = metrics(items)
        quantity = Decimal(str(current["sales_quantity"]))
        amount = Decimal(str(current["sales_amount"]))
        marks = {mark for _record, detail in entries for mark in detail.quality_marks}
        buckets.append(
            {
                "label": label,
                "grade": grade,
                "fruit_type": fruit_type,
                "sales_quantity": current["sales_quantity"],
                "sales_amount": current["sales_amount"],
                "weighted_avg_price": current["weighted_avg_price"],
                "quantity_share": share(quantity, total_quantity),
                "amount_share": share(amount, total_amount),
                "record_count": len(items),
                "quality_marks": _ordered_marks(marks),
            }
        )
    buckets.sort(key=lambda row: (row["fruit_type"], row["grade"], row["label"]))
    result = {
        "buckets": buckets,
        "unrecognized": {
            "label": UNRECOGNIZED_LABEL,
            "record_count": len(unrecognized),
            "sales_quantity": rounded(
                sum((item.quantity for item in unrecognized), Decimal("0"))
            ),
        },
        "total": metrics(records),
    }
    if batches:
        result["insights"] = _insights(
            grouped, buckets, batches, total_quantity, total_amount
        )
    return result


__all__ = ["grade_detail_metrics"]
