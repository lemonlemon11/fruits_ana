from datetime import date
from decimal import Decimal

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.analytics import router
from app.auth import require_current_user
from app.db import Base, SessionLocal, engine
from app.models import (
    DataIssue,
    ImportBatch,
    SaleRecord,
    SettlementSummary,
    StandardGrade,
)


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


def settlement_for(db, merchant_no):
    """按商号取结算单，缺失时补建，保证明细都有结算单归属。"""

    batch = db.query(ImportBatch).filter_by(merchant_no=merchant_no).first()
    if batch is None:
        batch = ImportBatch(file_name=f"{merchant_no}.xlsx", merchant_no=merchant_no)
        db.add(batch)
        db.flush()
    return batch


def add_sale(db, merchant_no, sale_date, grade, quantity, unit_price):
    batch = settlement_for(db, merchant_no)
    quantity = Decimal(str(quantity))
    unit_price = Decimal(str(unit_price))
    sale = SaleRecord(
        import_batch_id=batch.id,
        sale_date=sale_date,
        grade=grade,
        grade_raw=grade.value,
        quantity=quantity,
        unit_price=unit_price,
        amount=quantity * unit_price,
    )
    db.add(sale)
    return sale


def add_settled_sale(db, *, merchant_no, sale_date, payable_amount):
    batch = settlement_for(db, merchant_no)
    sale = add_sale(db, merchant_no, sale_date, StandardGrade.A, 1, 10)
    db.add(
        SettlementSummary(
            import_batch_id=batch.id,
            payable_amount=Decimal(str(payable_amount)),
        )
    )
    return sale


def test_empty_overview_has_stable_shape(client):
    response = client.get("/api/analytics/overview")

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == {
        "sales_quantity": 0.0,
        "sales_amount": 0.0,
        "weighted_avg_price": None,
        "container_count": 0,
    }
    assert body["grades"] == []
    assert body["trend"] == []
    assert body["settlements"] == []
    assert body["issue_counts"]["total"] == 0


def test_standard_filters_apply_to_overview_numerator_and_denominator(client):
    with SessionLocal() as db:
        add_sale(db, "M1", date(2026, 1, 1), StandardGrade.A, 2, 10)
        add_sale(db, "M2", date(2026, 1, 2), StandardGrade.B, 8, 5)
        db.commit()

    response = client.get(
        "/api/analytics/overview",
        params={
            "start_date": "2026-01-02",
            "end_date": "2026-01-02",
            "merchant_no": "M2",
        },
    )
    body = response.json()

    assert body["total"]["sales_quantity"] == 8.0
    # 总柜数口径 = 结算单数（import_batch_id 去重），这里只有 M2 一张结算单。
    assert body["total"]["container_count"] == 1
    assert [item["grade"] for item in body["grades"]] == ["B"]
    assert body["grades"][0]["sales_quantity"] == 8.0
    assert body["grades"][0]["quantity_share"] == 1.0


def test_trend_comparison_and_settlement_detail_routes(client):
    with SessionLocal() as db:
        first = add_sale(db, "M1", date(2026, 1, 1), StandardGrade.A, 2, 10)
        add_sale(db, "M1", date(2026, 1, 2), StandardGrade.C, 1, 20)
        add_sale(db, "M2", date(2026, 1, 1), StandardGrade.B, 4, 5)
        db.query(ImportBatch).filter_by(id=first.import_batch_id).update(
            {"order_no": "香香001", "country": "越南"}
        )
        db.commit()
        first_id = first.id
        batch_id = first.import_batch_id

    trend = client.get("/api/analytics/trend", params={"merchant_no": "M1"})
    comparison = client.get(
        "/api/analytics/settlement-comparison", params={"merchant_no": "M1"}
    )
    detail = client.get("/api/analytics/settlements/M1")

    assert trend.status_code == comparison.status_code == detail.status_code == 200
    assert [item["sale_date"] for item in trend.json()["trend"]] == [
        "2026-01-01",
        "2026-01-02",
    ]
    assert [item["merchant_no"] for item in comparison.json()["settlements"]] == [
        "M1"
    ]
    assert detail.json()["merchant_no"] == "M1"
    # 详情返回国家与品牌（品牌 = brand 列优先，回退单号中文前缀），供基础信息条与规格表使用。
    assert detail.json()["country"] == "越南"
    assert detail.json()["brand"] == "香香"
    assert detail.json()["grades"][0]["sales_quantity"] == 2.0
    assert detail.json()["settlement"] == {
        "after_sales_amount": None,
        "goods_amount": None,
        "fee_amount": None,
        "customs_tax": None,
        "payable_amount": None,
    }
    assert detail.json()["records"][0] == {
        "id": first_id,
            "source_file_id": None,
            "import_batch_id": batch_id,
            "sale_date": "2026-01-01",
            "fruit_type": "榴莲",
            "variety": None,
            "grade": "A",
            "grade_raw": "A",
            "spec_raw": None,
            "piece_count": None,
            "spec_kg": None,
            "quantity": 2.0,
            "unit_price": 10.0,
            "amount": 20.0,
            "remark": None,
            "sales_region": None,
        }


def test_grade_breakdown_aggregates_all_and_scopes_by_merchant(client):
    with SessionLocal() as db:
        add_sale(db, "M1", date(2026, 1, 1), StandardGrade.A, 2, 10)
        add_sale(db, "M2", date(2026, 1, 2), StandardGrade.B, 3, 5)
        db.commit()

    all_response = client.get("/api/analytics/grade-breakdown")
    scoped_response = client.get(
        "/api/analytics/grade-breakdown", params={"merchant_no": "M1"}
    )

    assert all_response.status_code == scoped_response.status_code == 200
    assert [item["grade"] for item in all_response.json()["grades"]] == ["A", "B"]
    assert len(all_response.json()["records"]) == 2
    assert [item["grade"] for item in scoped_response.json()["grades"]] == ["A"]
    assert len(scoped_response.json()["records"]) == 1
    assert scoped_response.json()["records"][0]["grade"] == "A"


def test_settlement_detail_reads_its_batch_summary(client):
    with SessionLocal() as db:
        add_settled_sale(
            db, merchant_no="M1", sale_date=date(2026, 1, 1), payable_amount=100
        )
        add_settled_sale(
            db, merchant_no="M2", sale_date=date(2026, 2, 1), payable_amount=220
        )
        db.commit()

    first = client.get("/api/analytics/settlements/M1")
    second = client.get("/api/analytics/settlements/M2")

    assert first.json()["settlement"]["payable_amount"] == 100.0
    assert second.json()["settlement"]["payable_amount"] == 220.0


def test_settlement_detail_sales_period_follows_date_filter(client):
    with SessionLocal() as db:
        add_sale(db, "M1", date(2026, 1, 1), StandardGrade.A, 2, 10)
        add_sale(db, "M1", date(2026, 2, 5), StandardGrade.A, 3, 10)
        db.commit()

    response = client.get(
        "/api/analytics/settlements/M1",
        params={"start_date": "2026-01-01", "end_date": "2026-01-31"},
    )

    assert response.json()["sales_period"] == {
        "start_date": "2026-01-01",
        "end_date": "2026-01-01",
    }
    assert response.json()["total"]["sales_quantity"] == 2.0


def test_trend_reports_daily_container_count(client):
    with SessionLocal() as db:
        add_sale(db, "M1", date(2026, 1, 1), StandardGrade.A, 2, 10)
        add_sale(db, "M2", date(2026, 1, 1), StandardGrade.B, 1, 5)
        add_sale(db, "M1", date(2026, 1, 2), StandardGrade.A, 3, 10)
        db.commit()

    trend = client.get("/api/analytics/trend").json()["trend"]

    assert [(item["sale_date"], item["container_count"]) for item in trend] == [
        ("2026-01-01", 2),
        ("2026-01-02", 1),
    ]


def test_trend_and_overview_filter_by_country(client):
    with SessionLocal() as db:
        add_sale(db, "M1", date(2026, 1, 1), StandardGrade.A, 2, 10)
        add_sale(db, "M2", date(2026, 1, 1), StandardGrade.B, 1, 5)
        db.query(ImportBatch).filter_by(merchant_no="M1").update(
            {"order_no": "宝贝01", "country": "越南"}
        )
        db.query(ImportBatch).filter_by(merchant_no="M2").update(
            {"order_no": "香香01", "country": "泰国"}
        )
        db.commit()

    trend = client.get(
        "/api/analytics/trend", params={"country": "越南"}
    ).json()["trend"]
    overview = client.get(
        "/api/analytics/overview", params={"country": "越南"}
    ).json()

    assert len(trend) == 1
    assert trend[0]["sales_quantity"] == 2.0
    assert trend[0]["container_count"] == 1
    assert overview["total"]["sales_quantity"] == 2.0
    assert [item["merchant_no"] for item in overview["settlements"]] == ["M1"]


def test_trend_filter_by_brand_prefers_column_over_order_no_prefix(client):
    with SessionLocal() as db:
        # M1 只能靠单号前缀识别为「宝贝」；M2 的 brand 列覆盖了同前缀单号。
        add_sale(db, "M1", date(2026, 1, 1), StandardGrade.A, 2, 10)
        add_sale(db, "M2", date(2026, 1, 1), StandardGrade.B, 1, 5)
        db.query(ImportBatch).filter_by(merchant_no="M1").update(
            {"order_no": "宝贝01", "country": "越南"}
        )
        db.query(ImportBatch).filter_by(merchant_no="M2").update(
            {"order_no": "宝贝02", "country": "越南", "brand": "晴牌"}
        )
        db.commit()

    by_prefix = client.get(
        "/api/analytics/trend", params={"brand": "宝贝"}
    ).json()["trend"]
    by_column = client.get(
        "/api/analytics/trend", params={"brand": "晴牌"}
    ).json()["trend"]

    assert len(by_prefix) == 1
    assert by_prefix[0]["sales_quantity"] == 2.0
    assert by_prefix[0]["container_count"] == 1
    assert len(by_column) == 1
    assert by_column[0]["sales_quantity"] == 1.0


def test_filter_options_list_brands_and_countries(client):
    with SessionLocal() as db:
        add_sale(db, "M1", date(2026, 1, 1), StandardGrade.A, 2, 10)
        add_sale(db, "M2", date(2026, 1, 2), StandardGrade.B, 1, 5)
        add_sale(db, "M3", date(2026, 1, 3), StandardGrade.C, 1, 5)
        db.query(ImportBatch).filter_by(merchant_no="M1").update(
            {"order_no": "宝贝01", "country": "越南"}
        )
        db.query(ImportBatch).filter_by(merchant_no="M2").update(
            {"order_no": "香香01", "country": "越南"}
        )
        db.query(ImportBatch).filter_by(merchant_no="M3").update(
            {"order_no": "宝贝02", "country": "泰国"}
        )
        db.commit()

    body = client.get("/api/analytics/filter-options").json()

    assert body["brands"] == [
        {"name": "宝贝", "settlement_count": 2},
        {"name": "香香", "settlement_count": 1},
    ]
    assert body["countries"] == [
        {"name": "越南", "settlement_count": 2},
        {"name": "泰国", "settlement_count": 1},
    ]
    assert body["years"] == [2026]
    assert body["months"] == ["2026-01"]


def test_filter_options_lists_years_and_months_desc(client):
    with SessionLocal() as db:
        add_sale(db, "M1", date(2026, 9, 2), StandardGrade.A, 1, 5)
        add_sale(db, "M1", date(2025, 12, 31), StandardGrade.B, 1, 5)
        add_sale(db, "M2", date(2026, 8, 15), StandardGrade.C, 1, 5)
        db.commit()

    body = client.get("/api/analytics/filter-options").json()

    assert body["years"] == [2026, 2025]
    assert body["months"] == ["2026-09", "2026-08", "2025-12"]


def test_grade_breakdown_scopes_by_brand_and_country(client):
    with SessionLocal() as db:
        add_sale(db, "M1", date(2026, 1, 1), StandardGrade.A, 2, 10)
        add_sale(db, "M2", date(2026, 1, 1), StandardGrade.B, 3, 5)
        db.query(ImportBatch).filter_by(merchant_no="M1").update(
            {"order_no": "宝贝01", "country": "越南"}
        )
        db.query(ImportBatch).filter_by(merchant_no="M2").update(
            {"order_no": "香香01", "country": "泰国"}
        )
        db.commit()

    response = client.get(
        "/api/analytics/grade-breakdown",
        params={"brand": "宝贝", "country": "越南"},
    )

    assert [item["grade"] for item in response.json()["grades"]] == ["A"]


def test_overview_and_grade_breakdown_filter_by_market(client):
    with SessionLocal() as db:
        add_sale(db, "M1", date(2026, 1, 1), StandardGrade.A, 2, 10)
        add_sale(db, "M2", date(2026, 1, 1), StandardGrade.B, 3, 5)
        db.query(ImportBatch).filter_by(merchant_no="M1").update(
            {"market": "海吉星"}
        )
        db.query(ImportBatch).filter_by(merchant_no="M2").update(
            {"market": "江南"}
        )
        db.commit()

    overview = client.get(
        "/api/analytics/overview", params={"market": "海吉星"}
    ).json()
    breakdown = client.get(
        "/api/analytics/grade-breakdown", params={"market": "海吉星"}
    ).json()

    assert overview["total"]["sales_quantity"] == 2.0
    assert [item["merchant_no"] for item in overview["settlements"]] == ["M1"]
    assert [item["grade"] for item in breakdown["grades"]] == ["A"]


def test_filter_options_list_markets(client):
    with SessionLocal() as db:
        add_sale(db, "M1", date(2026, 1, 1), StandardGrade.A, 2, 10)
        add_sale(db, "M2", date(2026, 1, 2), StandardGrade.B, 1, 5)
        add_sale(db, "M3", date(2026, 1, 3), StandardGrade.C, 1, 5)
        db.query(ImportBatch).filter_by(merchant_no="M1").update(
            {"market": "海吉星"}
        )
        db.query(ImportBatch).filter_by(merchant_no="M2").update(
            {"market": "江南"}
        )
        db.query(ImportBatch).filter_by(merchant_no="M3").update(
            {"market": "海吉星"}
        )
        db.commit()

    body = client.get("/api/analytics/filter-options").json()

    assert body["markets"] == [
        {"name": "海吉星", "settlement_count": 2},
        {"name": "江南", "settlement_count": 1},
    ]


def test_grade_breakdown_counts_market_brand_containers(client):
    """柜数口径：按市场×品牌统计结算单（商号）数——共用柜号不折减，缺柜号也计入；
    缺市场归入「未标注市场」，跟随 market 筛选。"""

    with SessionLocal() as db:
        add_sale(db, "M1", date(2026, 1, 1), StandardGrade.A, 2, 10)
        add_sale(db, "M2", date(2026, 1, 1), StandardGrade.B, 3, 5)
        add_sale(db, "M3", date(2026, 1, 2), StandardGrade.A, 1, 10)
        db.query(ImportBatch).filter_by(merchant_no="M1").update(
            {"order_no": "香香01", "container_no": "EMCU1", "market": "海吉星"}
        )
        db.query(ImportBatch).filter_by(merchant_no="M2").update(
            {"order_no": "香香02", "container_no": "EMCU1", "market": "海吉星"}
        )
        db.query(ImportBatch).filter_by(merchant_no="M3").update(
            {"order_no": "晴牌03", "container_no": None}
        )
        db.commit()

    body = client.get("/api/analytics/grade-breakdown").json()

    assert body["market_brand_containers"] == [
        {"market": "海吉星", "brand": "香香", "container_count": 2},
        {"market": "未标注市场", "brand": "晴牌", "container_count": 1},
    ]
    scoped = client.get(
        "/api/analytics/grade-breakdown", params={"market": "海吉星"}
    ).json()
    assert scoped["market_brand_containers"] == [
        {"market": "海吉星", "brand": "香香", "container_count": 2},
    ]
    missing = client.get(
        "/api/analytics/grade-breakdown", params={"market": "不存在"}
    ).json()
    assert missing["market_brand_containers"] == []


def test_unknown_settlement_returns_404(client):
    response = client.get("/api/analytics/settlements/missing")

    assert response.status_code == 404


def test_invalid_date_range_returns_422(client):
    response = client.get(
        "/api/analytics/overview",
        params={"start_date": "2026-01-02", "end_date": "2026-01-01"},
    )

    assert response.status_code == 422


def test_issue_count_is_read_from_data_issue(client):
    with SessionLocal() as db:
        batch = settlement_for(db, "M1")
        sale = add_sale(db, "M1", date(2026, 1, 1), StandardGrade.A, 1, 10)
        db.flush()
        db.add_all(
            [
                DataIssue(
                    import_batch_id=batch.id,
                    sale_record_id=sale.id,
                    issue_type="missing_field",
                    message="missing",
                ),
                DataIssue(
                    import_batch_id=batch.id,
                    sale_record_id=sale.id,
                    issue_type="amount_mismatch",
                    message="mismatch",
                ),
                DataIssue(
                    import_batch_id=batch.id,
                    issue_type="duplicate_import",
                    message="duplicate",
                ),
            ]
        )
        db.commit()

    issues = client.get("/api/analytics/overview").json()["issue_counts"]

    assert issues == {
        "total": 3,
        "missing_field": 1,
        "amount_mismatch": 1,
        "duplicate_import": 1,
    }


def test_legacy_root_routes_are_not_created(client):
    assert client.get("/api/overview").status_code == 404
    assert client.get("/api/containers").status_code == 404
