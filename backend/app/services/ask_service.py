"""自然语言问答：模型负责选工具与措辞，数字一律来自后端已算好的结果。

沿用 ADR-014 的口径原则：不让模型写 SQL、不让模型重算指标，
工具结果来自 ``ask_tools`` 里与看板同款的分析服务，因此答案和页面数字一致。
"""

from __future__ import annotations

import json
from datetime import date
from typing import Any, Sequence

from sqlalchemy.orm import Session

from ..ai_settings import AiSettings, ai_settings
from .ai_analysis_service import (
    AiCallFailed,
    AiNotConfigured,
    chat_completion_choice,
)
from .ask_tool_schemas import TOOL_SCHEMAS
from .ask_tools import dump_tool_result, run_tool, settlement_roster


# 一次问答最多允许的工具轮次，防止模型来回空转。
MAX_ROUNDS = 3
# 历史消息最多回带条数，控制提示词体积。
MAX_HISTORY_MESSAGES = 6
# 问答正文比分析结论短，留太多反而更容易跑题。
MAX_OUTPUT_TOKENS = 1600
REQUEST_TIMEOUT_SECONDS = 180

ASK_SYSTEM_PROMPT = """你是「水果销售数据问答助手」，服务对象是果农和档口老板，他们不看复杂报表。

你可以调用工具读取系统数据：结算单清单、总览指标、结算单排名、单张结算单明细、同品牌等级对比。
调用工具时，商号一栏直接填数据里给出的「商号」值。

规则：
1. 先用工具拿到数字再回答；工具没返回的数字，一个都不许写。
2. 回答里每个数字都必须能在工具结果里原样找到，不许自己相加、重算、估算或凑一个数。
3. 全部用简体中文，短句，一句话不超过 40 个字。
4. 不要说「加权均价」「环比」「同比」「贡献度」这类术语；单价一律说「平均每公斤售价」。
5. 涉及对比要说清谁高谁低、差多少；占比写成百分比保留一位小数。
6. 件数与金额照抄工具返回的数字，不要写成大概值。
7. 需要多张单或整个品牌的合计时，用 compare_settlements 取里面的「品牌汇总 / 合计」，
   不要把 list_settlements 的逐单数字自己相加。
8. 问某个品牌或某张单时，只用带筛选条件的结果，不要拿全系统的数字代替。
9. 系统里没有的数据（采购成本、利润、销售地区、天气、行情预测）直接说「系统里没有这类数据」，
   不要推测，也不要拿别的数字替代。
10. 问题缺了必要信息（比如没说哪张单）时，先反问一句让用户补全，不要自己猜一个去查。
11. 正文用 2 到 5 条以「- 」开头的短句，不要写问候语、结尾套话，也不要解释你是怎么分析的。"""


def _roster_prompt(rows: Sequence[dict]) -> str:
    if not rows:
        return "系统里目前没有任何结算单数据。"
    lines = ["系统里的结算单（商号 | 单号 | 品牌 | 销售日期 | 明细行数）："]
    lines.extend(
        " | ".join(
            str(value)
            for value in (
                row["merchant_no"],
                row["order_no_display"],
                row["series"],
                f"{row['first_date']}~{row['last_date']}",
                row["row_count"],
            )
        )
        for row in rows
    )
    return "\n".join(lines)


def build_system_prompt(db: Session) -> str:
    """系统提示词：固定规则 + 当前结算单清单 + 今天日期。"""

    return (
        f"{ASK_SYSTEM_PROMPT}\n\n"
        f"{_roster_prompt(settlement_roster(db))}\n\n"
        f"今天日期：{date.today().isoformat()}。"
    )


def _sanitize_history(history: Sequence[dict]) -> list[dict]:
    """只保留 user/assistant 文本，避免前端传进来的结构污染提示词。"""

    messages: list[dict] = []
    for item in history:
        role = str(item.get("role", "")).strip()
        content = str(item.get("content", "")).strip()
        if role in {"user", "assistant"} and content:
            messages.append({"role": role, "content": content})
    return messages[-MAX_HISTORY_MESSAGES:]


def _echo_assistant(message: dict) -> dict:
    """把模型返回的 tool_calls 原样回填成 assistant 消息。"""

    calls = []
    for call in message.get("tool_calls") or []:
        function = call.get("function") or {}
        calls.append(
            {
                "id": call.get("id"),
                "type": "function",
                "function": {
                    "name": function.get("name"),
                    "arguments": function.get("arguments") or "{}",
                },
            }
        )
    return {"role": "assistant", "content": message.get("content") or "", "tool_calls": calls}


def _parse_arguments(raw: Any) -> dict:
    if isinstance(raw, dict):
        return raw
    try:
        parsed = json.loads(raw or "{}")
    except (TypeError, ValueError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _answer_of(message: dict) -> str:
    """取出正文；空正文按「没写完」处理，交给调用方决定是否重试。"""

    content = message.get("content")
    if isinstance(content, str) and content.strip():
        return content.strip()
    if message.get("reasoning_content"):
        raise AiCallFailed("大模型这次没写完正文，请再问一次")
    return ""


def _request(settings: AiSettings, messages: list[dict], tools: list[dict] | None) -> dict:
    choice = chat_completion_choice(
        settings,
        messages,
        tools=tools,
        max_tokens=MAX_OUTPUT_TOKENS,
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    return choice.get("message") or {}


def _collect_tool_steps(db: Session, message: dict, messages: list[dict]) -> list[dict]:
    """执行模型请求的全部工具，把结果回填进对话，返回给前端展示的步骤。"""

    messages.append(_echo_assistant(message))
    steps: list[dict] = []
    for call in message.get("tool_calls") or []:
        function = call.get("function") or {}
        name = str(function.get("name") or "")
        arguments = _parse_arguments(function.get("arguments"))
        result, summary = run_tool(db, name, arguments)
        steps.append({"tool": name, "args": arguments, "summary": summary})
        messages.append(
            {
                "role": "tool",
                "tool_call_id": call.get("id"),
                "content": dump_tool_result(result),
            }
        )
    return steps


def answer_question(
    db: Session,
    *,
    question: str,
    history: Sequence[dict] = (),
    settings: AiSettings | None = None,
) -> dict:
    """回答一个问题，返回正文、调用过的工具与模型名。"""

    resolved = settings or ai_settings()
    if resolved is None:
        raise AiNotConfigured(
            "未配置大模型，请在 backend/.env 里填写 FRUIT_ANALYSIS_AI_API_KEY"
        )

    messages = [
        {"role": "system", "content": build_system_prompt(db)},
        *_sanitize_history(history),
        {"role": "user", "content": question},
    ]
    steps: list[dict] = []
    for _ in range(MAX_ROUNDS):
        message = _request(resolved, messages, TOOL_SCHEMAS)
        if not message.get("tool_calls"):
            answer = _answer_of(message)
            if not answer:
                raise AiCallFailed("大模型没有返回回答，请再问一次")
            return {"answer": answer, "steps": steps, "model": resolved.model}
        steps.extend(_collect_tool_steps(db, message, messages))

    messages.append(
        {
            "role": "user",
            "content": "请直接根据上面已返回的数据回答我刚才的问题，不要再调用工具。",
        }
    )
    answer = _answer_of(_request(resolved, messages, None))
    if not answer:
        raise AiCallFailed("大模型连续调用工具但没有给出结论，请换一种问法")
    return {"answer": answer, "steps": steps, "model": resolved.model}


__all__ = ["ASK_SYSTEM_PROMPT", "answer_question", "build_system_prompt"]
