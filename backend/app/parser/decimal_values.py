"""导入数值的解析及 ``Numeric(18, 4)`` 边界校验。"""

from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP, localcontext


DECIMAL_QUANTUM = Decimal("0.0001")
NUMERIC_MAX = Decimal("99999999999999.9999")
MAX_ABS_EXPONENT = 100
NUMBER_PATTERN = re.compile(
    r"[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?"
)


def parse_bounded_decimal(text: str) -> Decimal | None:
    """解析数字或带单位的数字，并拒绝无法持久化的值。"""

    cleaned = text.replace(",", "").replace("，", "")
    try:
        value = Decimal(cleaned)
    except InvalidOperation:
        match = NUMBER_PATTERN.search(cleaned)
        if not match:
            return None
        try:
            value = Decimal(match.group(0))
        except InvalidOperation:
            return None
    return value if is_bounded_decimal(value) else None


def is_bounded_decimal(value: Decimal) -> bool:
    """判断值量化后能否写入 ``Numeric(18, 4)``。"""

    if not value.is_finite():
        return False
    exponent = value.as_tuple().exponent
    if not isinstance(exponent, int) or abs(exponent) > MAX_ABS_EXPONENT:
        return False
    try:
        with localcontext() as context:
            context.prec = 40
            quantized = value.quantize(DECIMAL_QUANTUM, rounding=ROUND_HALF_UP)
    except InvalidOperation:
        return False
    return abs(quantized) <= NUMERIC_MAX


def quantize_decimal(value: Decimal) -> Decimal:
    """按数据库 scale 对已校验的值进行四舍五入。"""

    with localcontext() as context:
        context.prec = 40
        return value.quantize(DECIMAL_QUANTUM, rounding=ROUND_HALF_UP)


__all__ = ["is_bounded_decimal", "parse_bounded_decimal", "quantize_decimal"]
