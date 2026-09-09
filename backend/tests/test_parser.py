from decimal import Decimal

import pandas as pd
import pytest

from app.models import StandardGrade
from app.parser.settlement_parser import normalize_grade, read_settlement
from app.parser.settlement_summary import extract_container_summary


def test_grade_normalization_includes_bc_in_c():
    assert normalize_grade("A6") == StandardGrade.A
    assert normalize_grade("B6") == StandardGrade.B
    assert normalize_grade("BC6") == StandardGrade.C
    assert normalize_grade("C6") == StandardGrade.C


def test_grade_normalization_supports_explicit_real_world_patterns():
    assert normalize_grade("B6熟") == StandardGrade.B
    assert normalize_grade("C8/9") == StandardGrade.C


def test_grade_normalization_rejects_letters_inside_words():
    for raw in ("bad", "Black Thorn", "carton"):
        assert normalize_grade(raw) is None


@pytest.mark.parametrize(
    ("field", "raw_value"),
    [
        ("quantity", "NaN"),
        ("unit_price", "Infinity"),
        ("amount", "1e999999"),
        ("quantity", "100000000000000"),
    ],
)
def test_invalid_decimal_is_reported_as_row_issue(tmp_path, field, raw_value):
    values = {"quantity": "1", "unit_price": "1", "amount": "1"}
    values[field] = raw_value
    path = tmp_path / "invalid-decimal.csv"
    path.write_text(
        "container_no,sale_date,grade,quantity,unit_price,amount\n"
        f"C1,2026-01-01,A,{values['quantity']},{values['unit_price']},{values['amount']}\n",
        encoding="utf-8",
    )

    records, issues = read_settlement(path)

    assert records == []
    assert any(
        issue.issue_type == "invalid_numeric" and issue.field_name == field
        for issue in issues
    )


def test_derived_amount_outside_numeric_range_is_rejected(tmp_path):
    path = tmp_path / "derived-overflow.csv"
    path.write_text(
        "container_no,sale_date,grade,quantity,unit_price,amount\n"
        "C1,2026-01-01,A,99999999999999,99999999999999,\n",
        encoding="utf-8",
    )

    records, issues = read_settlement(path)

    assert records == []
    assert any(issue.issue_type == "invalid_numeric" for issue in issues)


@pytest.mark.parametrize("raw_value", ["NaN", "Infinity", "1e999999", "100000000000000"])
def test_summary_ignores_invalid_decimal_values(raw_value):
    frame = pd.DataFrame([["销售金额", raw_value]])

    assert extract_container_summary(frame, "C1") is None


def test_invalid_row_isolated_and_amount_mismatch_warned(tmp_path):
    path = tmp_path / "settlement.xlsx"
    pd.DataFrame(
        [
            {"柜号": "C1", "日期": "2026-01-01", "等级": "A6", "数量": 2, "单价": 5, "金额": 11},
            {"柜号": "C1", "日期": None, "等级": "BC6", "数量": 1, "单价": 4, "金额": 4},
        ]
    ).to_excel(path, index=False)

    records, issues = read_settlement(path)

    assert len(records) == 1
    assert records[0]["amount"] == Decimal("11.0000")
    assert {issue.issue_type for issue in issues} == {
        "amount_mismatch",
        "missing_field",
    }


def test_realistic_settlement_layout_reads_metadata_and_fills_date(tmp_path):
    path = tmp_path / "realistic.xlsx"
    rows = [
        [None, "结算单"],
        [None, None],
        [None, None],
        [None, None],
        [None, None],
        [None, "柜号：", "MWCU0000001"],
        [None, None],
        [None, None],
        [None, None],
        [None, "销售日期", "品种(规格)", "数量", "单价", "金额"],
        [None, "2026-08-27", "A6(19.5KG)", 2, 500, 1000],
        [None, None, "BC6熟", 3, 300, 900],
        [None, None, None, None, None, None],
        [None, "售后", "费用合计", None, 50, 1900],
    ]
    pd.DataFrame(rows).to_excel(path, index=False, header=False)

    records, issues = read_settlement(path)

    assert not issues
    assert [record["container_id"] for record in records] == [
        "MWCU0000001",
        "MWCU0000001",
    ]
    assert records[1]["sale_date"] == records[0]["sale_date"]
    assert [record["grade"] for record in records] == [
        StandardGrade.A,
        StandardGrade.C,
    ]


def test_realistic_layout_reports_physical_excel_row_number(tmp_path):
    path = tmp_path / "realistic-warning.xlsx"
    rows = [[None] * 6 for _ in range(9)]
    rows[5][1:3] = ["柜号：", "MWCU0000002"]
    rows.extend(
        [
            [None, "销售日期", "品种(规格)", "数量", "单价", "金额"],
            [None, "2026-08-27", "A6", 2, 500, 1001],
        ]
    )
    pd.DataFrame(rows).to_excel(path, index=False, header=False)

    records, issues = read_settlement(path)

    assert len(records) == 1
    assert len(issues) == 1
    assert issues[0].issue_type == "amount_mismatch"
    assert issues[0].row_number == 11
