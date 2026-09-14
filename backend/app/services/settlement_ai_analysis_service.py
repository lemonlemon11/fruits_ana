"""结算单详情的同品牌对比 AI 分析。

当前结算单与该品牌下其他结算单做等级价格对比，结论只依据后端算好的数字。
结果按「当前结算单 + 到达日期范围 + 提示词版本」缓存，避免重复调用大模型。
"""

from __future__ import annotations

import json
from datetime import date
from decimal import Decimal
from typing import Sequence

from sqlalchemy.orm import Session

from ..ai_settings import AiSettings, ai_settings
from ..models import AiAnalysis
from .ai_analysis_service import (
    AiCallFailed,
    AiNotConfigured,
    build_cache_key,
    call_chat_completion,
    read_cache,
    write_cache,
)
from .settlement_analytics_service import get_settlement_comparison

FEATURE = "settlement-detail"
PROMPT_VERSION = "v1"
MAX_PEER_SETTLEMENTS = 6

SYSTEM_PROMPT = """你是水果销售数据分析助手，服务对象是果农和档口老板，他们不看复杂报表。
只依据用户给出的数字写结论，不许编造，不许自己另算，不许把数字改成别的数值。
规则：
1. 全部用简体中文，句子要短，一句话不超过 40 个字。
2. 禁止使用「加权均价」「贡献度」「环比」「同比」「毛利率」「渗透率」这类术语；
   金额单位说「元」，单价一律说「平均每公斤售价」。
3. 严格按给定的小标题输出，标题独占一行，标题下面每条以「- 」开头，每条 1 到 2 句。
4. 平均每公斤售价保留整数（四舍五入，例如 515 元），占比写成百分比保留一位小数（例如 42.7%），
   不要写 0.4273 这种小数占比；件数和金额照抄数据里的原样。
5. 每条结论后面用括号补上依据的数字，例如（913 件、平均每公斤 515 元）。
6. 不要输出问候语、结尾套话，也不要解释你是怎么分析的。
7. 数据里没有的内容不要写，也不要自己补算新的指标。
8. 要「说透」，不要只复述数字：每个等级至少说明当前结算单比同品牌其他单据高还是低、
   差多少，并结合件数占比给出经营判断。
9. 「可以留意的地方」必须写 2 到 3 条能直接照做的事；每条都要带上数字，
   不要写「继续关注」这类空话。
小标题固定为下面 9 个，顺序不要变；数据中没有的等级要写「暂无数据」：
整体行情
A果
B果
C果
D果
E果
F果
其他
可以留意的地方"""


def _grade_payload(row: dict) -> list[dict]:
    grades = row.get("grades") or []
    return [
        {
            "等级": item.get("grade"),
            "件数": item.get("sales_quantity"),
            "金额": item.get("sales_amount"),
            "平均每公斤售价": item.get("weighted_avg_price"),
            "件数占比": item.get("quantity_share"),
        }
        for item in grades
    ]


def _settlement_payload(row: dict) -> dict:
    total = row.get("total") or {}
    return {
        "商号": row.get("merchant_no_normalized") or row.get("merchant_no"),
        "原始商号": row.get("merchant_no"),
        "单号": row.get("order_no_normalized") or row.get("order_no"),
        "品牌": row.get("series"),
        "到达日期": f"{row.get('start_date')} 至 {row.get('end_date')}",
        "总件数": total.get("sales_quantity"),
        "总金额": total.get("sales_amount"),
        "平均每公斤售价": total.get("weighted_avg_price"),
        "分等级": _grade_payload(row),
    }


def _peer_grade_benchmark(peers: Sequence[dict]) -> list[dict]:
    grades: list[dict] = []
    current_grades = peers[0].get("grades") if peers else []
    for grade in current_grades:
        rows = [
            item
            for peer in peers
            for item in (peer.get("grades") or [])
            if item.get("grade") == grade.get("grade")
        ]
        quantity = sum(Decimal(str(item.get("sales_quantity") or 0)) for item in rows)
        amount = sum(Decimal(str(item.get("sales_amount") or 0)) for item in rows)
        grades.append(
            {
                "等级": grade.get("grade"),
                "件数": float(quantity),
                "金额": float(amount),
                "平均每公斤售价": float(amount / quantity) if quantity else None,
            }
        )
    return grades


def _build_payload(current: dict, peers: Sequence[dict]) -> dict:
    return {
        "口径": "件数单位=件；金额单位=元；平均每公斤售价=销售金额÷销量（千克）（元/公斤）",
        "当前结算单": _settlement_payload(current),
        "同品牌其他结算单": [_settlement_payload(item) for item in peers],
        "同品牌其他结算单等级基准": _peer_grade_benchmark(peers),
        "样本量": {
            "同品牌结算单数量": len(peers) + 1,
            "其他结算单数量": len(peers),
        },
    }


def build_messages(payload: dict) -> list[dict]:
    data = json.dumps(payload, ensure_ascii=False, indent=2)
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                "下面是当前结算单和同品牌其他结算单的数据，请按系统要求输出经营分析。\n"
                "数字是已经算好的结果，请直接引用，不要自己重算。\n\n"
                f"数据：\n{data}"
            ),
        },
    ]


def analyze_settlement_detail(
    db: Session,
    *,
    merchant_no: str,
    start_date: date | None = None,
    end_date: date | None = None,
    refresh: bool = False,
    settings: AiSettings | None = None,
) -> dict:
    """生成（或读取缓存）当前结算单的同品牌对比 AI 分析。"""

    resolved = settings or ai_settings()
    if resolved is None:
        raise AiNotConfigured(
            "未配置大模型，请在 backend/.env 里填写 FRUIT_ANALYSIS_AI_API_KEY"
        )

    all_items = get_settlement_comparison(
        db, start_date=start_date, end_date=end_date
    )
    current = next(
        (item for item in all_items if item.get("merchant_no") == merchant_no), None
    )
    if current is None:
        raise ValueError("当前日期范围内没有该结算单数据")

    peers = [
        item
        for item in all_items
        if item.get("series") == current.get("series")
        and item.get("merchant_no") != merchant_no
    ]
    peers.sort(key=lambda item: item.get("end_date") or "", reverse=True)
    peers = peers[:MAX_PEER_SETTLEMENTS]
    if not peers:
        raise ValueError("同品牌暂无其他结算单可对比")

    merchant_nos = [merchant_no, *(item.get("merchant_no") for item in peers)]
    cache_key = build_cache_key(
        merchant_nos=merchant_nos,
        start_date=start_date,
        end_date=end_date,
        feature=FEATURE,
        prompt_version=PROMPT_VERSION,
        current_merchant_no=merchant_no,
    )
    if not refresh:
        cached = read_cache(db, cache_key)
        if cached is not None:
            return {
                "content": cached.content,
                "model": cached.model,
                "generated_at": cached.created_at.isoformat(),
                "cached": True,
            }

    payload = _build_payload(current, peers)
    content = call_chat_completion(resolved, build_messages(payload))
    row = write_cache(
        db, cache_key=cache_key, content=content, model=resolved.model, feature=FEATURE
    )
    return {
        "content": row.content,
        "model": row.model,
        "generated_at": row.created_at.isoformat(),
        "cached": False,
    }


__all__ = [
    "AiCallFailed",
    "AiNotConfigured",
    "FEATURE",
    "PROMPT_VERSION",
    "SYSTEM_PROMPT",
    "analyze_settlement_detail",
    "build_messages",
]
