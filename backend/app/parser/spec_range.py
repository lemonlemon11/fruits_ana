"""规格单元格解析：等级 / 头数 / KG / 后缀 与区间的唯一入口。

本模块是「导入链路」与「手工录单链路」共用的归一器，客户确认的 A1~A11 口径
见 ``docs/2026-09-16-导入异常数据处理确认单.md``：

- A1/A2/A3：头数区间保留，重复等级字母去掉，端点升序（``3/4``、``6/8``、``5/7``）；
- A4：三段区间原样保留（``5/7/8``），数值端点取最小与最大；
- A5：KG 区间原样保留（``9/10``、``10/11``），另出 min/max 供分析取上限；
- A6/A7：单位、全角括号统一，括号不闭合容错；
- A8/A10：括号内容不是数字时整段当后缀，乱码原样保留；
- A9：后缀只进备注，不参与计算；
- A11：没有 KG 时留空，由人工补全（不按品牌默认值自动补）。

约定：``canonical`` 落库用于展示/回显/导出，``minimum``/``maximum`` 供聚合与建索引，
三者由同一次解析产出，不允许各算各的。
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation

from .decimal_values import is_bounded_decimal

SEPARATORS = "/-~—–"
UNIT_TOKENS = ("公斤", "千克", "kgs", "kg", "斤")
DASH_ONLY = {"", "-", "—", "–", "~", "/", "无", "空"}
LEADING_GRADE_RE = re.compile(r"^\s*([A-Za-z]{1,3})")
HEAD_RANGE_RE = re.compile(r"\d+(?:\.\d+)?(?:\s*[/\-~—–]\s*\d+(?:\.\d+)?)*")
UNIT_RE = re.compile("|".join(re.escape(token) for token in UNIT_TOKENS), re.IGNORECASE)
SEPARATOR_RE = re.compile(f"[{re.escape(SEPARATORS)}]+")
LETTER_RE = re.compile(r"[A-Za-z]+")
NUMBER_RE = re.compile(r"^\d+(?:\.\d+)?$")


@dataclass(frozen=True)
class SpecRange:
    """一段规格的规范文本与数值端点。"""

    canonical: str
    minimum: Decimal
    maximum: Decimal

    @property
    def label(self) -> str:
        """分析分桶标签：与书写无关，``9-10`` / ``９／１０`` 统一成 ``9/10``。"""

        return self.canonical

    @property
    def representative(self) -> Decimal:
        """标量指标（平均规格等）用的代表值，客户口径取上限。"""

        return self.maximum


@dataclass(frozen=True)
class SpecCell:
    """规格单元格的拆分结果；非销售行的头数/KG 为空。"""

    raw: str
    grade_raw: str | None
    head_count: SpecRange | None
    spec_kg: SpecRange | None
    suffix: str
    is_sales_row: bool


def format_decimal(value: Decimal) -> str:
    """输出不带科学计数法、不补零的规范数字文本。"""

    text = format(value.normalize(), "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text or "0"


def normalize_text(value: object) -> str:
    """全角转半角、去空白；返回规范化后的原始文本。"""

    if value is None:
        return ""
    return unicodedata.normalize("NFKC", str(value)).strip()


def parse_spec_range(value: object) -> SpecRange | None:
    """把 ``9/10KG``、``9-10``、``3/4``、``10`` 解析成规范区间。

    返回 ``None`` 表示无法解析（空值、纯符号、含非数字内容），调用方必须按
    「解析不出来就标红、禁止入库」处理，不允许猜数。
    """

    text = _clean_for_range(normalize_text(value))
    if text in DASH_ONLY:
        return None

    values: list[Decimal] = []
    for part in SEPARATOR_RE.split(text):
        if not part:
            continue
        if not NUMBER_RE.match(part):
            return None
        try:
            number = Decimal(part)
        except InvalidOperation:
            return None
        if number <= 0 or not is_bounded_decimal(number):
            return None
        if number not in values:
            values.append(number)
    if not values:
        return None

    values.sort()
    return SpecRange(
        canonical="/".join(format_decimal(item) for item in values),
        minimum=values[0],
        maximum=values[-1],
    )


def split_spec_cell(value: object) -> SpecCell | None:
    """把结算单「品种(规格)」单元格拆成等级 / 头数 / KG / 后缀。

    仅用于导入链路的槽位兜底与回归校验；正式解析路径是大模型输出槽位，
    但两者都走 :func:`parse_spec_range` 归一。
    """

    text = normalize_text(value)
    if not text:
        return None

    grade_match = LEADING_GRADE_RE.match(text)
    grade_raw = grade_match.group(1).upper() if grade_match else None
    rest = text[grade_match.end():] if grade_match else text
    if grade_raw is None:
        # 没有等级字母 = 损/霉、验果抽检、硬包 等非销售行，整段留给备注。
        return SpecCell(text, None, None, None, text, is_sales_row=False)

    head_text, paren_text, tail_text = _split_parentheses(rest)
    suffix_parts: list[str] = []

    spec_kg = None
    if paren_text:
        if any(char.isdigit() for char in paren_text):
            spec_kg = parse_spec_range(paren_text)
        if spec_kg is None:
            # A8：括号里不是数字、或数字解析不出来，整段当后缀（原样保留）。
            suffix_parts.append(paren_text)

    stripped_head = LETTER_RE.sub("", head_text)
    head_match = HEAD_RANGE_RE.search(stripped_head)
    head_count = parse_spec_range(head_match.group(0)) if head_match else None
    if head_match:
        suffix_parts.append(stripped_head[head_match.end():])
    else:
        suffix_parts.append(head_text)
    if tail_text:
        suffix_parts.append(tail_text)

    suffix = "".join(part.strip() for part in suffix_parts).strip()
    return SpecCell(text, grade_raw, head_count, spec_kg, suffix, is_sales_row=True)


def _clean_for_range(text: str) -> str:
    """去掉单位与字母，只留下数字、小数点与区间连接符。"""

    cleaned = UNIT_RE.sub("", text.lower())
    cleaned = LETTER_RE.sub("", cleaned)
    return cleaned.replace(" ", "")


def _split_parentheses(text: str) -> tuple[str, str, str]:
    """按第一个 ``(`` 拆分；括号未闭合时把剩余内容都当括号内容（A7）。"""

    start = text.find("(")
    if start < 0:
        return text, "", ""
    head_text = text[:start]
    remainder = text[start + 1:]
    close = remainder.find(")")
    if close < 0:
        return head_text, remainder, ""
    return head_text, remainder[:close], remainder[close + 1:]


__all__ = [
    "SpecCell",
    "SpecRange",
    "format_decimal",
    "normalize_text",
    "parse_spec_range",
    "split_spec_cell",
]
