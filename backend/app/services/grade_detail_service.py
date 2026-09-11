"""按细分等级（号别）聚合销售指标。

分桶口径见 ADR-013：单号各自成桶、区间原样成桶、品质后缀只做标记。
聚合键为「果类 + 标签」，因此在出现第二种水果时会自动分组，不会互相覆盖。
"""

from __future__ import annotations

from collections import defaultdict
from decimal import Decimal

from ..models import SaleRecord
from ..parser.grade_detail import QUALITY_MARKS, UNRECOGNIZED_LABEL, parse_grade_detail
from .analytics_core import metrics, rounded, share

_MARK_ORDER = {mark: index for index, mark in enumerate(QUALITY_MARKS)}

BucketKey = tuple[str, str, str]


def _ordered_marks(marks: set[str]) -> list[str]:
    return sorted(marks, key=lambda mark: _MARK_ORDER.get(mark, len(_MARK_ORDER)))


def grade_detail_metrics(records: list[SaleRecord]) -> dict:
    """返回细分等级阶梯与未识别写法的统计。"""

    grouped: dict[BucketKey, list[SaleRecord]] = defaultdict(list)
    marks_by_bucket: dict[BucketKey, set[str]] = defaultdict(set)
    unrecognized: list[SaleRecord] = []
    for record in records:
        detail = parse_grade_detail(record.grade_raw, record.fruit_type)
        if detail is None:
            unrecognized.append(record)
            continue
        key = (detail.fruit_type, detail.grade, detail.label)
        grouped[key].append(record)
        marks_by_bucket[key].update(detail.quality_marks)

    total_quantity = sum((item.quantity for item in records), Decimal("0"))
    total_amount = sum((item.amount for item in records), Decimal("0"))
    buckets = []
    for (fruit_type, grade, label), items in grouped.items():
        current = metrics(items)
        quantity = Decimal(str(current["sales_quantity"]))
        amount = Decimal(str(current["sales_amount"]))
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
                "quality_marks": _ordered_marks(marks_by_bucket[(fruit_type, grade, label)]),
            }
        )
    buckets.sort(key=lambda row: (row["fruit_type"], row["grade"], row["label"]))
    return {
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


__all__ = ["grade_detail_metrics"]
