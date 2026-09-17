"""等级细分解析用例：覆盖线上真实出现的 35 种写法。"""

import pytest

from app.parser import grade_detail as grade_detail_module
from app.parser.grade_detail import (
    UNRECOGNIZED_LABEL,
    grade_detail_label,
    parse_grade_detail,
    register_fruit_grade_parser,
)


@pytest.fixture(autouse=True)
def restore_fruit_parsers():
    """注册表是模块级全局状态，测试后必须还原，避免污染其它测试。"""

    snapshot = dict(grade_detail_module._FRUIT_PARSERS)
    yield
    grade_detail_module._FRUIT_PARSERS.clear()
    grade_detail_module._FRUIT_PARSERS.update(snapshot)

REAL_RAW_VALUES = [
    "A5", "A5（19.5KG", "A5（19.5KG）", "A5(19.5KG)裂", "A5/6（熟）", "A5熟",
    "A6", "A6（19.5KG）", "A6（黄皮）", "A6熟/裂",
    "B5", "B5（19KG）", "B5（19KG）裂", "B6", "B6（19KG", "B6（19KG）",
    "B6（19KG）裂", "B6/7(19KG)", "B6/7熟", "B6熟", "B7", "B7（19KG）", "B7/5(大裂）",
    "BC5", "BC5(17KG)", "BC5/7/8（17KG）", "BC6", "BC6(17KG)", "BC7/8（17KG）",
    "BC8（17KG）", "BC9(17KG)", "C6/8熟/裂", "C6熟", "C8", "C8/9大裂",
]


@pytest.mark.parametrize("raw", REAL_RAW_VALUES)
def test_every_real_value_is_recognized(raw: str) -> None:
    """线上 35 种写法全部要能识别，不能落进「其他」。"""

    assert parse_grade_detail(raw) is not None
    assert grade_detail_label(raw) != UNRECOGNIZED_LABEL


@pytest.mark.parametrize(
    ("raw", "grade", "number"),
    [
        ("A5", "A", "5"),
        ("A6（19.5KG）", "A", "6"),
        ("A5/6（熟）", "A", "5/6"),
        ("B6/7(19KG)", "B", "6/7"),
        ("B7/5(大裂）", "B", "7/5"),
        ("BC5", "BC", "5"),
        ("BC5/7/8（17KG）", "BC", "5/7/8"),
        ("C8/9大裂", "C", "8/9"),
        ("AB6", "AB", "6"),
    ],
)
def test_scheme_a_keeps_ranges_as_is(raw: str, grade: str, number: str) -> None:
    """方案 A：区间原样成桶，不拆分也不取最小值。"""

    detail = parse_grade_detail(raw)
    assert detail is not None
    assert (detail.grade, detail.number, detail.label) == (grade, number, f"{grade}{number}")


@pytest.mark.parametrize(
    ("raw", "marks"),
    [
        ("A5(19.5KG)裂", ("裂",)),
        ("A6熟/裂", ("熟", "裂")),
        ("B7/5(大裂）", ("裂",)),
        ("A6（黄皮）", ("黄皮",)),
        ("A5", ()),
    ],
)
def test_quality_marks_do_not_change_the_bucket(raw: str, marks: tuple[str, ...]) -> None:
    """品质后缀只做标记，不改变分桶标签。"""

    detail = parse_grade_detail(raw)
    assert detail is not None
    assert detail.quality_marks == marks
    assert detail.label.startswith(detail.grade)


@pytest.mark.parametrize("raw", [None, "", "   ", "暂无等级", "特级"])
def test_unrecognized_values_fall_back(raw: str | None) -> None:
    assert grade_detail_label(raw) == UNRECOGNIZED_LABEL


@pytest.mark.parametrize("raw", ["A", "B", "AB", "C", "BC"])
def test_bare_grade_without_number_keeps_its_bucket(raw: str) -> None:
    """只写等级、没写号别时归入该等级桶，不丢进「其他」。"""

    detail = parse_grade_detail(raw)
    assert detail is not None
    assert detail.label == raw


@pytest.mark.parametrize("raw", ["BC5", "AB6"])
def test_stat_grade_override_is_used_for_bucket(raw: str) -> None:
    """明细桶保留原文号别，但大等级标签跟随调用方传入的统计等级。"""

    detail = parse_grade_detail(raw, stat_grade="C" if raw.startswith("BC") else "A")
    assert detail is not None
    assert detail.grade == ("C" if raw.startswith("BC") else "A")
    assert detail.label == f"{detail.grade}{detail.number}"


def test_fruit_type_is_pluggable() -> None:
    """新水果可注册独立规则，且与榴莲的桶互不干扰。"""

    # 山竹用「2A」这类数字在前的写法，榴莲的通用规则识别不了。
    register_fruit_grade_parser(
        "山竹", lambda raw: ("A", raw[:-1]) if raw.endswith("A") else None
    )
    detail = parse_grade_detail("2A", fruit_type="山竹")
    assert detail is not None
    assert (detail.fruit_type, detail.label) == ("山竹", "A2")
    assert parse_grade_detail("2A") is None
