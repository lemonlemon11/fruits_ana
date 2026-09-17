"""等级细分解析：把 ``grade_raw`` 拆成大等级、号别与品质标记。

口径见 ADR-013（含 2026-09-11 修订）：

- 大等级原样识别 ``A/B/AB/C/D/E/F``；统计归并由调用方用 ``stat_grade`` 显式传入，
  不再在此处写死 ``BC`` 归入 ``C``；
- 号别取字母后的数字，区间**原样保留**（``B6/7`` 就是 ``B6/7``），不拆分、不取最小值；
- 品质后缀（熟 / 裂 / 黄皮）**只做标记**，不参与分桶；
- 解析规则按果类可插拔：新水果可注册新规则，识别不出的一律归入「其他」并计数。
"""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass

UNRECOGNIZED_LABEL = "其他"
DEFAULT_FRUIT_TYPE = "榴莲"
# 「大裂」先归入「裂」，避免同一批货出现两个语义相近的标记。
QUALITY_MARKS = ("熟", "裂", "黄皮")
_QUALITY_ALIASES = {"大裂": "裂"}

_PREFIX = re.compile(r"^(BC|AB|A|B|C|D|E|F)", re.IGNORECASE)
_NUMBERS = re.compile(r"^(\d+(?:/\d+)*)")


@dataclass(frozen=True)
class GradeDetail:
    """一条销售记录的细分等级；``label`` 是用于展示与分桶的键。"""

    fruit_type: str
    grade: str
    number: str
    label: str
    quality_marks: tuple[str, ...]


FruitGradeParser = Callable[[str], tuple[str, str] | None]


def _default_parser(grade_raw: str) -> tuple[str, str] | None:
    """通用规则：字母前缀 + 数字号别，适用于榴莲等「A5 / B6/7」写法。"""

    matched = _PREFIX.match(grade_raw)
    if not matched:
        return None
    raw_grade = matched.group(1).upper()
    numbers = _NUMBERS.match(grade_raw[matched.end() :])
    # 只写等级、没写号别（如 "A"）时归入「A」桶，不当作无法识别，避免丢信息。
    return raw_grade, numbers.group(1) if numbers else ""


# 果类 → 解析规则；「*」为兜底规则，未来出现新水果时用 register_fruit_grade_parser 注册。
_FRUIT_PARSERS: dict[str, FruitGradeParser] = {"*": _default_parser}


def register_fruit_grade_parser(fruit_type: str, parser: FruitGradeParser) -> None:
    """为指定果类注册解析规则，覆盖兜底规则。"""

    _FRUIT_PARSERS[fruit_type.strip()] = parser


def _quality_marks(grade_raw: str) -> tuple[str, ...]:
    marks = []
    for mark in QUALITY_MARKS:
        if mark in grade_raw:
            marks.append(mark)
    for alias, canonical in _QUALITY_ALIASES.items():
        if alias in grade_raw and canonical not in marks:
            marks.append(canonical)
    return tuple(marks)


def parse_grade_detail(
    grade_raw: str | None,
    fruit_type: str | None = None,
    *,
    stat_grade: str | None = None,
) -> GradeDetail | None:
    """解析原始等级；无法识别时返回 ``None``（调用方归入「其他」）。

    ``stat_grade`` 用于把明细桶归入统计等级；未提供时沿用原始写法。
    """

    if not grade_raw:
        return None
    text = grade_raw.strip()
    if not text:
        return None
    resolved_fruit = (fruit_type or DEFAULT_FRUIT_TYPE).strip() or DEFAULT_FRUIT_TYPE
    parser = _FRUIT_PARSERS.get(resolved_fruit, _FRUIT_PARSERS["*"])
    parsed = parser(text)
    if parsed is None:
        return None
    raw_grade, number = parsed
    grade = (stat_grade or raw_grade).strip().upper() or raw_grade
    return GradeDetail(
        fruit_type=resolved_fruit,
        grade=grade,
        number=number,
        label=f"{grade}{number}",
        quality_marks=_quality_marks(text),
    )


def grade_detail_label(
    grade_raw: str | None,
    fruit_type: str | None = None,
    *,
    stat_grade: str | None = None,
) -> str:
    """返回分桶用的标签；识别不出时返回「其他」。"""

    detail = parse_grade_detail(grade_raw, fruit_type, stat_grade=stat_grade)
    return detail.label if detail else UNRECOGNIZED_LABEL


__all__ = [
    "DEFAULT_FRUIT_TYPE",
    "FruitGradeParser",
    "GradeDetail",
    "QUALITY_MARKS",
    "UNRECOGNIZED_LABEL",
    "grade_detail_label",
    "parse_grade_detail",
    "register_fruit_grade_parser",
]
