"""从 Excel 结算区提取结算单级金额摘要。"""

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


def extract_settlement_summary(frame: pd.DataFrame) -> dict[str, Any] | None:
    """返回可直接传给 ``SettlementSummary`` 的金额字段字典。"""

    summary: dict[str, Any] = {}
    fee_details: list[str] = []
    in_fee_section = False
    for _, row in frame.iterrows():
        label = " ".join(text for value in row if (text := _text(value)))
        amount = _rightmost_decimal(row)
        in_fee_section = _collect_fee_detail(label, amount, in_fee_section, fee_details)
        field_name = _summary_field(label)
        if field_name and amount is not None:
            summary[field_name] = amount
            if field_name == "sales_amount":
                # 合计行里「销售金额」左边那一列就是文件写的件数合计（拿不到就留空）。
                quantity = _left_decimal(row, marker_index=_label_index(row, "销售金额"))
                if quantity is not None:
                    summary["sales_quantity"] = quantity
    if fee_details:
        summary["fee_detail"] = "；".join(fee_details)
    return summary or None


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


def _label_index(row, marker: str) -> int | None:
    for index, value in enumerate(row):
        text = _text(value)
        if text and marker in text:
            return index
    return None


def _left_decimal(row, marker_index: int | None) -> Decimal | None:
    """取标记单元格左侧最近的一个数字（即合计行里的件数列）。"""

    if marker_index is None:
        return None
    values = list(row)[:marker_index]
    for value in reversed(values):
        parsed = _decimal(value)
        if parsed is not None:
            return parsed
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


__all__ = ["extract_settlement_summary"]
