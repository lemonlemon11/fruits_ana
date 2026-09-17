"""新结算单模板解析回归。"""

from __future__ import annotations

from pathlib import Path

from app.parser.settlement_template import parse_settlement_template


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
