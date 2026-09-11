"""等级细分 AI 小结：提示词约束、样本量、缓存与接口校验。"""

from datetime import date
from decimal import Decimal

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.ai_settings import AiSettings
from app.api.analytics import router
from app.auth import require_current_user
from app.db import Base, SessionLocal, engine
from app.models import AiAnalysis, ImportBatch, SaleRecord, StandardGrade
from app.services import grade_detail_analysis_service
from app.services.ai_analysis_service import AiNotConfigured
from app.services.grade_detail_analysis_service import (
    MIN_TREND_SAMPLES,
    SYSTEM_PROMPT,
    analyze_grade_detail,
    build_grade_detail_messages,
    build_grade_detail_payload,
)

SUMMARY_TEXT = """这批货的等级结构
- 两张结算单合计 40 件，平均每件 75.00 元。
哪个号最值钱
- A6 平均每件 100.00 元，是这批货里最贵的。
哪个号在拖后腿
- C8 平均每件 30.00 元。
可以留意的地方
- B6/7 是一段区间，建议按区间核算。"""


@pytest.fixture(autouse=True)
def clean_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[require_current_user] = lambda: object()
    return TestClient(app)


@pytest.fixture
def settings():
    return AiSettings(
        api_key="test-key", base_url="https://example.invalid", model="test-model"
    )


def seed_settlements(db) -> None:
    """两张结算单，覆盖单号别与区间写法。"""

    rows = [
        ("单001", "宝贝01", [("A6", StandardGrade.A, 10, 100), ("B6/7", StandardGrade.B, 10, 40)]),
        ("单002", "宝贝02", [("C8", StandardGrade.C, 10, 30), ("A6熟", StandardGrade.A, 10, 80)]),
    ]
    for merchant_no, order_no, items in rows:
        batch = ImportBatch(file_name=f"{merchant_no}.xlsx", merchant_no=merchant_no, order_no=order_no)
        db.add(batch)
        db.flush()
        for grade_raw, grade, quantity, unit_price in items:
            quantity, unit_price = Decimal(quantity), Decimal(unit_price)
            db.add(
                SaleRecord(
                    import_batch_id=batch.id,
                    sale_date=date(2026, 9, 1),
                    grade_raw=grade_raw,
                    grade=grade,
                    quantity=quantity,
                    unit_price=unit_price,
                    amount=quantity * unit_price,
                )
            )
    db.commit()


def test_prompt_uses_own_headings_and_forbids_trend_on_small_samples():
    assert "不许编造" in SYSTEM_PROMPT
    for heading in ["这批货的等级结构", "哪个号最值钱", "哪个号在拖后腿", "可以留意的地方"]:
        assert heading in SYSTEM_PROMPT
    assert "趋势" in SYSTEM_PROMPT
    assert MIN_TREND_SAMPLES == 5
    # 提示词必须要求说透并给可执行建议，而不是复述数字。
    assert "同级号别价差" in SYSTEM_PROMPT
    assert "不要写「继续关注」这类空话" in SYSTEM_PROMPT


def test_payload_includes_backend_computed_comparisons():
    """深入分析依赖后端算好的对比，模型只做引用。"""

    with SessionLocal() as db:
        seed_settlements(db)
        comparison = grade_detail_analysis_service.get_series_comparison(
            db, merchant_nos=["单001", "单002"]
        )
        payload = build_grade_detail_payload(
            comparison["grade_details"],
            settlement_count=len(comparison["settlements"]),
            start_date=None,
            end_date=None,
        )

    assert [row["号别"] for row in payload["号别价格排名"]]
    for key in ["大等级汇总", "同级号别价差", "同号别跨结算单价差", "品质标记对比"]:
        assert key in payload
    # 大等级占比由后端算好，模型不需要自己加号别。
    rollup = {row["大等级"]: row for row in payload["大等级汇总"]}
    assert rollup["A"]["件数"] == 20.0
    assert rollup["A"]["平均每件售价"] == pytest.approx((10 * 100 + 10 * 80) / 20)
    # A6 在两张结算单都出现，且其中一张带「熟」标记，两个对比都应有数据。
    cross = next(row for row in payload["同号别跨结算单价差"] if row["号别"] == "A6")
    assert cross["相差"] == pytest.approx(20.0)
    marks = next(row for row in payload["品质标记对比"] if row["号别"] == "A6")
    assert marks["带标记平均每件售价"] == 80.0
    assert marks["无标记平均每件售价"] == 100.0


def test_payload_carries_sample_size_and_keeps_ranges_intact():
    with SessionLocal() as db:
        seed_settlements(db)
        comparison = grade_detail_analysis_service.get_series_comparison(
            db, merchant_nos=["单001", "单002"]
        )
        payload = build_grade_detail_payload(
            comparison["grade_details"],
            settlement_count=len(comparison["settlements"]),
            start_date=None,
            end_date=None,
        )

    assert payload["样本量"] == {"结算单数量": 2, "是否够下趋势结论": False}
    labels = [row["等级"] for row in payload["等级阶梯"]]
    assert "B6/7" in labels, "区间必须原样保留，不能拆成 B6 与 B7"
    bucket = next(row for row in payload["等级阶梯"] if row["等级"] == "A6")
    assert bucket["件数"] == 20.0
    assert bucket["平均每件售价"] == 90.0
    assert bucket["品质标记"] == ["熟"]


def test_build_messages_embeds_payload_without_recomputing():
    messages = build_grade_detail_messages({"样本量": {"结算单数量": 2}})
    assert messages[0]["role"] == "system"
    assert messages[1]["role"] == "user"
    assert "不要自己重算" in messages[1]["content"]


def test_analysis_is_cached_until_refresh(monkeypatch, settings):
    calls: list[list[dict]] = []

    def fake_call(settings_arg, messages, *, timeout=None):
        calls.append(messages)
        return SUMMARY_TEXT

    monkeypatch.setattr(grade_detail_analysis_service, "call_chat_completion", fake_call)

    with SessionLocal() as db:
        seed_settlements(db)
        first = analyze_grade_detail(db, merchant_nos=["单001", "单002"], settings=settings)
        second = analyze_grade_detail(db, merchant_nos=["单001", "单002"], settings=settings)
        third = analyze_grade_detail(
            db, merchant_nos=["单002", "单001"], settings=settings, refresh=True
        )
        stored = db.query(AiAnalysis).all()

    assert first["cached"] is False
    assert second["cached"] is True
    assert third["cached"] is False
    assert len(calls) == 2
    assert len(stored) == 1
    assert stored[0].feature == "grade-detail"


def test_missing_configuration_raises(monkeypatch):
    monkeypatch.setattr(grade_detail_analysis_service, "ai_settings", lambda: None)
    with SessionLocal() as db, pytest.raises(AiNotConfigured):
        analyze_grade_detail(db, merchant_nos=["单001", "单002"])


def test_api_returns_content(monkeypatch, client, settings):
    monkeypatch.setattr(grade_detail_analysis_service, "ai_settings", lambda: settings)
    monkeypatch.setattr(
        grade_detail_analysis_service,
        "call_chat_completion",
        lambda *args, **kwargs: SUMMARY_TEXT,
    )

    with SessionLocal() as db:
        seed_settlements(db)

    response = client.post(
        "/api/analytics/grade-detail/analysis",
        json={"merchant_no": ["单001", "单002"]},
    )

    assert response.status_code == 200
    assert response.json()["content"] == SUMMARY_TEXT


def test_api_rejects_too_few_settlements(client):
    response = client.post(
        "/api/analytics/grade-detail/analysis", json={"merchant_no": ["单001"]}
    )

    assert response.status_code == 422
    assert "至少选择两个结算单" in response.json()["detail"]
