"""结算单单号的系列识别与统一命名。

填写人员文化程度有限，单号写法不统一（``宝贝01`` / ``宝贝003`` / ``宝贝L4`` /
``香香 01``）。系统在保留原始单号（``import_batch.order_no``）的同时，派生一个
统一显示用的适配后单号（``import_batch.order_no_normalized``），页面只展示后者，
原始写法仍可查。

统一规则（见 ADR-015）：

1. 全角字符按 NFKC 归一化为半角，去掉首尾空白；
2. 单号开头连续的中文作为系列名（与 ADR-009 的系列识别一致）；
3. 系列名之后的部分去掉空格与 ``-`` / ``_`` / ``·`` 等分隔符，字母统一大写；
4. 序号里的字母标记不参与命名（填写人员会写成 ``宝贝L4``，``L`` 不是编号的一部分），
   去掉后数字左补零到 3 位（``L4`` → ``004``）；
5. 输出 ``系列-序号``（``宝贝003`` → ``宝贝-003``）。

识别不出中文系列（例如只有 ``626``）时不做改写，原样返回，避免把未知写法改坏。
"""

from __future__ import annotations

import re
import unicodedata


UNKNOWN_SERIES = "未识别品牌"
SERIAL_WIDTH = 3

_SERIES_PREFIX = re.compile(r"^[\u4e00-\u9fff]+")
_SUFFIX = re.compile(r"^([A-Za-z]*)(\d+)$")
# 填写人员常用的分隔符与空白，统一去掉，避免「宝贝-01 / 宝贝01 / 宝贝 01」三种写法。
_SEPARATORS = " \t\u3000-_—–~～·．.、/\\"


def series_name(order_no: str | None) -> str:
    """从单号提取系列名，模板为「中文系列名 + 字母或数字后缀」。"""

    if not order_no:
        return UNKNOWN_SERIES
    matched = _SERIES_PREFIX.match(order_no.strip())
    return matched.group(0) if matched else UNKNOWN_SERIES


def normalize_order_no(order_no: str | None) -> str | None:
    """把原始单号适配为统一显示写法；无法识别时返回去空格后的原始值。"""

    if order_no is None:
        return None
    raw = unicodedata.normalize("NFKC", order_no).strip()
    if not raw:
        return None
    matched = _SERIES_PREFIX.match(raw)
    if matched is None:
        return raw
    series = matched.group(0)
    suffix = _format_suffix(raw[matched.end() :])
    if suffix is None:
        return raw
    return f"{series}-{suffix}" if suffix else series


def order_no_display(
    order_no: str | None, normalized: str | None = None
) -> str | None:
    """优先用已落库的适配后单号；缺失时按当前规则实时派生，兼容历史数据。"""

    return normalized or normalize_order_no(order_no)


def _format_suffix(value: str) -> str | None:
    """清理序号并补零；空串表示只有系列名，``None`` 表示写法无法识别。"""

    cleaned = "".join(
        character
        for character in value.upper()
        if character not in _SEPARATORS
    )
    if not cleaned:
        return ""
    if not cleaned.isalnum():
        return None
    matched = _SUFFIX.match(cleaned)
    if matched is None:
        return cleaned
    # 只保留数字：`宝贝L004` 与 `宝贝004` 是同一张单的两种写法，字母标记不进编号。
    return matched.group(2).zfill(SERIAL_WIDTH)


__all__ = [
    "SERIAL_WIDTH",
    "UNKNOWN_SERIES",
    "normalize_order_no",
    "order_no_display",
    "series_name",
]
