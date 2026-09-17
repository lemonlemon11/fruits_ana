"""新结算单模板解析器。

只服务 2026-09-17 客户确认的新模板版式，输出可直接回填手工录单页的槽位 JSON，
同时保留文件原值、来源行号与逐字段问题。该模块不替代旧版式解析器。
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

import pandas as pd

from .decimal_values import parse_bounded_decimal, quantize_decimal
from .spec_range import parse_spec_range


MONEY_QUANTUM = Decimal("0.01")
QUANTITY_QUANTUM = Decimal("0.01")


@dataclass(frozen=True)
class TemplateIssue:
    issue_type: str
    severity: str
    row_number: int | None
    field_name: str | None
    message: str
    raw_value: str | None = None


@dataclass
class SettlementTemplate:
    merchant_no: str
    order_no: str | None
    container_no: str | None
    vehicle_no: str | None
    market: str | None
    arrival_date: date | None
    arrival_quantity: Decimal | None
    sales: list[dict[str, Any]]
    after_sales: list[dict[str, Any]]
    fees: list[dict[str, Any]]
    file_summary: dict[str, Any]
    computed_summary: dict[str, Any]
    issues: list[TemplateIssue]


BASIC_LABELS = {
    "商号": "merchant_no",
    "柜号": "container_no",
    "单号": "order_no",
    "转运公司": "vehicle_no",
    "市场": "market",
    "到达市场日期": "arrival_date",
    "来货数量": "arrival_quantity",
    "来货数量件": "arrival_quantity",
}


def _normalize_label(value: Any) -> str:
    text = unicodedata.normalize("NFKC", "" if value is None else str(value))
    return re.sub(r"[\s_\-（）()/:：]+", "", text).lower()


def _text(value: Any) -> str | None:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    text = unicodedata.normalize("NFKC", str(value)).strip()
    return text or None


def _decimal(value: Any) -> Decimal | None:
    text = _text(value)
    if text is None:
        return None
    return parse_bounded_decimal(text)


def _date(value: Any) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = _text(value)
    if text is None:
        return None
    parsed = pd.to_datetime(text, errors="coerce")
    return None if pd.isna(parsed) else parsed.date()


def _row_text(row: Any) -> str:
    return " | ".join(text for value in row if (text := _text(value)))


def _header_columns(raw: pd.DataFrame) -> tuple[int, dict[str, int]]:
    """定位销售表头，返回（表头行号, 规范字段名到列索引的映射）。"""

    targets = {
        "销售日期": "sale_date",
        "品种": "variety",
        "规格头数": "head_count",
        "规格kg": "spec_kg",
        "备注": "remark",
        "数量件": "quantity",
        "数量": "quantity",
        "单价元": "unit_price",
        "单价": "unit_price",
        "金额元": "amount",
        "金额": "amount",
    }
    for row_index, row in raw.iterrows():
        resolved: dict[str, int] = {}
        for col_index, value in enumerate(row):
            key = targets.get(_normalize_label(value))
            if key and key not in resolved:
                resolved[key] = col_index
        if {"sale_date", "variety", "quantity", "unit_price", "amount"}.issubset(resolved):
            return row_index, resolved
    return -1, {}


def _basic_values(raw: pd.DataFrame, header_index: int) -> dict[str, Any]:
    found: dict[str, Any] = {}
    for _, row in raw.iloc[:header_index].iterrows():
        values = list(row)
        for col_index, cell in enumerate(values[:-1]):
            key = BASIC_LABELS.get(_normalize_label(cell))
            if not key or key in found:
                continue
            value = next((_text(item) for item in values[col_index + 1 :] if _text(item)), None)
            if value is not None:
                found[key] = value
    return found


def _sales_rows(
    raw: pd.DataFrame,
    header_index: int,
    columns: dict[str, int],
    issues: list[TemplateIssue],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    previous_date: date | None = None
    for row_index in range(header_index + 1, len(raw)):
        row = raw.iloc[row_index]
        left_label = _normalize_label(row.iloc[0] if len(row) else "")
        row_text = _row_text(row)
        if left_label in {"总件数", "售后", "支出费用", "应付贵方总金额rmb"} or any(
            marker in row_text for marker in ("总件数", "售后合计", "支出费用", "应付贵方总金额")
        ):
            break
        values = {field: row.iloc[col_index] for field, col_index in columns.items()}
        if not any(_text(value) for value in values.values()):
            continue

        sale_date = _date(values.get("sale_date"))
        if sale_date is not None:
            previous_date = sale_date
        elif previous_date is not None:
            sale_date = previous_date
        else:
            issues.append(
                TemplateIssue(
                    "missing_field",
                    "error",
                    row_index + 1,
                    "sale_date",
                    "首个销售行缺少销售日期",
                )
            )

        variety = _text(values.get("variety"))
        if not variety:
            issues.append(
                TemplateIssue(
                    "missing_field",
                    "error",
                    row_index + 1,
                    "variety",
                    "缺少品种，且无法用于等级统计",
                )
            )

        head_raw = _text(values.get("head_count"))
        head = parse_spec_range(head_raw)
        if head_raw is None or head is None:
            issues.append(
                TemplateIssue(
                    "invalid_spec",
                    "error",
                    row_index + 1,
                    "head_count",
                    "规格（头数）无法解析，请填写数字或区间（如 3/4）",
                    head_raw,
                )
            )

        spec_kg_raw = _text(values.get("spec_kg"))
        spec_kg = parse_spec_range(spec_kg_raw)
        if spec_kg_raw is None or spec_kg is None:
            issues.append(
                TemplateIssue(
                    "invalid_spec",
                    "error",
                    row_index + 1,
                    "spec_kg",
                    "规格（KG）无法解析，请填写数字或区间（如 9/10、10）",
                    spec_kg_raw,
                )
            )

        quantity_raw = _text(values.get("quantity"))
        quantity = _decimal(values.get("quantity"))
        if quantity is None or quantity <= 0:
            issues.append(
                TemplateIssue(
                    "invalid_quantity",
                    "error",
                    row_index + 1,
                    "quantity",
                    "销售数量必须大于 0 的数字",
                    quantity_raw,
                )
            )

        unit_price = _decimal(values.get("unit_price")) or Decimal("0")
        amount = _decimal(values.get("amount")) or Decimal("0")

        rows.append(
            {
                "sale_date": sale_date.isoformat() if sale_date else None,
                "source_row": row_index + 1,
                "raw_row_text": row_text,
                "variety": variety,
                "head_count": head.canonical if head else (head_raw or ""),
                "spec_kg": spec_kg.canonical if spec_kg else (spec_kg_raw or ""),
                "remark": _text(values.get("remark")) or "",
                "sales_quantity": str(quantity) if quantity is not None else "0",
                "unit_price": str(unit_price),
                "amount": str(amount),
            }
        )
    return rows


def _column_index_for_row(row: Any, *labels: str) -> int | None:
    for col_index, value in enumerate(row):
        if _normalize_label(value) in labels:
            return col_index
    return None


def _parse_after_sales(
    raw: pd.DataFrame,
    header_index: int,
    issues: list[TemplateIssue],
) -> list[dict[str, Any]]:
    start = header_index + 1
    for index in range(start, len(raw)):
        row = raw.iloc[index]
        if "售后" in _normalize_label(row.iloc[0] if len(row) else ""):
            content_col = _column_index_for_row(row, "内容")
            summary_col = _column_index_for_row(row, "摘要")
            amount_col = _column_index_for_row(row, "金额")
            if content_col is None or amount_col is None:
                return []
            items: list[dict[str, Any]] = []
            for item_index in range(index + 1, len(raw)):
                item_row = raw.iloc[item_index]
                row_text = _row_text(item_row)
                if any(marker in row_text for marker in ("售后合计", "货款合计", "支出费用")):
                    break
                content = _text(item_row.iloc[content_col])
                if not content:
                    continue
                amount = _decimal(item_row.iloc[amount_col]) or Decimal("0")
                items.append(
                    {
                        "content": content,
                        "summary": _text(item_row.iloc[summary_col]) if summary_col is not None else "",
                        "amount": str(amount),
                        "source_row": item_index + 1,
                        "raw_row_text": row_text,
                    }
                )
            return items
    return []


def _parse_fees(
    raw: pd.DataFrame,
    header_index: int,
    issues: list[TemplateIssue],
) -> list[dict[str, Any]]:
    start = header_index + 1
    for index in range(start, len(raw)):
        row = raw.iloc[index]
        if "支出费用" in _normalize_label(row.iloc[0] if len(row) else ""):
            name_col = _column_index_for_row(row, "摘要")
            amount_col = _column_index_for_row(row, "金额")
            if name_col is None or amount_col is None:
                return []
            items: list[dict[str, Any]] = []
            for item_index in range(index + 1, len(raw)):
                item_row = raw.iloc[item_index]
                row_text = _row_text(item_row)
                if "费用合计" in row_text or "应付贵方总金额" in row_text:
                    break
                name = _text(item_row.iloc[name_col])
                if not name:
                    continue
                amount = _decimal(item_row.iloc[amount_col]) or Decimal("0")
                items.append(
                    {
                        "name": name,
                        "amount": str(amount),
                        "source_row": item_index + 1,
                        "raw_row_text": row_text,
                    }
                )
            return items
    return []


def _summary_number(row: Any, label: str) -> Decimal | None:
    for col_index, value in enumerate(row):
        if label in _normalize_label(value):
            for candidate in row.iloc[col_index + 1 :]:
                parsed = _decimal(candidate)
                if parsed is not None:
                    return parsed
    return None


def _file_summary(raw: pd.DataFrame) -> dict[str, Any]:
    summary: dict[str, Any] = {}
    fee_details: list[str] = []
    in_fee_section = False
    for _, row in raw.iterrows():
        text = _row_text(row)
        if "支出费用" in text:
            in_fee_section = True
            continue
        if in_fee_section and "费用合计" in text:
            in_fee_section = False
        if in_fee_section:
            name = _text(row.iloc[1]) if len(row) > 1 else None
            amount = _decimal(row.iloc[-1]) if len(row) else None
            if name and name not in {"摘要", "金额"} and amount is not None:
                fee_details.append(f"{name}: {amount}")
        if "总件数" in text:
            for col_index, value in enumerate(row):
                if "总件数" in _normalize_label(value):
                    candidate = next((item for item in row.iloc[col_index + 1 :] if _decimal(item) is not None), None)
                    summary["sales_quantity"] = _decimal(candidate)
                    break
        if "销售金额" in text:
            summary["sales_amount"] = _summary_number(row, "销售金额")
        if "售后合计" in text:
            summary["after_sale_amount"] = _summary_number(row, "售后合计")
        if "货款合计" in text:
            summary["goods_amount"] = _summary_number(row, "货款合计")
        if "费用合计" in text:
            summary["fee_amount"] = _summary_number(row, "费用合计")
        if "应付贵方总金额" in text:
            summary["payable_amount"] = _summary_number(row, "应付贵方总金额")
    if fee_details:
        summary["fee_detail"] = "；".join(fee_details)
    return summary


def _computed_summary(sales: list[dict], after_sales: list[dict], fees: list[dict]) -> dict[str, Decimal]:
    sales_amount = sum((Decimal(row["sales_quantity"]) * Decimal(row["unit_price"]) for row in sales), Decimal("0"))
    quantity = sum((Decimal(row["sales_quantity"]) for row in sales), Decimal("0"))
    after_amount = sum((Decimal(row["amount"]) for row in after_sales), Decimal("0"))
    fee_amount = sum((Decimal(row["amount"]) for row in fees), Decimal("0"))
    goods_amount = sales_amount - after_amount
    payable_amount = goods_amount - fee_amount
    return {
        "sales_quantity": quantity,
        "sales_amount": sales_amount,
        "after_sale_amount": after_amount,
        "goods_amount": goods_amount,
        "fee_amount": fee_amount,
        "payable_amount": payable_amount,
    }


def _money(value: Decimal | None) -> str:
    return str((value or Decimal("0")).quantize(MONEY_QUANTUM))


def _quantity(value: Decimal | None) -> str:
    return str((value or Decimal("0")).quantize(QUANTITY_QUANTUM))


def _reconcile_issues(
    file_summary: dict[str, Any],
    computed: dict[str, Decimal],
    issues: list[TemplateIssue],
) -> None:
    labels = {
        "sales_quantity": "总件数",
        "sales_amount": "销售金额",
        "after_sale_amount": "售后合计",
        "goods_amount": "货款合计",
        "fee_amount": "费用合计",
        "payable_amount": "应付贵方总金额",
    }
    for field, label in labels.items():
        declared = file_summary.get(field)
        if declared is None or field not in computed:
            continue
        if abs(declared - computed[field]) > Decimal("0.01"):
            issues.append(
                TemplateIssue(
                    "summary_mismatch",
                    "warning",
                    None,
                    field,
                    f"文件{label} {declared} 与系统按明细计算 {computed[field]} 不一致",
                    str(declared),
                )
            )


def parse_settlement_template(file_path: str | Path) -> SettlementTemplate:
    path = Path(file_path)
    raw = pd.read_excel(path, header=None, dtype=object, keep_default_na=False)
    issues: list[TemplateIssue] = []
    header_index, columns = _header_columns(raw)
    if header_index < 0:
        raise ValueError("未识别到新结算单模板的销售表头")

    basic = _basic_values(raw, header_index)
    merchant_no = basic.get("merchant_no")
    if not merchant_no:
        raise ValueError("缺少商号，无法确定结算单身份")

    arrival_quantity = _decimal(basic.get("arrival_quantity"))
    arrival_date = _date(basic.get("arrival_date"))
    sales = _sales_rows(raw, header_index, columns, issues)
    after_sales = _parse_after_sales(raw, header_index, issues)
    fees = _parse_fees(raw, header_index, issues)
    file_summary = _file_summary(raw)
    computed = _computed_summary(sales, after_sales, fees)
    _reconcile_issues(file_summary, computed, issues)

    return SettlementTemplate(
        merchant_no=merchant_no,
        order_no=basic.get("order_no"),
        container_no=basic.get("container_no"),
        vehicle_no=basic.get("vehicle_no"),
        market=basic.get("market"),
        arrival_date=arrival_date,
        arrival_quantity=arrival_quantity,
        sales=sales,
        after_sales=after_sales,
        fees=fees,
        file_summary={key: _money(value) for key, value in file_summary.items() if value is not None},
        computed_summary={key: _money(value) for key, value in computed.items()},
        issues=issues,
    )


__all__ = ["SettlementTemplate", "TemplateIssue", "parse_settlement_template"]
