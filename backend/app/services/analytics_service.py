"""分析门面：实现位于 :mod:`analytics_core` 与 :mod:`settlement_analytics_service`。

保留本模块是为了让既有 import 路径继续可用；新代码应直接依赖拆分后的模块。
"""

from __future__ import annotations

from .analytics_core import DEFAULT_THRESHOLDS, AnomalyThresholds
from .analytics_core import records as _records
from .settlement_analytics_service import (
    get_daily_trend,
    get_grade_summary,
    get_issue_counts,
    get_operating_anomalies,
    get_overview,
    get_settlement,
    get_settlement_comparison,
    get_settlement_detail,
)


__all__ = [
    "DEFAULT_THRESHOLDS",
    "AnomalyThresholds",
    "_records",
    "get_daily_trend",
    "get_grade_summary",
    "get_issue_counts",
    "get_operating_anomalies",
    "get_overview",
    "get_settlement",
    "get_settlement_comparison",
    "get_settlement_detail",
]
