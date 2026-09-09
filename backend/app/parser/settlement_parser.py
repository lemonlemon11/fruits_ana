"""Excel/CSV 结算明细解析与等级标准化。"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any, Iterable, Mapping

import pandas as pd

from ..models import StandardGrade
from .decimal_values import is_bounded_decimal, parse_bounded_decimal, quantize_decimal
from .settlement_summary import extract_container_summary


MONEY_TOLERANCE = Decimal("0.01")
COLUMN_ALIASES = {
    "container_no": ("container_no", "containerid", "container", "货柜号", "柜号", "货柜编号"),
    "sale_date": ("sale_date", "date", "销售日期", "日期", "销售时间"),
    "fruit_name": ("fruit_name", "fruit_type", "fruit", "品种", "水果", "水果名称"),
    "grade": ("grade", "等级", "品级", "销售等级"),
    "raw_grade": ("raw_grade", "grade_raw", "原始等级", "等级原文"),
    "spec": ("spec", "spec_raw", "规格", "品种规格", "商品规格"),
    "quantity": ("quantity", "qty", "数量", "销量", "销售数量", "件数"),
    "unit_price": ("unit_price", "price", "单价", "销售单价", "售价"),
    "amount": ("amount", "total", "金额", "销售额", "销售金额", "合计"),
    "customer": ("customer", "客户", "客户名称", "买家"),
    "sales_region": ("sales_region", "region", "地区", "销售地区"),
    "remark": ("remark", "备注", "说明", "状态"),
}


@dataclass
class ImportIssue:
    issue_type: str
    severity: str
    row_number: int | None
    field_name: str | None
    message: str
    raw_value: str | None = None


def read_settlement(file_path: str | Path, source_type: str | None = None):
    records, issues, _ = read_settlement_with_summary(file_path, source_type)
    return records, issues


def read_settlement_with_summary(file_path: str | Path, source_type: str | None = None):
    frame = _read_dataframe(Path(file_path), source_type)
    records, issues = _parse_rows(frame)
    return records, issues, frame.attrs.get("container_summary")


def normalize_grade(raw: str | None) -> StandardGrade | None:
    if not raw:
        return None
    match = re.search(r"(?i)(?<![a-z])(BC|A|B|C)(?![a-z])", raw.strip())
    if not match:
        return None
    value = match.group(1).upper()
    return StandardGrade.C if value in {"C", "BC"} else StandardGrade(value)


def _normalized_header(value: Any) -> str:
    return re.sub(r"[\s_\-（）()/:：]+", "", str(value).strip().lower())


ALIAS_LOOKUP = {
    _normalized_header(alias): field_name
    for field_name, aliases in COLUMN_ALIASES.items()
    for alias in aliases
}


def _text(value: Any) -> str | None:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    text = str(value).strip()
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


def _read_dataframe(file_path: Path, source_type: str | None) -> pd.DataFrame:
    kind = (source_type or file_path.suffix).lower().lstrip(".")
    if kind in {"csv", "txt"}:
        return pd.read_csv(file_path, dtype=object, keep_default_na=False)
    if kind in {"xlsx", "xls", "excel"}:
        return _read_excel_layout(file_path)
    raise ValueError(f"不支持的导入文件类型: {kind or 'unknown'}")


def _read_excel_layout(file_path: Path) -> pd.DataFrame:
    raw = pd.read_excel(file_path, header=None, dtype=object, keep_default_na=False)
    header_index = _find_header_row(raw)
    container_id = _find_metadata_value(raw.iloc[:header_index], "container_no")
    headers = [value if _text(value) else f"unused_{index}" for index, value in enumerate(raw.iloc[header_index])]
    frame = raw.iloc[header_index + 1 :].copy()
    frame.columns = headers
    frame = _sales_section(frame)
    resolved = _resolved_columns(frame.columns)
    if header_index > 0 and "sale_date" in resolved:
        frame[resolved["sale_date"]] = _fill_down(frame[resolved["sale_date"]])
    if container_id and "container_no" not in resolved:
        frame["container_no"] = container_id
    frame.attrs["data_start_row"] = header_index + 2
    frame.attrs["container_summary"] = extract_container_summary(raw, container_id)
    return frame


def _fill_down(values) -> list[Any]:
    filled, previous = [], None
    for value in values:
        if _text(value) is not None:
            previous = value
        filled.append(previous)
    return filled


def _find_header_row(frame: pd.DataFrame) -> int:
    for index, row in frame.iterrows():
        fields = {ALIAS_LOOKUP.get(_normalized_header(value)) for value in row if _text(value)}
        if {"sale_date", "quantity", "unit_price", "amount"}.issubset(fields) and fields & {"grade", "spec"}:
            return index
    return 0


def _find_metadata_value(frame: pd.DataFrame, field_name: str) -> str | None:
    for _, row in frame.iterrows():
        values = list(row)
        for index, value in enumerate(values[:-1]):
            if ALIAS_LOOKUP.get(_normalized_header(value)) == field_name:
                return next((_text(item) for item in values[index + 1 :] if _text(item)), None)
    return None


def _resolved_columns(columns) -> dict[str, Any]:
    resolved = {}
    for column in columns:
        canonical = ALIAS_LOOKUP.get(_normalized_header(column))
        if canonical and canonical not in resolved:
            resolved[canonical] = column
    return resolved


def _sales_section(frame: pd.DataFrame) -> pd.DataFrame:
    resolved = _resolved_columns(frame.columns)
    keys = [resolved[name] for name in ("grade", "spec", "quantity", "unit_price", "amount") if name in resolved]
    end = len(frame)
    for offset, (_, row) in enumerate(frame.iterrows()):
        if keys and not any(_text(row[key]) for key in keys):
            end = offset
            break
    return frame.iloc[:end].copy()


def _canonical_rows(frame: pd.DataFrame) -> Iterable[tuple[int, Mapping[str, Any]]]:
    selected: dict[str, str] = {}
    for column in frame.columns:
        canonical = ALIAS_LOOKUP.get(_normalized_header(column))
        if canonical and canonical not in selected:
            selected[canonical] = column
    start_row = frame.attrs.get("data_start_row", 2)
    for row_number, (_, row) in enumerate(frame.iterrows(), start=start_row):
        yield row_number, {name: row[column] for name, column in selected.items()}


def _add_issue(issues, issue_type, message, row_number, field_name=None, raw_value=None, severity="error"):
    issues.append(ImportIssue(issue_type, severity, row_number, field_name, message, _text(raw_value)))


def _validate_row(row, row_number, issues):
    values = {
        "container_id": _text(row.get("container_no")),
        "sale_date": _date(row.get("sale_date")),
        "grade_raw": _text(row.get("raw_grade")) or _text(row.get("grade")) or _text(row.get("spec")),
        "quantity": _decimal(row.get("quantity")),
        "unit_price": _decimal(row.get("unit_price")),
        "amount": _decimal(row.get("amount")),
    }
    values["grade"] = normalize_grade(values["grade_raw"])
    for field in ("container_id", "sale_date"):
        if values[field] is None:
            _add_issue(issues, "missing_field", f"缺少或无法解析字段: {field}", row_number, field)
    for field in ("quantity", "unit_price", "amount"):
        raw_value = row.get(field)
        if _text(raw_value) is not None and values[field] is None:
            _add_issue(issues, "invalid_numeric", f"数值超出范围或格式无效: {field}", row_number, field, raw_value)
    if _text(row.get("quantity")) is None:
        _add_issue(issues, "missing_field", "缺少或无法解析字段: quantity", row_number, "quantity")
    if values["grade_raw"] is None:
        _add_issue(issues, "missing_field", "缺少关键字段: grade", row_number, "grade")
    elif values["grade"] is None:
        _add_issue(issues, "unknown_grade", f"无法识别等级: {values['grade_raw']}", row_number, "grade", values["grade_raw"])
    if _text(row.get("unit_price")) is None and _text(row.get("amount")) is None:
        _add_issue(issues, "missing_field", "单价和金额不能同时缺失", row_number, "unit_price")
    return values


def _derive_money(values, row, row_number, issues):
    quantity, unit_price, amount = values["quantity"], values["unit_price"], values["amount"]
    if amount is None:
        amount = quantity * unit_price
        _add_issue(issues, "derived_amount", "金额由数量乘以单价推导", row_number, "amount", severity="warning")
    if unit_price is None and quantity != 0:
        unit_price = amount / quantity
        _add_issue(issues, "derived_unit_price", "单价由金额除以数量推导", row_number, "unit_price", severity="warning")
    if unit_price is None:
        _add_issue(issues, "missing_field", "数量为零时无法由金额推导单价", row_number, "unit_price")
        return None
    for field, value in (("quantity", quantity), ("unit_price", unit_price), ("amount", amount)):
        if not is_bounded_decimal(value):
            _add_issue(issues, "invalid_numeric", f"计算结果超出数值范围: {field}", row_number, field, value)
            return None
    if abs(quantity * unit_price - amount) > MONEY_TOLERANCE:
        _add_issue(issues, "amount_mismatch", "金额与数量乘以单价不一致", row_number, "amount", row.get("amount"), "warning")
    values.update(unit_price=unit_price, amount=amount)
    return values


def _parse_rows(frame: pd.DataFrame):
    records, issues = [], []
    for row_number, row in _canonical_rows(frame):
        before = len(issues)
        values = _validate_row(row, row_number, issues)
        if any(item.severity == "error" for item in issues[before:]):
            continue
        if not _derive_money(values, row, row_number, issues):
            continue
        records.append(_record(values, row))
    return records, issues


def _record(values, row):
    customer, remark = _text(row.get("customer")), _text(row.get("remark"))
    if customer:
        remark = f"客户: {customer}" + (f"；{remark}" if remark else "")
    return {
        "container_id": values["container_id"],
        "sale_date": values["sale_date"],
        "fruit_type": _text(row.get("fruit_name")) or "榴莲",
        "grade_raw": values["grade_raw"],
        "grade": values["grade"],
        "spec_raw": _text(row.get("spec")),
        "quantity": quantize_decimal(values["quantity"]),
        "unit_price": quantize_decimal(values["unit_price"]),
        "amount": quantize_decimal(values["amount"]),
        "remark": remark,
        "sales_region": _text(row.get("sales_region")),
    }


__all__ = [
    "ImportIssue",
    "normalize_grade",
    "read_settlement",
    "read_settlement_with_summary",
]
