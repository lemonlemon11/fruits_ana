"""「等级细分」的 AI 小结：把号别阶梯交给大模型，生成面向果农的大白话结论。

复用 ``ai_analysis_service`` 的缓存与调用机制（ADR-011），只替换提示词与数据包。
缓存键包含细分口径版本（方案 A），口径变化后旧结论自动失效。
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from datetime import date

from sqlalchemy.orm import Session

from ..ai_settings import AiSettings, ai_settings
from .ai_analysis_service import (
    AiCallFailed,
    AiNotConfigured,
    MIN_TREND_SAMPLES,
    build_cache_key,
    call_chat_completion,
    read_cache,
    write_cache,
)
from .series_analytics_service import get_series_comparison

FEATURE = "grade-detail"
# 口径版本：v3 = 方案 A 分桶（单号各自成桶、区间原样成桶、品质后缀只做标记，见 ADR-013），
# 并加入大等级汇总、跨结算单 / 跨号别 / 品质标记的对比数据；
# v3-schemeA-3 = 价格文案改为整数「每件均价」，等级细分数据包同步新口径，旧缓存失效。
# v3-schemeA-2 = 单号序号不再保留字母标记（`宝贝L004` → `宝贝-004`），旧缓存失效。
PROMPT_VERSION = "v3-schemeA-5"

SYSTEM_PROMPT = """你是水果销售数据分析助手，服务对象是果农和档口老板，他们不看复杂报表。
只依据用户给出的数字写结论，不许编造，不许自己另算，不许把数字改成别的数值。
规则：
1. 全部用简体中文，句子要短，一句话不超过 40 个字。
2. 禁止使用「加权均价」「贡献度」「环比」「同比」「毛利率」这类术语；
   金额单位说「元」，单价一律说「每件均价」。
3. 严格按给定的小标题输出，标题独占一行，标题下面每条以「- 」开头，每条 1 到 2 句。
4. 每件均价保留整数（四舍五入），占比写成百分比保留一位小数，不要写 0.4273 这种小数占比；
   件数和金额照抄数据里的原样。
5. 每条结论后面用括号补上依据的数字，例如（913 件、每件均价 515 元）。
6. 不要输出问候语、结尾套话，也不要解释你是怎么分析的。
7. 数据里没有的内容不要写，也不要自己补算新的指标。
8. 「等级」指的是 A5、A6、B6/7 这类号别；带斜杠的（如 B6/7）是一段区间，原样引用，不要拆开。
9. 要「说透」，不要只复述数字：每条至少给出一个比较或一个原因。数据里已经算好
   「号别价格排名」「同级号别价格差」「同号别跨结算单价格差」「品质标记对比」，直接引用差值，
   不要再自己计算。
10. 每个小节写 2 到 3 条：
   「这批货的等级结构」只说各等级各占多少、钱主要来自哪个等级，
     直接引用「大等级汇总」，不要把号别的占比相加自己算；
   「哪个号最值钱」点名最贵的号别，并说出它比同等级最便宜的号贵多少；
   「哪个号在拖后腿」点名最便宜的号别，并说清是价低、量少，还是两者都有；
   「可以留意的地方」必须写 2 到 3 条能直接照做的事（下次怎么分选、哪个号可以试着提价、
   哪个写法要规范），每条都要带上数字，不要写「继续关注」这类空话。
11. 如果「品质标记对比」里有数据，就明确指出带熟/裂/黄皮的货比不带的贵还是便宜、差多少；
    这只是解释价格差异，不要说成单独一个等级。
12. 样本结算单少于 5 张时，只能说「这批货」的情况，禁止写「趋势」「规律」「一直」「通常」这类结论。
小标题固定为下面 4 个，顺序不要变：
这批货的等级结构
哪个号最值钱
哪个号在拖后腿
可以留意的地方"""


def _bucket_rows(details: dict) -> list[dict]:
    return [
        {
            "等级": row.get("label"),
            "大等级": row.get("grade"),
            "果类": row.get("fruit_type"),
            "件数": row.get("sales_quantity"),
            "金额": row.get("sales_amount"),
            "每件均价": row.get("weighted_avg_price"),
            "件数占比": row.get("quantity_share"),
            "金额占比": row.get("amount_share"),
            "品质标记": row.get("quality_marks") or [],
        }
        for row in details.get("buckets", [])
    ]


def build_grade_detail_payload(
    details: dict,
    *,
    settlement_count: int,
    start_date: date | None,
    end_date: date | None,
) -> dict:
    """整理成给大模型看的小数据包，并显式带上样本量。"""

    insights = details.get("insights") or {}
    return {
        "口径": (
            "件数单位=件；金额单位=元；每件均价=销售金额÷销量（件）（元/件）；"
            "等级为号别，带斜杠的表示一段区间，原样引用不要拆分。"
        ),
        "样本量": {
            "结算单数量": settlement_count,
            "是否够下趋势结论": settlement_count >= MIN_TREND_SAMPLES,
        },
        "到达日期范围": {
            "起": start_date.isoformat() if start_date else None,
            "止": end_date.isoformat() if end_date else None,
        },
        "合计": details.get("total") or {},
        "大等级汇总": insights.get("大等级汇总") or [],
        "等级阶梯": _bucket_rows(details),
        "号别价格排名": insights.get("号别价格排名") or [],
        "同级号别价格差": insights.get("同级号别价格差") or [],
        "同号别跨结算单价格差": insights.get("同号别跨结算单价格差") or [],
        "品质标记对比": insights.get("品质标记对比") or [],
        "未识别写法": details.get("unrecognized") or {},
    }


def build_grade_detail_messages(payload: dict) -> list[dict]:
    """构建发送给大模型的对话消息。"""

    data = json.dumps(payload, ensure_ascii=False, indent=2)
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                "下面是这批货的等级细分数据，请按系统要求输出结论。\n"
                "数字是已经算好的结果，请直接引用，不要自己重算。\n\n"
                f"数据：\n{data}"
            ),
        },
    ]


def analyze_grade_detail(
    db: Session,
    *,
    merchant_nos: Sequence[str],
    start_date: date | None = None,
    end_date: date | None = None,
    refresh: bool = False,
    settings: AiSettings | None = None,
) -> dict:
    """生成（或读取缓存）等级细分的 AI 小结。"""

    resolved = settings or ai_settings()
    if resolved is None:
        raise AiNotConfigured(
            "未配置大模型，请在 backend/.env 里填写 FRUIT_ANALYSIS_AI_API_KEY"
        )

    cache_key = build_cache_key(
        merchant_nos=merchant_nos,
        start_date=start_date,
        end_date=end_date,
        feature=FEATURE,
        prompt_version=PROMPT_VERSION,
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

    comparison = get_series_comparison(
        db, merchant_nos=list(merchant_nos), start_date=start_date, end_date=end_date
    )
    payload = build_grade_detail_payload(
        comparison.get("grade_details") or {},
        settlement_count=len(comparison.get("settlements") or []),
        start_date=start_date,
        end_date=end_date,
    )
    content = call_chat_completion(resolved, build_grade_detail_messages(payload))
    row = write_cache(db, cache_key=cache_key, content=content, model=resolved.model, feature=FEATURE)
    return {
        "content": row.content,
        "model": row.model,
        "generated_at": row.created_at.isoformat(),
        "cached": False,
    }


__all__ = [
    "FEATURE",
    "MIN_TREND_SAMPLES",
    "PROMPT_VERSION",
    "SYSTEM_PROMPT",
    "analyze_grade_detail",
    "build_grade_detail_messages",
    "build_grade_detail_payload",
]
