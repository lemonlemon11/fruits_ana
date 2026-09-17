"""规格归一（A1~A11）与真实文件 501 行回归。"""

from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path

import pytest

from app.parser.spec_range import parse_spec_range, split_spec_cell


FIXTURE = Path(__file__).parent / "fixtures" / "spec_cells_2026-09-16.json"
SAMPLES = json.loads(FIXTURE.read_text(encoding="utf-8"))


@pytest.mark.parametrize(
    ("raw", "canonical", "minimum", "maximum"),
    [
        # A1 头数区间原样保留
        ("3/4", "3/4", "3", "4"),
        # A2 区间里重复等级字母 → 去掉
        ("B3/B4", "3/4", "3", "4"),
        ("C6/C8", "6/8", "6", "8"),
        # A3 降序 → 升序
        ("7/5", "5/7", "5", "7"),
        # A4 三段原样保留，端点取最小/最大
        ("5/7/8", "5/7/8", "5", "8"),
        # A5 KG 区间原样保留
        ("9/10", "9/10", "9", "10"),
        ("10/11", "10/11", "10", "11"),
        # A6 去单位、全角转半角
        ("１０ＫＧ", "10", "10", "10"),
        ("9/10KG", "9/10", "9", "10"),
        ("19.5公斤", "19.5", "19.5", "19.5"),
        # 连接符统一成半角斜杠
        ("9-10", "9/10", "9", "10"),
        ("9~10", "9/10", "9", "10"),
        ("9—10", "9/10", "9", "10"),
        # 单值不补斜杠
        ("10", "10", "10", "10"),
    ],
)
def test_parse_spec_range_normalizes_confirmed_variants(raw, canonical, minimum, maximum):
    parsed = parse_spec_range(raw)

    assert parsed is not None
    assert parsed.canonical == canonical
    assert parsed.minimum == Decimal(minimum)
    assert parsed.maximum == Decimal(maximum)
    assert parsed.label == canonical


@pytest.mark.parametrize("raw", ["", "   ", "—", "-", "无", "硬包", "10+11", "0", "A"])
def test_parse_spec_range_rejects_unparsable_values(raw):
    assert parse_spec_range(raw) is None


@pytest.mark.parametrize(
    ("raw", "grade", "head", "kg", "suffix"),
    [
        # 真实样例：括号里是 KG
        ("A3/4(10KG)", "A", "3/4", "10", ""),
        ("B3/B4（9KG）", "B", "3/4", "9", ""),
        ("C6/C8(17KG)", "C", "6/8", "17", ""),
        ("BC5/7/8（17KG）", "BC", "5/7/8", "17", ""),
        ("A3（9/10KG)尾", "A", "3", "9/10", "尾"),
        ("A3(10/11KG)Y硬包/不售后", "A", "3", "10/11", "Y硬包/不售后"),
        # A7 括号未闭合
        ("A5（19.5KG", "A", "5", "19.5", ""),
        ("A3/4（10KG", "A", "3/4", "10", ""),
        # A8 括号里装的是后缀
        ("B7/5(大裂）", "B", "5/7", None, "大裂"),
        ("A5/6（熟）", "A", "5/6", None, "熟"),
        ("A6（黄皮）", "A", "6", None, "黄皮"),
        # A11 整行没有 KG：留空，交给人工补全
        ("B6/7熟", "B", "6/7", None, "熟"),
        ("C8/9大裂", "C", "8/9", None, "大裂"),
        ("BC6", "BC", "6", None, ""),
        # 后缀带 `/` 也要整段进备注（A9）
        ("B3/4(9KG)尾/微裂", "B", "3/4", "9", "尾/微裂"),
    ],
)
def test_split_spec_cell_slots(raw, grade, head, kg, suffix):
    cell = split_spec_cell(raw)

    assert cell is not None
    assert cell.is_sales_row is True
    assert cell.grade_raw == grade
    assert (cell.head_count.canonical if cell.head_count else None) == head
    assert (cell.spec_kg.canonical if cell.spec_kg else None) == kg
    assert cell.suffix == suffix


@pytest.mark.parametrize("raw", ["损/霉", "损/少果", "验果抽检", "补果", "硬包/白肉", "霉果", "夹肉/溶"])
def test_split_spec_cell_marks_non_sales_rows(raw):
    cell = split_spec_cell(raw)

    assert cell is not None
    assert cell.is_sales_row is False
    assert cell.head_count is None and cell.spec_kg is None
    assert cell.suffix == raw


def test_fixture_samples_never_raise_and_cover_real_shapes():
    """tickets/ 17 个 xlsx 的 501 行销售规格冻结为回归集。"""

    sales_rows = [split_spec_cell(item["raw"]) for item in SAMPLES]
    sales_rows = [cell for cell in sales_rows if cell is not None and cell.is_sales_row]

    assert len(sales_rows) == 501
    # 头数必须全部解析出来，否则录入与分析都会断档。
    assert all(cell.head_count is not None for cell in sales_rows)
    # A11：67 行没有 KG，留空等人工补全，不允许自动填品牌默认值。
    assert sum(1 for cell in sales_rows if cell.spec_kg is None) == 67
    # A5：KG 区间的 4 行必须原样保留。
    kg_ranges = sorted(cell.spec_kg.canonical for cell in sales_rows if cell.spec_kg and cell.spec_kg.minimum != cell.spec_kg.maximum)
    assert kg_ranges == ["10/11", "9/10", "9/10", "9/10"]
    # A1~A4：头数区间的写法全部收敛成升序文本（``B7/5`` → ``5/7``、``BC5/7/8`` → ``5/7/8``）。
    head_ranges = {cell.head_count.canonical for cell in sales_rows if cell.head_count.minimum != cell.head_count.maximum}
    assert head_ranges == {"3/4", "5/6", "5/7", "5/7/8", "6/7", "6/8", "7/8", "8/9"}
    # KG 只有单值与区间两种形态，单位/全角/连接符都已收敛。
    assert {cell.spec_kg.canonical for cell in sales_rows if cell.spec_kg} == {
        "9", "9/10", "10", "10/11", "11", "17", "19", "19.5",
    }


def test_review_flag_helpers_document_a11_missing_kg():
    """A11：有等级/头数但没有 KG 的行要能被标红（缺 KG 才标，非销售行不标）。"""

    from app.parser.settlement_parser import _spec_columns

    missing = _spec_columns("B6/7熟")
    present = _spec_columns("A3/4(10KG)")
    non_sales = _spec_columns("验果抽检")

    assert missing["needs_review"] is True
    assert missing["review_note"] == "缺少规格（KG），需人工补全"
    assert present["needs_review"] is False
    assert non_sales["needs_review"] is False
