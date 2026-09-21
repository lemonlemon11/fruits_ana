"""多文件导入草稿与确认入库服务回归。"""

from __future__ import annotations

from decimal import Decimal
from pathlib import Path

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


def test_validate_draft_allows_remark_and_quantity_only_sale_row():
    payload = {
        "merchant_no": "637",
        "order_no": "宝贝-001",
        "container_no": "C001",
        "vehicle_no": "桂A0001",
        "market": "南宁海吉星",
        "arrival_date": "2026-09-10",
        "arrival_quantity": "20",
        "sales": [
            {
                "sale_date": "2026-09-13",
                "variety": "",
                "head_count": "",
                "spec_kg": "",
                "remark": "只填备注和数量",
                "sales_quantity": "5",
                "unit_price": "",
                "amount": "0",
            }
        ],
        "after_sales": [],
        "fees": [],
    }

    issues, computed = validate_draft_payload(payload)

    assert not any(
        issue["field"] in {"variety", "head_count", "spec_kg", "unit_price"}
        for issue in issues
    )
    assert Decimal(computed["sales_quantity"]) == Decimal("5.00")
    assert Decimal(computed["sales_amount"]) == Decimal("0.00")


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
