"""系列对比 AI 分析：提示词、缓存、配置缺失与上游失败的降级行为。"""

import io
import json
import urllib.error
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
from app.services import ai_analysis_service
from app.services.ai_analysis_service import (
    AiCallFailed,
    AiNotConfigured,
    SYSTEM_PROMPT,
    analyze_series_comparison,
    build_analysis_payload,
    build_cache_key,
    build_messages,
    call_chat_completion,
)

ANALYSIS_TEXT = """整体行情
- 三张结算单合计 2 847 件，平均每件 460.00 元。
A果
- A 果 913 件，平均每件 514.52 元。
B果
- B 果 1 316 件，平均每件 431.93 元。
C果
- C 果 618 件，平均每件 344.55 元。
可以留意的地方
- C 果件数占比上升，可核对小箱货比例。"""


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


def add_settlement(db, *, merchant_no, order_no, sale_date, rows):
    batch = ImportBatch(
        file_name=f"{merchant_no}.xlsx", merchant_no=merchant_no, order_no=order_no
    )
    db.add(batch)
    db.flush()
    for grade, quantity, unit_price in rows:
        quantity = Decimal(str(quantity))
        unit_price = Decimal(str(unit_price))
        db.add(
            SaleRecord(
                import_batch_id=batch.id,
                sale_date=sale_date,
                grade=grade,
                grade_raw=grade.value,
                quantity=quantity,
                unit_price=unit_price,
                amount=quantity * unit_price,
            )
        )
    return batch


def seed_two_settlements(db):
    add_settlement(
        db,
        merchant_no="M1",
        order_no="宝贝01",
        sale_date=date(2026, 8, 27),
        rows=[(StandardGrade.A, 10, 100), (StandardGrade.B, 20, 50)],
    )
    add_settlement(
        db,
        merchant_no="M2",
        order_no="宝贝02",
        sale_date=date(2026, 9, 5),
        rows=[(StandardGrade.A, 5, 200), (StandardGrade.C, 5, 40)],
    )
    db.commit()


def test_prompt_forbids_unknown_terms_and_fake_numbers():
    assert "加权均价" in SYSTEM_PROMPT
    assert "不许编造" in SYSTEM_PROMPT
    for heading in ["整体行情", "A果", "B果", "C果", "可以留意的地方"]:
        assert heading in SYSTEM_PROMPT


def test_build_messages_embeds_payload_without_recomputing():
    payload = {"合计": {"件数": 10}}
    messages = build_messages(payload)
    assert messages[0]["role"] == "system"
    assert messages[1]["role"] == "user"
    assert '"件数": 10' in messages[1]["content"]
    assert "不要自己重算" in messages[1]["content"]


def test_cache_key_ignores_order_but_not_dates():
    first = build_cache_key(
        merchant_nos=["M2", "M1"],
        start_date=date(2026, 8, 1),
        end_date=date(2026, 8, 31),
    )
    second = build_cache_key(
        merchant_nos=["M1", "M2"],
        start_date=date(2026, 8, 1),
        end_date=date(2026, 8, 31),
    )
    other = build_cache_key(
        merchant_nos=["M1", "M2"],
        start_date=date(2026, 9, 1),
        end_date=date(2026, 9, 30),
    )
    assert first == second
    assert first != other


def test_payload_keeps_grade_numbers_and_spreads():
    with SessionLocal() as db:
        seed_two_settlements(db)
        comparison = ai_analysis_service.get_series_comparison(
            db, merchant_nos=["M1", "M2"]
        )
        payload = build_analysis_payload(
            comparison, start_date=None, end_date=None
        )

    assert payload["合计"]["件数"] == 40.0
    assert payload["合计"]["金额"] == 3200.0
    grades = {row["等级"]: row for row in payload["合计"]["分等级"]}
    assert grades["A"]["件数"] == 15.0
    assert grades["A"]["金额占比"] == pytest.approx(0.625)
    assert payload["结算单"][0]["系列"] == "宝贝"
    assert payload["合计"]["价差"]["A比B贵"] == pytest.approx(83.3333)


def test_analysis_is_cached_until_refresh(monkeypatch, settings):
    calls: list[list[dict]] = []

    def fake_call(settings_arg, messages, *, timeout=None):
        calls.append(messages)
        return ANALYSIS_TEXT

    monkeypatch.setattr(ai_analysis_service, "call_chat_completion", fake_call)

    with SessionLocal() as db:
        seed_two_settlements(db)
        first = analyze_series_comparison(
            db, merchant_nos=["M1", "M2"], settings=settings
        )
        second = analyze_series_comparison(
            db, merchant_nos=["M1", "M2"], settings=settings
        )
        third = analyze_series_comparison(
            db, merchant_nos=["M2", "M1"], settings=settings, refresh=True
        )
        stored = db.query(AiAnalysis).all()

    assert first["cached"] is False
    assert second["cached"] is True
    assert first["content"] == second["content"] == ANALYSIS_TEXT
    assert third["cached"] is False
    assert len(calls) == 2
    assert len(stored) == 1


def test_missing_configuration_raises(monkeypatch):
    monkeypatch.setattr(ai_analysis_service, "ai_settings", lambda: None)
    with SessionLocal() as db, pytest.raises(AiNotConfigured):
        analyze_series_comparison(db, merchant_nos=["M1", "M2"])


def test_analysis_api_returns_content_and_marks_cache(monkeypatch, client, settings):
    monkeypatch.setattr(ai_analysis_service, "ai_settings", lambda: settings)
    monkeypatch.setattr(
        ai_analysis_service, "call_chat_completion", lambda *args, **kwargs: ANALYSIS_TEXT
    )
    with SessionLocal() as db:
        seed_two_settlements(db)

    body = {"merchant_no": ["M1", "M2"]}
    first = client.post("/api/analytics/series-comparison/analysis", json=body)
    assert first.status_code == 200
    assert first.json()["content"] == ANALYSIS_TEXT
    assert first.json()["model"] == "test-model"
    assert first.json()["cached"] is False

    second = client.post("/api/analytics/series-comparison/analysis", json=body)
    assert second.status_code == 200
    assert second.json()["cached"] is True


def test_analysis_api_rejects_single_settlement(client):
    response = client.post(
        "/api/analytics/series-comparison/analysis", json={"merchant_no": ["M1"]}
    )
    assert response.status_code == 422
    assert "至少选择两个" in response.json()["detail"]


def test_analysis_api_rejects_reversed_dates(client):
    response = client.post(
        "/api/analytics/series-comparison/analysis",
        json={
            "merchant_no": ["M1", "M2"],
            "start_date": "2026-09-30",
            "end_date": "2026-09-01",
        },
    )
    assert response.status_code == 422


def test_analysis_api_reports_missing_configuration(monkeypatch, client):
    monkeypatch.setattr(ai_analysis_service, "ai_settings", lambda: None)
    response = client.post(
        "/api/analytics/series-comparison/analysis", json={"merchant_no": ["M1", "M2"]}
    )
    assert response.status_code == 503
    assert "FRUIT_ANALYSIS_AI_API_KEY" in response.json()["detail"]


def test_analysis_api_reports_upstream_failure(monkeypatch, client, settings):
    def boom(*args, **kwargs):
        raise AiCallFailed("大模型服务返回错误（429），请稍后重试")

    monkeypatch.setattr(ai_analysis_service, "ai_settings", lambda: settings)
    monkeypatch.setattr(ai_analysis_service, "call_chat_completion", boom)
    with SessionLocal() as db:
        seed_two_settlements(db)

    response = client.post(
        "/api/analytics/series-comparison/analysis", json={"merchant_no": ["M1", "M2"]}
    )
    assert response.status_code == 502
    assert "429" in response.json()["detail"]


class _FakeResponse:
    """最小可用的 urlopen 返回值替身。"""

    def __init__(self, payload: dict):
        self._body = json.dumps(payload).encode("utf-8")

    def read(self) -> bytes:
        return self._body

    def __enter__(self) -> "_FakeResponse":
        return self

    def __exit__(self, *_: object) -> bool:
        return False


def _ok_body(content: str = "整体行情\n- 合计 40 件。") -> dict:
    return {"choices": [{"finish_reason": "stop", "message": {"content": content}}]}


def test_call_chat_completion_turns_reasoning_off(monkeypatch, settings):
    bodies: list[dict] = []

    def fake_urlopen(request, timeout=None):
        bodies.append(json.loads(request.data.decode("utf-8")))
        return _FakeResponse(_ok_body())

    monkeypatch.setattr(ai_analysis_service.urllib.request, "urlopen", fake_urlopen)
    text = call_chat_completion(settings, [{"role": "user", "content": "hi"}])

    assert text.startswith("整体行情")
    assert bodies[0]["reasoning_effort"] == "none"
    assert bodies[0]["model"] == "test-model"
    assert bodies[0]["max_tokens"] == ai_analysis_service.MAX_OUTPUT_TOKENS


def test_call_chat_completion_retries_without_unsupported_parameter(monkeypatch, settings):
    bodies: list[dict] = []

    def fake_urlopen(request, timeout=None):
        bodies.append(json.loads(request.data.decode("utf-8")))
        if len(bodies) == 1:
            raise urllib.error.HTTPError(
                request.full_url,
                400,
                "Bad Request",
                {},
                io.BytesIO(b'{"error":{"message":"unknown parameter: reasoning_effort"}}'),
            )
        return _FakeResponse(_ok_body())

    monkeypatch.setattr(ai_analysis_service.urllib.request, "urlopen", fake_urlopen)
    text = call_chat_completion(settings, [{"role": "user", "content": "hi"}])

    assert text.startswith("整体行情")
    assert len(bodies) == 2
    assert "reasoning_effort" not in bodies[1]


def test_call_chat_completion_reports_upstream_error(monkeypatch, settings):
    def fake_urlopen(request, timeout=None):
        raise urllib.error.HTTPError(
            request.full_url, 500, "Server Error", {}, io.BytesIO(b"{}")
        )

    monkeypatch.setattr(ai_analysis_service.urllib.request, "urlopen", fake_urlopen)
    with pytest.raises(AiCallFailed, match="500"):
        call_chat_completion(settings, [{"role": "user", "content": "hi"}])


def test_call_chat_completion_reports_truncated_answer(monkeypatch, settings):
    def fake_urlopen(request, timeout=None):
        return _FakeResponse(
            {
                "choices": [
                    {
                        "finish_reason": "length",
                        "message": {"content": "", "reasoning_content": "思考中……"},
                    }
                ]
            }
        )

    monkeypatch.setattr(ai_analysis_service.urllib.request, "urlopen", fake_urlopen)
    with pytest.raises(AiCallFailed, match="重新生成"):
        call_chat_completion(settings, [{"role": "user", "content": "hi"}])
