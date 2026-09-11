"""系列对比的 AI 分析结论：把聚合结果交给大模型，生成面向果农的中文结论。

结论只依据后端已经算好的数字，提示词里明确要求不得编造、不得改口径。
结果按「功能 + 勾选结算单 + 到达日期范围」缓存到 ``ai_analysis`` 表，避免重复付费调用。
"""

from __future__ import annotations

import hashlib
import json
import urllib.error
import urllib.request
from collections.abc import Sequence
from datetime import date
from decimal import Decimal

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..ai_settings import AiSettings, ai_settings
from ..models import AiAnalysis, utc_now
from .analytics_core import rounded
from .series_analytics_service import get_series_comparison


FEATURE = "series-comparison"
# 提示词版本参与缓存键：改动提示词后自动生成新结论，不会读到旧口径。
# v4：数据包改用适配后单号 / 适配后商号，并补充「原始单号」「原始商号」
# （ADR-015 / ADR-016），旧缓存自动失效。
PROMPT_VERSION = "v4"
# 低于该样本量时禁止下趋势/规律结论，只描述这批货本身。
MIN_TREND_SAMPLES = 5
# 部分模型会先消耗「思考」token，输出上限需要留足余量，避免正文被截断。
REQUEST_TIMEOUT_SECONDS = 180
MAX_OUTPUT_TOKENS = 4000
MAX_CONTENT_LENGTH = 8000

# 关闭「思考」（推理）后速度与费用都更稳定；个别服务商不认这个参数，会在 400 时自动去掉重试。
REASONING_OFF = {"reasoning_effort": "none"}

SYSTEM_PROMPT = """你是水果销售数据分析助手，服务对象是果农和档口老板，他们不看复杂报表。
只依据用户给出的数字写结论，不许编造，不许自己另算，不许把数字改成别的数值。
规则：
1. 全部用简体中文，句子要短，一句话不超过 40 个字。
2. 禁止使用「加权均价」「贡献度」「环比」「同比」「毛利率」「渗透率」这类术语；
   金额单位说「元」，单价一律说「平均每件售价」。
3. 严格按给定的小标题输出，标题独占一行，标题下面每条以「- 」开头，每条 1 到 2 句。
4. 平均每件售价保留两位小数（例如 514.52 元），占比写成百分比保留一位小数（例如 42.7%），
   不要写 0.4273 这种小数占比；件数和金额照抄数据里的原样。
5. 每条结论后面用括号补上依据的数字，例如（913 件、平均每件 514.52 元）。
6. 不要输出问候语、结尾套话，也不要解释你是怎么分析的。
7. 数据里没有的内容不要写，也不要自己补算新的指标。
8. 要「说透」，不要只复述数字：每条至少给出一个比较或一个原因——谁比谁高/低、
   差多少、差别可能出在哪里。数据里的「对比结论」已经把差值和排名算好了，直接引用即可。
9. A果、B果、C果三个小节各写 2 到 3 条：一条说跨结算单谁高谁低、差多少，
   一条说这个等级的件数占比和金额占比是否匹配（占比差为正说明这个等级在撑金额）。
10. 「可以留意的地方」必须写 2 到 3 条能直接照做的事，例如下一批怎么分选、
    哪个号可以试着提价、哪张单值得复盘；每条都要带上数字，不要写「继续关注」这类空话。
11. 样本结算单少于 5 张时，只能说「这批货」的情况，禁止写「趋势」「规律」「一直」「通常」。
小标题固定为下面 5 个，顺序不要变：
整体行情
A果
B果
C果
可以留意的地方"""


class AiNotConfigured(RuntimeError):
    """未配置大模型（缺少 API Key）。"""


class AiCallFailed(RuntimeError):
    """调用大模型失败。"""


def build_cache_key(
    *,
    merchant_nos: Sequence[str],
    start_date: date | None,
    end_date: date | None,
    feature: str = FEATURE,
    prompt_version: str = PROMPT_VERSION,
) -> str:
    """按功能、勾选结算单与日期范围生成缓存键。"""

    raw = json.dumps(
        {
            "feature": feature,
            "prompt_version": prompt_version,
            "merchant_nos": sorted(value.strip() for value in merchant_nos),
            "start_date": start_date.isoformat() if start_date else None,
            "end_date": end_date.isoformat() if end_date else None,
        },
        ensure_ascii=False,
        sort_keys=True,
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:48]


def _grade_rows(aggregate: dict) -> list[dict]:
    amount_shares = aggregate.get("grade_amount_shares") or {}
    rows = []
    for row in aggregate.get("grades", []):
        quantity_share = row["quantity_share"]
        amount_share = amount_shares.get(row["grade"])
        rows.append(
            {
                "等级": row["grade"],
                "件数": row["sales_quantity"],
                "金额": row["sales_amount"],
                "平均每件售价": row["weighted_avg_price"],
                "件数占比": quantity_share,
                "金额占比": amount_share,
                # 占比差为正说明这个等级卖得比它的数量更值钱（在撑金额）。
                "金额占比减件数占比": _share_gap(amount_share, quantity_share),
            }
        )
    return rows


def _share_gap(amount_share: float | None, quantity_share: float | None) -> float | None:
    """金额占比与件数占比之差；用 Decimal 相减避免浮点误差写进给大模型的数字里。"""

    if amount_share is None or quantity_share is None:
        return None
    return rounded(
        Decimal(str(amount_share)) - Decimal(str(quantity_share))
    )


def _price_of(row: dict) -> float | None:
    return (row.get("total") or {}).get("weighted_avg_price")


def _settlement_price_ranking(comparison: dict) -> list[dict]:
    """各结算单按平均每件售价排名，并给出与本次平均的差，方便直接引用。"""

    average = ((comparison.get("total") or {}).get("total") or {}).get("weighted_avg_price")
    rows = []
    for row in comparison.get("settlements", []):
        price = _price_of(row)
        if price is None:
            continue
        rows.append(
            {
                "商号": row.get("merchant_no_normalized") or row.get("merchant_no"),
                "原始商号": row.get("merchant_no"),
                "系列": row.get("series"),
                "件数": (row.get("total") or {}).get("sales_quantity"),
                "平均每件售价": price,
                "比本次平均高": (
                    rounded(Decimal(str(price)) - Decimal(str(average)))
                    if average is not None
                    else None
                ),
            }
        )
    rows.sort(key=lambda item: item["平均每件售价"], reverse=True)
    return rows


def _comparison_insights(comparison: dict) -> dict:
    """后端先算好的对比结论：排名、极值差、等级结构信号。"""

    aggregate = comparison.get("total") or {}
    ranking = _settlement_price_ranking(comparison)
    return {
        "本次平均每件售价": (aggregate.get("total") or {}).get("weighted_avg_price"),
        "结算单价差排名": ranking,
        "最高比最低每件贵": (
            rounded(Decimal(str(ranking[0]["平均每件售价"])) - Decimal(str(ranking[-1]["平均每件售价"])))
            if len(ranking) >= 2
            else None
        ),
        "等级结构信号": [
            {
                "等级": row["等级"],
                "件数占比": row["件数占比"],
                "金额占比": row["金额占比"],
                "金额占比减件数占比": row["金额占比减件数占比"],
            }
            for row in _grade_rows(aggregate)
        ],
    }


def _spread_row(aggregate: dict) -> dict:
    spread = aggregate.get("spread") or {}
    prices = spread.get("grade_prices") or {}
    return {
        "A平均每件售价": prices.get("A"),
        "B平均每件售价": prices.get("B"),
        "C平均每件售价": prices.get("C"),
        "A比B贵": spread.get("a_minus_b"),
        "B比C贵": spread.get("b_minus_c"),
        "B比A便宜的比例": spread.get("b_discount_vs_a"),
    }


def _aggregate_payload(aggregate: dict) -> dict:
    total = aggregate.get("total") or {}
    return {
        "件数": total.get("sales_quantity"),
        "金额": total.get("sales_amount"),
        "平均每件售价": total.get("weighted_avg_price"),
        "分等级": _grade_rows(aggregate),
        "价差": _spread_row(aggregate),
    }


def _date_text(value: date | None) -> str | None:
    return value.isoformat() if value else None


def build_analysis_payload(
    comparison: dict, *, start_date: date | None, end_date: date | None
) -> dict:
    """把对比结果整理成给大模型看的小数据包，只保留结论需要的数字。"""

    settlements = comparison.get("settlements") or []
    return {
        "口径": "件数单位=件；金额单位=元；平均每件售价=销售金额÷件数（元/件）",
        "样本量": {
            "结算单数量": len(settlements),
            "是否够下趋势结论": len(settlements) >= MIN_TREND_SAMPLES,
        },
        "到达日期范围": {
            "起": _date_text(start_date),
            "止": _date_text(end_date),
        },
        "合计": _aggregate_payload(comparison.get("total") or {}),
        "结算单": [
            {
                "系列": row.get("series"),
                "单号": row.get("order_no_normalized") or row.get("order_no"),
                "原始单号": row.get("order_no"),
                "商号": row.get("merchant_no_normalized") or row.get("merchant_no"),
                "原始商号": row.get("merchant_no"),
                "到达日期": f"{row.get('start_date')} 至 {row.get('end_date')}",
                **_aggregate_payload(row),
            }
            for row in settlements
        ],
        "系列汇总": [
            {
                "系列": row.get("name"),
                "结算单数量": row.get("settlement_count"),
                **_aggregate_payload(row),
            }
            for row in comparison.get("series", [])
        ],
        "对比结论": _comparison_insights(comparison),
    }


def build_messages(payload: dict) -> list[dict]:
    """构建发送给大模型的对话消息。"""

    data = json.dumps(payload, ensure_ascii=False, indent=2)
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                "下面是本次要分析的结算单数据，请按系统要求输出结论。\n"
                "数字是已经算好的结果，请直接引用，不要自己重算。\n\n"
                f"数据：\n{data}"
            ),
        },
    ]


class _UnsupportedParameter(RuntimeError):
    """服务商不认识某个请求参数。"""


def _post_json(settings: AiSettings, payload: dict, timeout: int) -> dict:
    """发送一次对话补全请求，返回解析后的 JSON。"""

    request = urllib.request.Request(
        settings.chat_completions_url(),
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": f"Bearer {settings.api_key}",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = ""
        try:
            detail = exc.read().decode("utf-8", "ignore")
        except Exception:  # pragma: no cover - 读取失败不影响错误提示
            detail = ""
        unsupported = [key for key in REASONING_OFF if key in detail]
        if exc.code == 400 and unsupported:
            raise _UnsupportedParameter(unsupported[0]) from exc
        raise AiCallFailed(f"大模型服务返回错误（{exc.code}），请稍后重试") from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise AiCallFailed("暂时连不上大模型服务，请稍后重试") from exc
    except json.JSONDecodeError as exc:
        raise AiCallFailed("大模型返回的内容无法解析，请稍后重试") from exc


def call_chat_completion(
    settings: AiSettings,
    messages: list[dict],
    *,
    timeout: int = REQUEST_TIMEOUT_SECONDS,
) -> str:
    """调用 OpenAI 兼容的对话补全接口，返回结论文本。"""

    payload = {
        "model": settings.model,
        "messages": messages,
        "temperature": 0.3,
        "max_tokens": MAX_OUTPUT_TOKENS,
        "stream": False,
        **REASONING_OFF,
    }
    try:
        body = _post_json(settings, payload, timeout)
    except _UnsupportedParameter:
        payload = {key: value for key, value in payload.items() if key not in REASONING_OFF}
        body = _post_json(settings, payload, timeout)

    choices = body.get("choices") or []
    choice = choices[0] if choices else {}
    message = choice.get("message") or {}
    content = message.get("content")
    if not isinstance(content, str) or not content.strip():
        if choice.get("finish_reason") == "length" or message.get("reasoning_content"):
            raise AiCallFailed("大模型这次没写完正文，请点一次重新生成")
        raise AiCallFailed("大模型没有返回结论，请稍后重试")
    return content.strip()[:MAX_CONTENT_LENGTH]


def read_cache(db: Session, cache_key: str) -> AiAnalysis | None:
    return db.query(AiAnalysis).filter(AiAnalysis.cache_key == cache_key).one_or_none()


def write_cache(
    db: Session,
    *,
    cache_key: str,
    content: str,
    model: str,
    feature: str = FEATURE,
) -> AiAnalysis:
    """写入或覆盖缓存；并发写入冲突时回退为更新已有记录。"""

    row = read_cache(db, cache_key)
    if row is not None:
        row.content = content
        row.model = model
        row.created_at = utc_now()
    else:
        row = AiAnalysis(
            cache_key=cache_key, feature=feature, model=model, content=content
        )
        db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        row = read_cache(db, cache_key)
        if row is None:
            raise
        row.content = content
        row.model = model
        row.created_at = utc_now()
        db.commit()
    db.refresh(row)
    return row


def analyze_series_comparison(
    db: Session,
    *,
    merchant_nos: Sequence[str],
    start_date: date | None = None,
    end_date: date | None = None,
    refresh: bool = False,
    settings: AiSettings | None = None,
) -> dict:
    """生成（或读取缓存）系列对比的 AI 分析结论。"""

    resolved = settings or ai_settings()
    if resolved is None:
        raise AiNotConfigured(
            "未配置大模型，请在项目根目录 .env 里填写 FRUIT_ANALYSIS_AI_API_KEY"
        )

    cache_key = build_cache_key(
        merchant_nos=merchant_nos, start_date=start_date, end_date=end_date
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
    payload = build_analysis_payload(
        comparison, start_date=start_date, end_date=end_date
    )
    content = call_chat_completion(resolved, build_messages(payload))
    row = write_cache(
        db, cache_key=cache_key, content=content, model=resolved.model
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
    "MIN_TREND_SAMPLES",
    "PROMPT_VERSION",
    "SYSTEM_PROMPT",
    "analyze_series_comparison",
    "build_analysis_payload",
    "build_cache_key",
    "build_messages",
    "call_chat_completion",
    "read_cache",
    "write_cache",
]
