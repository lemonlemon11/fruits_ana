"""问答工具的执行层：把自然语言问题落到已有的分析服务上。

工具只调用 ``backend/app/services`` 下与看板同款的函数，不生成 SQL、不重算口径，
因此问答给出的数字与页面完全一致（Text-to-API 方案）。声明见 ``ask_tool_schemas.py``。
"""

from __future__ import annotations

import json
import re
import unicodedata
from datetime import date
from decimal import Decimal
from typing import Any, Callable

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models import ImportBatch, SaleRecord
from .ask_payloads import (
    compact_comparison,
    compact_detail,
    compact_overview,
    compact_ranking,
    compact_settlement_list,
)
from .ask_tool_schemas import TOOL_LABELS
from .merchant_no_naming import merchant_no_display, normalize_merchant_no
from .order_no_naming import normalize_order_no, order_no_display, series_name
from .series_analytics_service import get_series_comparison
from .settlement_analytics_service import (
    get_overview,
    get_settlement_comparison,
    get_settlement_detail,
)
from .settlement_list_service import list_settlements


# 单次工具结果塞进提示词的最大字符数，避免把整表明细交给模型。
MAX_TOOL_RESULT_CHARS = 6000
# 兜底截断时列表保留的条目数；精简载荷通常远小于这个数量。
MAX_LIST_ITEMS = 20
# 一次最多对比的结算单数量，与页面勾选上限保持一致。
MAX_COMPARE_SETTLEMENTS = 6

_LOOSE = re.compile(r"[\s\-_—–~～·．.、/\\]+")


class ToolError(RuntimeError):
    """工具参数不合法；错误信息会原样交回模型，让它自己改参数重试。"""


def _json_default(value: Any) -> Any:
    """把 Decimal / date 这类不可直接序列化的值转成 JSON 友好形式。"""

    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


def _loose(value: str) -> str:
    """去掉分隔符与全角差异后的比较键，让「香香003 / 香香-003」都能对上。"""

    return _LOOSE.sub("", unicodedata.normalize("NFKC", value)).upper()


def _parse_date(value: Any, field: str) -> date | None:
    if value in (None, ""):
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value).strip())
    except ValueError as exc:
        raise ToolError(f"{field} 需要 YYYY-MM-DD 格式，收到 {value!r}") from exc


def settlement_roster(db: Session) -> list[dict]:
    """返回系统内所有结算单的紧凑清单，用于写进提示词。"""

    rows = (
        db.query(
            ImportBatch.merchant_no,
            ImportBatch.merchant_no_normalized,
            ImportBatch.order_no,
            ImportBatch.order_no_normalized,
            func.min(SaleRecord.sale_date).label("first_date"),
            func.max(SaleRecord.sale_date).label("last_date"),
            func.count(SaleRecord.id).label("row_count"),
        )
        .join(SaleRecord, SaleRecord.import_batch_id == ImportBatch.id)
        .group_by(
            ImportBatch.merchant_no,
            ImportBatch.merchant_no_normalized,
            ImportBatch.order_no,
            ImportBatch.order_no_normalized,
        )
        .order_by(func.max(SaleRecord.sale_date).desc())
        .all()
    )
    return [
        {
            "merchant_no": row.merchant_no,
            "merchant_no_display": merchant_no_display(
                row.merchant_no, row.merchant_no_normalized
            ),
            "order_no_display": order_no_display(row.order_no, row.order_no_normalized),
            "series": series_name(row.order_no),
            "first_date": row.first_date.isoformat() if row.first_date else None,
            "last_date": row.last_date.isoformat() if row.last_date else None,
            "row_count": row.row_count,
        }
        for row in rows
    ]


def _match_keys(value: str | None) -> set[str]:
    """结算单的一个写法可能对应商号、适配后商号、单号三种口径。"""

    if not value:
        return set()
    keys = {
        _loose(value),
        _loose(normalize_merchant_no(value) or ""),
        _loose(normalize_order_no(value) or ""),
    }
    keys.discard("")
    return keys


def resolve_merchant_no(db: Session, value: str) -> str:
    """把模型给出的商号 / 单号写法解析成接口参数口径的原始商号。"""

    raw = (value or "").strip()
    if not raw:
        raise ToolError("merchant_no 不能为空，请先用 list_settlements 查商号")
    wanted = _match_keys(raw)
    batches = db.query(ImportBatch).all()
    for batch in batches:
        candidates = (
            _match_keys(batch.merchant_no)
            | _match_keys(batch.merchant_no_normalized)
            | _match_keys(batch.order_no)
            | _match_keys(batch.order_no_normalized)
        )
        if wanted & candidates:
            return batch.merchant_no
    known = "、".join(sorted({batch.merchant_no for batch in batches}))
    raise ToolError(f"没有找到「{raw}」，系统里的商号是：{known}")


def _list_settlements(db: Session, args: dict) -> Any:
    return compact_settlement_list(
        list_settlements(
            db,
            start_date=_parse_date(args.get("start_date"), "start_date"),
            end_date=_parse_date(args.get("end_date"), "end_date"),
        )
    )


def _overview(db: Session, args: dict) -> Any:
    merchant_no = args.get("merchant_no")
    return compact_overview(
        get_overview(
            db,
            start_date=_parse_date(args.get("start_date"), "start_date"),
            end_date=_parse_date(args.get("end_date"), "end_date"),
            merchant_no=resolve_merchant_no(db, merchant_no) if merchant_no else None,
        )
    )


def _rank_settlements(db: Session, args: dict) -> Any:
    return compact_ranking(
        get_settlement_comparison(
            db,
            start_date=_parse_date(args.get("start_date"), "start_date"),
            end_date=_parse_date(args.get("end_date"), "end_date"),
            include_all_settlements=True,
        )
    )


def _settlement_detail(db: Session, args: dict) -> Any:
    detail = get_settlement_detail(
        db,
        resolve_merchant_no(db, args.get("merchant_no") or ""),
        start_date=_parse_date(args.get("start_date"), "start_date"),
        end_date=_parse_date(args.get("end_date"), "end_date"),
    )
    if detail is None:
        raise ToolError("这张结算单没有销售明细")
    return compact_detail(detail)


def _compare_settlements(db: Session, args: dict) -> Any:
    values = args.get("merchant_nos") or []
    if not isinstance(values, list) or not values:
        raise ToolError("merchant_nos 需要是商号数组，先用 list_settlements 查商号")
    if len(values) > MAX_COMPARE_SETTLEMENTS:
        raise ToolError(f"一次最多对比 {MAX_COMPARE_SETTLEMENTS} 张结算单")
    merchant_nos = list(
        dict.fromkeys(resolve_merchant_no(db, str(value)) for value in values)
    )
    return compact_comparison(
        get_series_comparison(
            db,
            merchant_nos=merchant_nos,
            start_date=_parse_date(args.get("start_date"), "start_date"),
            end_date=_parse_date(args.get("end_date"), "end_date"),
        )
    )


TOOL_IMPLEMENTATIONS: dict[str, Callable[[Session, dict], Any]] = {
    "list_settlements": _list_settlements,
    "get_overview": _overview,
    "rank_settlements": _rank_settlements,
    "get_settlement_detail": _settlement_detail,
    "compare_settlements": _compare_settlements,
}


def _shrink(value: Any) -> Any:
    """兜底保护：列表过长时只保留前若干条，并说明被截断。"""

    if isinstance(value, list) and len(value) > MAX_LIST_ITEMS:
        return {
            "items": value[:MAX_LIST_ITEMS],
            "total_items": len(value),
            "note": f"结果共 {len(value)} 条，这里只列出前 {MAX_LIST_ITEMS} 条",
        }
    return value


def dump_tool_result(value: Any) -> str:
    """把工具结果序列化成提示词里的文本，超长时截断。"""

    text = json.dumps(_shrink(value), ensure_ascii=False, default=_json_default)
    if len(text) <= MAX_TOOL_RESULT_CHARS:
        return text
    return text[:MAX_TOOL_RESULT_CHARS] + "…（结果过长，已截断）"


def summarize(name: str, value: Any) -> str:
    """给前端「本次用到的数据」面板展示的一句话摘要。"""

    label = TOOL_LABELS.get(name, name)
    if isinstance(value, dict) and "error" in value:
        return f"{label}：{value['error']}"
    if isinstance(value, list):
        return f"{label}：{len(value)} 张结算单"
    if not isinstance(value, dict):
        return label
    for key in ("结算单", "所选结算单"):
        rows = value.get(key)
        if isinstance(rows, list):
            return f"{label}：{len(rows)} 张结算单"
    if value.get("商号"):
        return f"{label}：{value['商号']}，{len(value.get('各等级') or [])} 个等级"
    if isinstance(value.get("各等级"), list):
        return f"{label}：{len(value['各等级'])} 个等级"
    return label


def run_tool(db: Session, name: str, arguments: dict) -> tuple[Any, str]:
    """执行一次工具调用，返回（结果, 摘要）；失败时结果里带 ``error``。"""

    implementation = TOOL_IMPLEMENTATIONS.get(name)
    if implementation is None:
        message = f"没有名为 {name} 的工具"
        return {"error": message}, f"{message}，请改用已有工具"
    try:
        result = implementation(db, arguments)
    except ToolError as exc:
        return {"error": str(exc)}, summarize(name, {"error": str(exc)})
    except Exception as exc:  # 工具边界：把失败交回模型换参数，不打断整轮问答
        message = f"查询失败：{exc}"
        return {"error": message}, f"{TOOL_LABELS.get(name, name)}：{message}"
    return result, summarize(name, result)


__all__ = [
    "MAX_COMPARE_SETTLEMENTS",
    "TOOL_IMPLEMENTATIONS",
    "ToolError",
    "dump_tool_result",
    "resolve_merchant_no",
    "run_tool",
    "settlement_roster",
    "summarize",
]
