from __future__ import annotations

import pytest

from app.db import Base, SessionLocal, engine
from app.models import AdminFieldConversionRule, EntryFieldOption, StandardGrade
from app.services.field_conversion import convert_grade, match_market


@pytest.fixture(autouse=True)
def clean_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


def add_rule(
    db,
    source_value: str,
    target_value: str,
    *,
    is_active: bool = True,
    sort_order: int = 0,
):
    db.add(
        AdminFieldConversionRule(
            field_key="grade",
            source_value=source_value,
            target_value=target_value,
            sort_order=sort_order,
            is_active=is_active,
            description=f"{source_value} -> {target_value}",
        )
    )
    db.commit()


def test_convert_grade_uses_active_admin_rule():
    db = SessionLocal()
    add_rule(db, "BC", "C")
    assert convert_grade(db, "bc6") == StandardGrade.C
    assert convert_grade(db, "AB6") == StandardGrade.AB
    assert convert_grade(db, "A6") == StandardGrade.A
    assert convert_grade(db, "B") == StandardGrade.B
    assert convert_grade(db, "OTHER") == StandardGrade.OTHER


def test_inactive_rule_keeps_original_value():
    db = SessionLocal()
    add_rule(db, "AB", "C", is_active=False)
    assert convert_grade(db, "AB") == StandardGrade.AB


def test_match_market_uses_contains_match():
    db = SessionLocal()
    db.add_all(
        [
            EntryFieldOption(field_key="market", value="江南", sort_order=0, is_active=True),
            EntryFieldOption(field_key="market", value="海吉星", sort_order=1, is_active=True),
        ]
    )
    db.commit()
    assert match_market(db, "江南市场") == "江南"
    assert match_market(db, "南宁海吉星市场") == "海吉星"
    assert match_market(db, "嘉兴") == "嘉兴"
