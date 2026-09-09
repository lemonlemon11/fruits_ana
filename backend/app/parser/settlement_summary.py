"""从 Excel 结算区提取货柜级金额摘要。"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

import pandas as pd

from .decimal_values import parse_bounded_decimal


SUMMARY_FIELDS = {
    "销售金额": "sales_amount",
    "售后合计": "after_sale_amount",
    "货款合计": "goods_amount",
    "费用合计": "fee_amount",
}


def extract_container_summary(
    frame: pd.DataFrame, container_id: str | None
) -> dict[str, Any] | None:
    """返回可直接传给 ``ContainerSummary`` 的字段字典。"""

    if not container_id:
        return None
    summary: dict[str, Any] = {"container_id": container_id}
    fee_details: list[str] = []
    in_fee_section = False
    for _, row in frame.iterrows():
        label = " ".join(text for value in row if (text := _text(value)))
        amount = _rightmost_decimal(row)
        in_fee_section = _collect_fee_detail(label, amount, in_fee_section, fee_details)
        field_name = _summary_field(label)
        if field_name and amount is not None:
            summary[field_name] = amount
    if fee_details:
        summary["fee_detail"] = "；".join(fee_details)
    return summary if len(summary) > 1 else None


def _collect_fee_detail(
    label: str, amount: Decimal | None, active: bool, details: list[str]
) -> bool:
    if "支出费用" in label:
        return True
    if not active:
        return False
    if "费用合计" in label:
        return False
    if amount is not None and label and label not in {"摘要", "金额"}:
        details.append(f"{label}: {amount}")
    return True


def _summary_field(label: str) -> str | None:
    for marker, field_name in SUMMARY_FIELDS.items():
        if marker in label:
            return field_name
    if "清关" in label and ("费" in label or "税" in label):
        return "customs_tax"
    if "应付" in label and "总金额" in label:
        return "payable_amount"
    return None


def _rightmost_decimal(row) -> Decimal | None:
    for value in reversed(list(row)):
        parsed = _decimal(value)
        if parsed is not None:
            return parsed
    return None


def _decimal(value: Any) -> Decimal | None:
    text = _text(value)
    if text is None:
        return None
    return parse_bounded_decimal(text)


def _text(value: Any) -> str | None:
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    text = str(value).strip()
    return text or None


__all__ = ["extract_container_summary"]
