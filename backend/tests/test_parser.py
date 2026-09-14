from decimal import Decimal

import openpyxl
import pandas as pd
import pytest

from app.models import StandardGrade
from app.parser.settlement_parser import (
    SettlementParseError,
    normalize_grade,
    parse_settlement,
    read_settlement,
)
from app.parser.settlement_summary import extract_settlement_summary


def test_grade_normalization_includes_bc_in_c():
    assert normalize_grade("A6") == StandardGrade.A
    assert normalize_grade("B6") == StandardGrade.B
    assert normalize_grade("BC6") == StandardGrade.C
    assert normalize_grade("C6") == StandardGrade.C


def test_grade_normalization_supports_explicit_real_world_patterns():
    assert normalize_grade("B6熟") == StandardGrade.B
    assert normalize_grade("C8/9") == StandardGrade.C


def test_grade_normalization_falls_back_to_other_for_unrecognized_words():
    for raw in ("bad", "Black Thorn", "carton"):
        assert normalize_grade(raw) == StandardGrade.OTHER


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
        "商号,sale_date,grade,quantity,unit_price,amount\n"
        f"单624,2026-01-01,A,{values['quantity']},{values['unit_price']},{values['amount']}\n",
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
        "商号,sale_date,grade,quantity,unit_price,amount\n"
        "单624,2026-01-01,A,99999999999999,99999999999999,\n",
        encoding="utf-8",
    )

    records, issues = read_settlement(path)

    assert records == []
    assert any(issue.issue_type == "invalid_numeric" for issue in issues)


@pytest.mark.parametrize("raw_value", ["NaN", "Infinity", "1e999999", "100000000000000"])
def test_summary_ignores_invalid_decimal_values(raw_value):
    frame = pd.DataFrame([["销售金额", raw_value]])

    assert extract_settlement_summary(frame) is None


def test_invalid_row_isolated_and_amount_mismatch_warned(tmp_path):
    path = tmp_path / "settlement.xlsx"
    pd.DataFrame(
        [
            {"商号": "单624", "日期": "2026-01-01", "等级": "A6", "数量": 2, "单价": 5, "金额": 11},
            {"商号": "单624", "日期": None, "等级": "BC6", "数量": 1, "单价": 4, "金额": 4},
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
        [None, "商号：", "单624"],
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

    parsed = parse_settlement(path)

    assert not parsed.issues
    assert parsed.meta.merchant_no == "单624"
    assert parsed.meta.container_no == "MWCU0000001"
    assert "container_id" not in parsed.records[0]
    assert parsed.records[1]["sale_date"] == parsed.records[0]["sale_date"]
    assert [record["grade"] for record in parsed.records] == [
        StandardGrade.A,
        StandardGrade.C,
    ]


def test_realistic_layout_reports_physical_excel_row_number(tmp_path):
    path = tmp_path / "realistic-warning.xlsx"
    rows = [[None] * 6 for _ in range(9)]
    rows[4][1:3] = ["商号：", "单624"]
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


def write_settlement_xlsx(path, *, merchant_no="单624", container_no="MWCU1823691",
                          order_no="宝贝01", vehicle_no="桂AAB087"):
    """按真实结算单版式写出 B5/B6/B7/B8 元数据与一行销售数据。"""

    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet["B2"] = "结 算 单"
    if merchant_no is not None:
        sheet["B5"], sheet["C5"] = "商号：", merchant_no
    if container_no is not None:
        sheet["B6"], sheet["C6"] = "柜号：", container_no
    if order_no is not None:
        sheet["B7"], sheet["C7"] = "单号：", order_no
    if vehicle_no is not None:
        sheet["B8"], sheet["C8"] = "转运公司：", vehicle_no
    sheet["B10"], sheet["C10"], sheet["D10"], sheet["E10"], sheet["F10"] = (
        "销售日期", "品种(规格)", "数量", "单价", "金额",
    )
    sheet["B11"], sheet["C11"], sheet["D11"], sheet["E11"], sheet["F11"] = (
        "2026-08-27", "B6", 3, 450, 1350,
    )
    workbook.save(path)
    return path


def test_parse_settlement_reads_metadata(tmp_path):
    parsed = parse_settlement(write_settlement_xlsx(tmp_path / "one.xlsx"))

    assert parsed.meta.merchant_no == "单624"
    assert parsed.meta.order_no == "宝贝01"
    assert parsed.meta.container_no == "MWCU1823691"
    assert parsed.meta.vehicle_no == "桂AAB087"
    assert len(parsed.records) == 1
    assert parsed.records[0]["amount"] == Decimal("1350.0000")


def test_parse_settlement_allows_missing_container(tmp_path):
    parsed = parse_settlement(
        write_settlement_xlsx(tmp_path / "no-container.xlsx", container_no=None)
    )

    assert parsed.meta.container_no is None
    assert len(parsed.records) == 1


def test_parse_settlement_requires_merchant_no(tmp_path):
    path = write_settlement_xlsx(tmp_path / "no-merchant.xlsx", merchant_no=None)

    with pytest.raises(SettlementParseError, match="缺少商号"):
        parse_settlement(path)


def test_parse_settlement_reads_csv_merchant_column(tmp_path):
    path = tmp_path / "sales.csv"
    path.write_text(
        "商号,单号,柜号,转运公司,销售日期,品种(规格),数量,单价,金额\n"
        "单624,宝贝01,MWCU1823691,桂AAB087,2026-08-27,B6,3,450,1350\n",
        encoding="utf-8-sig",
    )

    parsed = parse_settlement(path)

    assert parsed.meta.merchant_no == "单624"
    assert parsed.meta.order_no == "宝贝01"
    assert parsed.meta.container_no == "MWCU1823691"
    assert parsed.meta.vehicle_no == "桂AAB087"


def test_parse_settlement_rejects_multiple_merchant_numbers(tmp_path):
    path = tmp_path / "multi-merchant.csv"
    path.write_text(
        "商号,销售日期,等级,数量,单价,金额\n"
        "单624,2026-08-01,A,1,2,2\n"
        "单637,2026-08-02,A,1,2,2\n",
        encoding="utf-8-sig",
    )

    with pytest.raises(SettlementParseError, match="多个商号"):
        parse_settlement(path)
