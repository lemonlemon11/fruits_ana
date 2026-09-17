"""字段转换规则读取与应用。"""

from __future__ import annotations

import re

from sqlalchemy.orm import Session

from ..models import AdminFieldConversionRule, EntryFieldOption, StandardGrade


GRADE_TOKEN = re.compile(r"(?i)(?<![A-Z])(BC|AB|A|B|C|D|E|F)(?![A-Z])")


def extract_grade_code(raw: str | None) -> str:
    """从原始品种文本中提取可转换的等级代码。"""

    value = (raw or "").strip()
    match = GRADE_TOKEN.search(value)
    return match.group(1).upper() if match else value.upper()


def convert_grade(db: Session, raw: str | None) -> StandardGrade:
    """按管理端启用的转换规则把原始品种映射为统计等级。"""

    if not (raw or "").strip():
        return StandardGrade.OTHER
    source_value = extract_grade_code(raw)
    rule = (
        db.query(AdminFieldConversionRule)
        .filter(
            AdminFieldConversionRule.field_key == "grade",
            AdminFieldConversionRule.source_value == source_value,
            AdminFieldConversionRule.is_active.is_(True),
        )
        .order_by(AdminFieldConversionRule.sort_order, AdminFieldConversionRule.id)
        .first()
    )
    target = rule.target_value if rule is not None else source_value
    if target in {item.value for item in StandardGrade}:
        return StandardGrade(target)
    return StandardGrade.OTHER


def active_grade_rules(db: Session) -> list[AdminFieldConversionRule]:
    """返回启用的等级转换规则，供展示与导出说明使用。"""

    return (
        db.query(AdminFieldConversionRule)
        .filter(
            AdminFieldConversionRule.field_key == "grade",
            AdminFieldConversionRule.is_active.is_(True),
        )
        .order_by(AdminFieldConversionRule.sort_order, AdminFieldConversionRule.id)
        .all()
    )


def grade_mapping_note(db: Session) -> str:
    """生成当前等级映射说明；未配置时给出中性提示。"""

    rules = active_grade_rules(db)
    if not rules:
        return "未配置等级转换规则"
    return "；".join(f"{rule.source_value}→{rule.target_value}" for rule in rules)


def match_market(db: Session, raw: str | None) -> str:
    """按管理端市场字典做包含匹配，命中后返回已配置的市场名。"""

    value = (raw or "").strip()
    if not value:
        return ""
    options = (
        db.query(EntryFieldOption)
        .filter(
            EntryFieldOption.field_key == "market",
            EntryFieldOption.is_active.is_(True),
        )
        .order_by(EntryFieldOption.sort_order, EntryFieldOption.id)
        .all()
    )
    for option in options:
        if option.value and option.value in value:
            return option.value
    return value
