"""问答工具的声明：给大模型看的 function calling 目录。

这里只放声明与展示名称，具体执行见 ``ask_tools.py``。声明单独成文件是因为
参数描述占行数多，混在实现里会让单个模块超出仓库的 300 行上限。
"""

from __future__ import annotations

DATE_PROPERTIES: dict[str, dict] = {
    "start_date": {"type": "string", "description": "开始日期，格式 YYYY-MM-DD"},
    "end_date": {"type": "string", "description": "结束日期，格式 YYYY-MM-DD"},
}

MERCHANT_PROPERTY: dict = {
    "type": "string",
    "description": "结算单商号，必须是系统里已有的商号",
}

TOOL_LABELS: dict[str, str] = {
    "list_settlements": "结算单清单",
    "get_overview": "总览指标",
    "rank_settlements": "结算单排名对比",
    "get_settlement_detail": "单张结算单明细",
    "compare_settlements": "同品牌等级对比",
}

TOOL_SCHEMAS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "list_settlements",
            "description": (
                "列出结算单清单（商号、单号、品牌、销售日期、件数、金额）。"
                "问「有哪些单」「最近几张单」时用。"
            ),
            "parameters": {"type": "object", "properties": dict(DATE_PROPERTIES)},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_overview",
            "description": (
                "总量、总金额、平均每公斤售价与各等级表现。"
                "问「卖了多少」「平均价多少」时用。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    **DATE_PROPERTIES,
                    "merchant_no": {
                        "type": "string",
                        "description": "只看某张结算单时填它的商号，可省略",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "rank_settlements",
            "description": "按结算单汇总并排名，用于「哪张单卖得最好」「哪张单量最小」。",
            "parameters": {"type": "object", "properties": dict(DATE_PROPERTIES)},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_settlement_detail",
            "description": (
                "单张结算单的等级表现、每日趋势与经营异常，"
                "用于追问某一张单的细节。"
            ),
            "parameters": {
                "type": "object",
                "properties": {**DATE_PROPERTIES, "merchant_no": MERCHANT_PROPERTY},
                "required": ["merchant_no"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "compare_settlements",
            "description": (
                "同一品牌内多张结算单的等级对比，"
                "用于「这几张单哪个等级卖得好」。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    **DATE_PROPERTIES,
                    "merchant_nos": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "要对比的结算单商号，2 到 6 张，品牌必须相同",
                    },
                },
                "required": ["merchant_nos"],
            },
        },
    },
]


__all__ = ["TOOL_LABELS", "TOOL_SCHEMAS"]
