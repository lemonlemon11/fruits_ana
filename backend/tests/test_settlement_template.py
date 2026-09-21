"""新结算单模板解析回归。"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from app.parser.settlement_template import (
    _header_columns,
    _parse_after_sales,
    _sales_rows,
    parse_settlement_template,
)


PROJECT_ROOT = Path(__file__).resolve().parents[2]
ATTACHMENTS = PROJECT_ROOT / "attachments"


def _parse(name: str):
    return parse_settlement_template(ATTACHMENTS / name)


def test_test_data_1_parses_all_sections_and_reconciles():
    parsed = _parse("结算单模板样式-测试数据 1.xlsx")
    assert parsed.merchant_no == "单 67322"
    assert parsed.order_no == "宝贝-001"
    assert parsed.market == "江南"
    assert parsed.arrival_quantity == 2000
    assert len(parsed.sales) == 10
    assert len(parsed.after_sales) == 2
    assert len(parsed.fees) == 7
    assert parsed.computed_summary["sales_quantity"] == "2000.00"
    assert parsed.computed_summary["sales_amount"] == "262200.00"
    assert parsed.computed_summary["payable_amount"] == "257132.00"
    assert parsed.issues == []


def test_test_data_2_marks_file_quantity_mismatch():
    parsed = _parse("结算单模板样式-测试数据 2.xlsx")
    assert len(parsed.sales) == 10
    assert parsed.file_summary["sales_quantity"] == "2000.00"
    assert parsed.computed_summary["sales_quantity"] == "1000.00"
    assert any(issue.issue_type == "summary_mismatch" for issue in parsed.issues)


def test_test_data_3_marks_file_quantity_mismatch():
    parsed = _parse("结算单模板样式-测试数据 3.xlsx")
    assert parsed.merchant_no == "单 67330"
    assert parsed.computed_summary["sales_quantity"] == "2500.00"
    assert any(issue.issue_type == "summary_mismatch" for issue in parsed.issues)


def test_sales_rows_allows_blank_variety_spec_and_price():
    raw = pd.DataFrame(
        [
            ["销售日期", "品种", "规格头数", "规格KG", "备注", "数量件", "单价元", "金额元"],
            ["2026-09-13", "", "", "", "只填备注和数量", "5", "", ""],
        ]
    )
    header_index, columns = _header_columns(raw)
    issues = []

    rows = _sales_rows(raw, header_index, columns, issues)

    assert header_index == 0
    assert len(rows) == 1
    assert rows[0]["variety"] == ""
    assert rows[0]["head_count"] == ""
    assert rows[0]["spec_kg"] == ""
    assert rows[0]["sales_quantity"] == "5"
    assert rows[0]["unit_price"] == "0"
    assert not any(
        issue.field_name in {"variety", "head_count", "spec_kg"} for issue in issues
    )


def test_sales_rows_still_rejects_non_empty_invalid_spec():
    raw = pd.DataFrame(
        [
            ["销售日期", "品种", "规格头数", "规格KG", "备注", "数量件", "单价元", "金额元"],
            ["2026-09-13", "", "abc", "", "规格无效", "5", "", ""],
        ]
    )
    header_index, columns = _header_columns(raw)
    issues = []

    _sales_rows(raw, header_index, columns, issues)

    assert any(issue.field_name == "head_count" for issue in issues)


def test_after_sales_fills_blank_content_from_previous_row():
    raw = pd.DataFrame(
        [
            ["售后", "内容", "摘要", "金额"],
            ["", "坏果", "扣款", "-10"],
            ["", "", "", "-20"],
            ["", "", "", ""],
            ["", "补货", "重新上架", "5"],
        ]
    )

    rows = _parse_after_sales(raw, -1, [])

    assert [row["content"] for row in rows] == ["坏果", "坏果", "补货"]
    assert [row["amount"] for row in rows] == ["-10", "-20", "5"]
    assert rows[1]["summary"] == ""


def test_after_sales_keeps_empty_content_when_first_row_has_no_previous():
    raw = pd.DataFrame(
        [
            ["售后", "内容", "摘要", "金额"],
            ["", "", "", "10"],
        ]
    )

    rows = _parse_after_sales(raw, -1, [])

    assert len(rows) == 1
    assert rows[0]["content"] == ""
    assert rows[0]["amount"] == "10"
