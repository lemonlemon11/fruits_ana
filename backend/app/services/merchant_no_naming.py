"""结算单商号的统一命名。

填写人员对商号的写法不统一（线上 4 单为 ``单637`` / ``单624`` / ``626`` / ``640``），
「单」前缀时有时无，下拉框与表格里看起来像两套编号。系统保留原始商号
（``import_batch.merchant_no``，它同时是业务唯一键与接口参数），另外派生一个
统一展示用的商号（``import_batch.merchant_no_normalized``，见 ADR-016）。

统一规则：

1. 全角字符按 NFKC 归一化为半角，去掉首尾与中间空白；
2. 去掉开头的「单」前缀（可重复，例如 ``单单637``）；
3. 字母统一大写；
4. 去掉前缀后为空时返回原值，避免把写法改坏。

注意：本模块只服务**展示**。唯一键、接口参数与前端取值仍然使用原始 ``merchant_no``。
"""

from __future__ import annotations

import re
import unicodedata


_PREFIX = re.compile(r"^(?:单)+")
_WHITESPACE = re.compile(r"\s+")


def normalize_merchant_no(merchant_no: str | None) -> str | None:
    """把原始商号适配为统一展示写法；无法识别时返回清理后的原值。"""

    if merchant_no is None:
        return None
    raw = _WHITESPACE.sub("", unicodedata.normalize("NFKC", merchant_no))
    if not raw:
        return None
    stripped = _PREFIX.sub("", raw)
    if not stripped:
        return raw
    return stripped.upper()


def merchant_no_display(
    merchant_no: str | None, normalized: str | None = None
) -> str | None:
    """优先用已落库的适配后商号；缺失时按当前规则实时派生，兼容历史数据。"""

    return normalized or normalize_merchant_no(merchant_no)


__all__ = ["merchant_no_display", "normalize_merchant_no"]
