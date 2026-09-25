"""多文件导入草稿与确认入库服务回归。"""

from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import pytest

from app.db import Base, SessionLocal, engine
from app.models import ImportBatch, ImportDraft, ImportJob, SaleRecord, SettlementSummary
from app.parser.settlement_template import parse_settlement_template
from app.services.import_draft_service import (
    confirm_import_job,
    create_import_job,
    get_import_draft,
    get_import_job,
    update_import_draft,
    validate_draft_payload,
)


PROJECT_ROOT = Path(__file__).resolve().parents[2]
ATTACHMENTS = PROJECT_ROOT / "attachments"


@pytest.fixture(autouse=True)
def clean_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


def _parsed_files():
    files = []
    for name in [
        "结算单模板样式-测试数据 1.xlsx",
        "结算单模板样式-测试数据 2.xlsx",
        "结算单模板样式-测试数据 3.xlsx",
    ]:
        parsed = parse_settlement_template(ATTACHMENTS / name)
        files.append((parsed, name, name[:64], str(ATTACHMENTS / name)))
    return files


def test_create_and_confirm_three_files_writes_three_batches():
    db = SessionLocal()
    job = create_import_job(db, _parsed_files(), None)
    db.commit()

    assert db.query(ImportJob).count() == 1
    assert db.query(ImportDraft).count() == 3
    assert job["draft_count"] == 3

    result = confirm_import_job(db, job["token"], force=False, user_id=None)
    assert result["status"] == "confirmed"
    assert len(result["confirmed"]) == 3
    assert db.query(ImportBatch).count() == 3
    assert db.query(SaleRecord).count() == 28
    assert db.query(SettlementSummary).count() == 3


def test_update_draft_increments_version_and_revalidates():
    db = SessionLocal()
    job = create_import_job(db, _parsed_files(), None)
    db.commit()
    draft = get_import_draft(db, job["token"], job["drafts"][0]["token"])
    assert draft["version"] == 1

    payload = draft["payload"]
    payload["sales"][1]["sales_quantity"] = "999"
    updated = update_import_draft(
        db, job["token"], draft["draft_token"], payload, None
    )
    assert updated["version"] == 2
    assert any(issue["code"] == "amount_mismatch" for issue in updated["payload"]["issues"])


def test_validate_abnormal_row_allows_remark_quantity_and_price_with_blank_spec():
    payload = _sales_payload(
        [
            {
                "sale_date": "2026-09-13",
                "variety": "金枕",
                "grade": "",
                "head_count": "",
                "spec_kg": "",
                "remark": "只填备注",
                "sales_quantity": "5",
                "unit_price": "12.5",
                "amount": "62.5",
            }
        ]
    )
    issues, computed = validate_draft_payload(payload)
    sales_errors = [
        item for item in issues
        if item.get("section") == "sales" and item["severity"] == "error"
    ]
    assert sales_errors == []
    assert Decimal(computed["sales_quantity"]) == Decimal("5.00")
    assert Decimal(computed["sales_amount"]) == Decimal("62.50")


def test_confirm_without_force_is_blocked_by_error_draft():
    db = SessionLocal()
    job = create_import_job(db, _parsed_files(), None)
    db.commit()
    first = get_import_draft(db, job["token"], job["drafts"][0]["token"])
    payload = first["payload"]
    payload["sales"][0]["sale_date"] = ""
    update_import_draft(db, job["token"], first["draft_token"], payload, None)
    with pytest.raises(ValueError):
        confirm_import_job(db, job["token"], force=False, user_id=None)


def test_confirm_duplicate_merchant_blocks_without_force_and_keeps_last_on_force():
    db = SessionLocal()
    files = _parsed_files()
    duplicate_parsed = files[0][0]
    files.append((duplicate_parsed, "结算单模板样式-测试数据 4.xlsx", "dup-hash", str(ATTACHMENTS / files[0][1])))
    job = create_import_job(db, files, None)
    db.commit()

    with pytest.raises(ValueError) as blocked:
        confirm_import_job(db, job["token"], force=False, user_id=None)
    detail = blocked.value.args[0]
    assert "同一导入任务内商号重复" in detail

    result = confirm_import_job(db, job["token"], force=True, user_id=None)
    assert result["status"] == "confirmed"
    assert len(result["confirmed"]) == 3
    assert db.query(ImportBatch).count() == 3


def _sales_payload(sales):
    return {
        "merchant_no": "637",
        "order_no": "宝贝-001",
        "container_no": "C001",
        "vehicle_no": "桂A0001",
        "country": "越南",
        "market": "南宁海吉星",
        "arrival_date": "2026-09-10",
        "arrival_quantity": "20",
        "sales": sales,
        "after_sales": [],
        "fees": [],
    }


def _full_sale_row(**overrides):
    row = {
        "sale_date": "2026-09-13",
        "variety": "金枕",
        "grade": "A",
        "head_count": "3/4",
        "spec_kg": "10",
        "sales_quantity": "5",
        "unit_price": "12.5",
        "amount": "62.5",
        "remark": "",
    }
    row.update(overrides)
    return row


def test_validate_full_sale_row_has_no_sales_errors():
    issues, _ = validate_draft_payload(_sales_payload([_full_sale_row()]))
    sales_errors = [
        item
        for item in issues
        if item.get("section") == "sales" and item["severity"] == "error"
    ]
    assert sales_errors == []


def test_validate_abnormal_row_missing_required_fields():
    payload = _sales_payload(
        [
            {
                "sale_date": "2026-09-13",
                "variety": "",
                "grade": "",
                "head_count": "",
                "spec_kg": "",
                "remark": "只填备注",
                "sales_quantity": "5",
                "unit_price": "12.5",
                "amount": "62.5",
            }
        ]
    )
    issues, _ = validate_draft_payload(payload)
    missing = {
        item["field"]
        for item in issues
        if item.get("code") == "missing_field" and item.get("section") == "sales"
    }
    assert missing == {"variety"}


def test_validate_spec_and_remark_row_follows_normal_rule():
    payload = _sales_payload([_full_sale_row(remark="裂口")])
    issues, _ = validate_draft_payload(payload)
    sales_errors = [
        item
        for item in issues
        if item.get("section") == "sales" and item["severity"] == "error"
    ]
    assert sales_errors == []


def test_validate_spec_and_remark_row_requires_variety():
    payload = _sales_payload(
        [_full_sale_row(variety="", remark="裂口")]
    )
    issues, _ = validate_draft_payload(payload)
    missing = {
        item["field"]
        for item in issues
        if item.get("code") == "missing_field" and item.get("section") == "sales"
    }
    assert missing == {"variety"}


def test_validate_partial_sale_row_flags_missing_item_fields():
    payload = _sales_payload(
        [
            {
                "sale_date": "2026-09-13",
                "variety": "金枕",
                "grade": "",
                "head_count": "",
                "spec_kg": "",
                "remark": "",
                "sales_quantity": "5",
                "unit_price": "12.5",
                "amount": "62.5",
            }
        ]
    )
    issues, _ = validate_draft_payload(payload)
    missing = {
        item["field"]
        for item in issues
        if item.get("code") == "missing_field" and item.get("section") == "sales"
    }
    assert missing == {"grade", "head_count", "spec_kg"}


def test_validate_full_sale_row_requires_unit_price():
    payload = _sales_payload([_full_sale_row(unit_price="", amount="0")])
    issues, _ = validate_draft_payload(payload)
    assert any(
        item.get("field") == "unit_price" and item.get("code") == "missing_field"
        for item in issues
    )


def test_validate_empty_sale_row_is_invalid():
    payload = _sales_payload(
        [
            {
                "sale_date": "",
                "variety": "",
                "grade": "",
                "head_count": "",
                "spec_kg": "",
                "remark": "",
                "sales_quantity": "",
                "unit_price": "",
                "amount": "",
            }
        ]
    )
    issues, _ = validate_draft_payload(payload)
    assert any(item.get("code") == "invalid_sales_row" for item in issues)


def test_validate_kg_range_is_rejected():
    payload = _sales_payload([_full_sale_row(spec_kg="9/10")])
    issues, _ = validate_draft_payload(payload)
    assert any(
        item.get("field") == "spec_kg" and item.get("code") == "invalid_spec"
        for item in issues
    )


def test_confirm_hard_sales_error_blocks_even_with_force():
    db = SessionLocal()
    job = ImportJob(token=uuid4().hex, status="pending", file_count=1, draft_count=1)
    db.add(job)
    db.flush()
    payload = _sales_payload(
        [
            {
                "sale_date": "",
                "variety": "",
                "grade": "",
                "head_count": "",
                "spec_kg": "",
                "remark": "",
                "sales_quantity": "5",
                "unit_price": "12.5",
                "amount": "62.5",
            }
        ]
    )
    draft = ImportDraft(
        import_job_id=job.id,
        token=uuid4().hex,
        version=1,
        file_name="a.xlsx",
        status="pending",
        payload=json.dumps(payload, ensure_ascii=False),
        issue_count=0,
    )
    db.add(draft)
    db.commit()

    with pytest.raises(ValueError) as blocked:
        confirm_import_job(db, job.token, force=True, user_id=None)
    detail = blocked.value.args[0]
    assert "hard_blockers" in detail
