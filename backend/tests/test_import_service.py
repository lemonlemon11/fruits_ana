from datetime import date
from decimal import Decimal

import pytest
import pandas as pd
from sqlalchemy.engine import make_url

from app.db import Base, DATABASE_URL, SessionLocal, engine
from app.services.import_service import import_file
from app.models import AdminFieldConversionRule, DataIssue, ImportBatch, SaleRecord, SettlementSummary, SourceFile


@pytest.fixture(autouse=True)
def clean_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


def write_csv(tmp_path, content: str):
    """写 CSV fixture，并自动补齐商号列（商号为结算单唯一键）。"""

    header, *rows = content.strip().splitlines()
    path = tmp_path / "sales.csv"
    lines = [f"商号,{header}", *[f"单624,{row}" for row in rows]]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8-sig")
    return path


def test_pytest_database_uses_isolated_data_database():
    database_path = make_url(DATABASE_URL).database

    assert database_path is not None
    assert database_path.endswith("/.pytest-tmp/fruit-analysis-test.sqlite3")


def test_import_hashes_file_without_reading_it_all_at_once(tmp_path, monkeypatch):
    path = write_csv(
        tmp_path,
        "container_no,sale_date,grade,quantity,unit_price,amount\n"
        "C000,2026-08-01,A,1,2,2\n",
    )
    monkeypatch.setattr(
        type(path),
        "read_bytes",
        lambda _path: (_ for _ in ()).throw(AssertionError("read_bytes called")),
    )
    db = SessionLocal()

    result = import_file(db, path)

    assert result.status == "success"
    db.close()


def test_csv_success_imports_normalized_sales(tmp_path):
    path = write_csv(
        tmp_path,
        "货柜号,销售日期,品种,等级,规格,数量,单价,金额,客户,销售地区,备注\n"
        "C001,2026-08-01,榴莲,A6,4-5头,10,12.50,125,客户甲,华东,正常\n",
    )
    db = SessionLocal()
    result = import_file(db, path)

    assert result.status == "success"
    assert result.success_count == 1
    record = db.query(SaleRecord).one()
    assert db.query(ImportBatch).one().merchant_no == "单624"
    assert record.sale_date == date(2026, 8, 1)
    assert record.grade_raw == "A6"
    assert record.grade.value == "A"
    assert record.quantity == Decimal("10")
    assert record.unit_price == Decimal("12.5000")
    assert record.amount == Decimal("125.0000")
    assert "客户甲" in (record.remark or "")
    db.close()


def test_import_keeps_raw_order_no_and_stores_normalized_order_no(tmp_path):
    path = tmp_path / "sales.csv"
    path.write_text(
        "商号,单号,货柜号,销售日期,等级,数量,单价,金额\n"
        "单624,宝贝 01,C001,2026-08-01,A,1,2,2\n",
        encoding="utf-8-sig",
    )
    db = SessionLocal()

    result = import_file(db, path)

    assert result.status == "success"
    assert result.order_no == "宝贝 01"
    assert result.order_no_normalized == "宝贝-001"
    assert result.merchant_no == "单624"
    assert result.merchant_no_normalized == "624"
    assert result.to_dict()["order_no_normalized"] == "宝贝-001"
    assert result.to_dict()["merchant_no_normalized"] == "624"
    batch = db.query(ImportBatch).one()
    assert batch.merchant_no == "单624"
    assert batch.merchant_no_normalized == "624"
    assert batch.order_no == "宝贝 01"
    assert batch.order_no_normalized == "宝贝-001"
    db.close()


def test_bc_grade_maps_to_c_and_preserves_raw_value(tmp_path):
    path = write_csv(
        tmp_path,
        "container_no,sale_date,fruit_name,grade,quantity,unit_price,amount\n"
        "C002,2026/08/02,Durian,BC6,2,20,40\n",
    )
    db = SessionLocal()
    db.add(
        AdminFieldConversionRule(
            field_key="grade",
            source_value="BC",
            target_value="C",
            sort_order=0,
            is_active=True,
        )
    )
    db.commit()
    import_file(db, path)

    record = db.query(SaleRecord).one()
    assert record.grade.value == "C"
    assert record.grade_raw == "BC6"
    db.close()


def test_missing_amount_is_derived_from_quantity_and_unit_price(tmp_path):
    path = write_csv(
        tmp_path,
        "container_no,sale_date,grade,quantity,unit_price,amount\n"
        "C003,2026-08-03,B,2.5,8.40,\n",
    )
    db = SessionLocal()
    result = import_file(db, path)

    assert result.success_count == 1
    assert db.query(SaleRecord).one().amount == Decimal("21.0000")
    assert db.query(DataIssue).filter_by(issue_type="derived_amount").count() == 1
    db.close()


def test_missing_unit_price_is_derived_from_amount(tmp_path):
    path = write_csv(
        tmp_path,
        "container_no,sale_date,grade,quantity,unit_price,amount\n"
        "C004,2026-08-04,C,2.5,,21.00\n",
    )
    db = SessionLocal()
    result = import_file(db, path)

    assert result.success_count == 1
    assert db.query(SaleRecord).one().unit_price == Decimal("8.4000")
    assert db.query(DataIssue).filter_by(issue_type="derived_unit_price").count() == 1
    db.close()


def test_same_merchant_no_returns_conflict_without_changes(tmp_path):
    path = write_csv(
        tmp_path,
        "container_no,sale_date,grade,quantity,unit_price,amount\n"
        "C005,2026-08-05,A,1,2,2\n",
    )
    changed = tmp_path / "changed.csv"
    changed.write_text(
        "商号,container_no,sale_date,grade,quantity,unit_price,amount\n"
        "单624,C005,2026-08-06,A,5,2,10\n",
        encoding="utf-8-sig",
    )
    db = SessionLocal()
    first = import_file(db, path)

    second = import_file(db, changed)

    assert first.status == "success"
    assert second.status == "conflict"
    assert second.batch_id == first.batch_id
    assert second.existing_batch_id == first.batch_id
    assert second.merchant_no == "单624"
    assert db.query(SourceFile).count() == 1
    assert db.query(ImportBatch).count() == 1
    assert db.query(SaleRecord).count() == 1
    db.close()


def test_overwrite_replaces_previous_batch(tmp_path):
    path = write_csv(
        tmp_path,
        "container_no,sale_date,grade,quantity,unit_price,amount\n"
        "C005,2026-08-05,A,1,2,2\n",
    )
    changed = tmp_path / "changed.csv"
    changed.write_text(
        "商号,container_no,sale_date,grade,quantity,unit_price,amount\n"
        "单624,C005,2026-08-06,A,5,2,10\n",
        encoding="utf-8-sig",
    )
    db = SessionLocal()
    first = import_file(db, path)

    replaced = import_file(db, changed, overwrite=True)

    assert replaced.status == "success"
    assert replaced.obsolete_storage_path == str(path)
    assert db.query(ImportBatch).filter_by(merchant_no="单624").count() == 1
    assert first.batch_id is not None
    assert db.query(ImportBatch).one().success_count == 1
    assert [row.quantity for row in db.query(SaleRecord).all()] == [Decimal("5.0000")]
    assert db.query(SourceFile).count() == 1
    db.close()


def test_import_refuses_to_overwrite_manual_batch(tmp_path):
    db = SessionLocal()
    db.add(
        ImportBatch(
            merchant_no="单624",
            merchant_no_normalized="624",
            source_type="manual",
            status="success",
            success_count=1,
            warning_count=0,
            failure_count=0,
        )
    )
    db.commit()
    path = write_csv(
        tmp_path,
        "container_no,sale_date,grade,quantity,unit_price,amount\n"
        "C005,2026-08-05,A,1,2,2\n",
    )

    result = import_file(db, path, overwrite=True)

    assert result.status == "conflict"
    assert "手工录单占用" in (result.error_summary or "")
    assert db.query(ImportBatch).filter_by(merchant_no="单624").one().source_type == "manual"
    db.close()


def test_import_rejects_different_raw_merchant_with_same_normalized_value(tmp_path):
    db = SessionLocal()
    db.add(
        ImportBatch(
            merchant_no="单624",
            merchant_no_normalized="624",
            source_type="import",
            status="success",
            success_count=1,
            warning_count=0,
            failure_count=0,
        )
    )
    db.commit()
    path = tmp_path / "normalized-conflict.csv"
    path.write_text(
        "商号,container_no,sale_date,grade,quantity,unit_price,amount\n"
        "624,C005,2026-08-05,A,1,2,2\n",
        encoding="utf-8-sig",
    )

    result = import_file(db, path, overwrite=True)

    assert result.status == "conflict"
    assert "归一化后与已有商号 单624 相同" in (result.error_summary or "")
    assert db.query(ImportBatch).filter_by(merchant_no="624").count() == 0
    db.close()


def test_missing_merchant_no_fails_with_file_level_error(tmp_path):
    path = tmp_path / "no-merchant.csv"
    path.write_text(
        "container_no,sale_date,grade,quantity,unit_price,amount\n"
        "C005,2026-08-05,A,1,2,2\n",
        encoding="utf-8-sig",
    )
    db = SessionLocal()

    result = import_file(db, path)

    assert result.status == "failed"
    assert "缺少商号" in (result.error_summary or "")
    assert db.query(ImportBatch).count() == 0
    db.close()


def test_unrecognized_grade_falls_back_to_other_and_missing_numeric_skips_row(tmp_path):
    path = write_csv(
        tmp_path,
        "container_no,sale_date,grade,quantity,unit_price,amount\n"
        "C006,2026-08-06,X6,1,2,2\n"
        "C006,2026-08-06,A,,2,2\n",
    )
    db = SessionLocal()
    result = import_file(db, path)

    assert result.status == "partial"
    assert result.success_count == 1
    assert result.failure_count == 1
    issues = db.query(DataIssue).order_by(DataIssue.row_number).all()
    assert [issue.issue_type for issue in issues] == ["missing_field"]
    record = db.query(SaleRecord).one()
    assert record.grade.value == "OTHER"
    assert record.grade_raw == "X6"
    db.close()


def test_excel_import_persists_container_summary_without_importing_summary_rows(tmp_path):
    path = tmp_path / "settlement.xlsx"
    rows = [[None] * 6 for _ in range(9)]
    rows[4][1:3] = ["商号：", "单624"]
    rows[5][1:3] = ["柜号：", "MWCU0000003"]
    rows.extend(
        [
            [None, "销售日期", "品种(规格)", "数量", "单价", "金额"],
            [None, "2026-08-27", "A6", 2, 500, 1000],
            [None, None, None, None, None, None],
            [None, None, None, 2, "销售金额：", 1000],
            [None, None, None, None, "售后合计：", -20],
            [None, None, "扣减售后", None, "货款合计：", 980],
            [None, "支出费用：", "摘要", None, "金额", None],
            [None, None, "代卖佣金", None, 10, None],
            [None, None, "费用合计", None, 10, None],
            [None, None, "代付清关费+税费", None, 30, None],
            [None, "应付贵方总金额(RMB)", None, None, None, 940],
        ]
    )
    pd.DataFrame(rows).to_excel(path, index=False, header=False)
    db = SessionLocal()

    result = import_file(db, path)

    assert result.success_count == 1
    assert result.merchant_no == "单624"
    assert result.container_no == "MWCU0000003"
    assert db.query(SaleRecord).count() == 1
    summary = db.query(SettlementSummary).one()
    assert summary.sales_amount == Decimal("1000.0000")
    assert summary.after_sale_amount == Decimal("20.0000")
    assert summary.goods_amount == Decimal("980.0000")
    assert summary.fee_amount == Decimal("10.0000")
    assert summary.customs_tax == Decimal("30.0000")
    assert summary.payable_amount == Decimal("940.0000")
    assert "代卖佣金" in (summary.fee_detail or "")
    # 二次确认页对账：文件写的合计 + 系统按明细算的合计，两边一致才 ok。
    assert summary.sales_quantity == Decimal("2.0000")
    assert summary.computed_sales_amount == Decimal("1000.0000")
    assert summary.computed_quantity == Decimal("2.0000")
    assert summary.reconcile_status == "ok"
    db.close()


def test_transaction_failure_rolls_back_all_import_objects(tmp_path, monkeypatch):
    path = write_csv(
        tmp_path,
        "container_no,sale_date,grade,quantity,unit_price,amount\n"
        "C007,2026-08-07,A,1,2,2\n",
    )
    db = SessionLocal()

    def fail_commit():
        raise RuntimeError("simulated commit failure")

    monkeypatch.setattr(db, "commit", fail_commit)
    with pytest.raises(RuntimeError, match="simulated commit failure"):
        import_file(db, path)

    assert db.query(ImportBatch).count() == 0
    assert db.query(SourceFile).count() == 0
    assert db.query(SaleRecord).count() == 0
    assert db.query(DataIssue).count() == 0
    assert db.query(SettlementSummary).count() == 0
    db.close()


def write_excel_settlement(tmp_path, file_name, merchant_no, container_no, sales_rows, payable):
    """写 Excel 结算单 fixture：B5 商号 / B6 柜号 + 明细区 + 结算区摘要。"""

    padding = [[None] * 6 for _ in range(9)]
    padding[4][1:3] = ["商号：", merchant_no]
    padding[5][1:3] = ["柜号：", container_no]
    rows = [
        *padding,
        [None, "销售日期", "品种(规格)", "数量", "单价", "金额"],
        *[[None, *row] for row in sales_rows],
        [None, None, None, None, None, None],
        [None, None, None, None, "销售金额：", payable],
        [None, "应付贵方总金额(RMB)", None, None, None, payable],
    ]
    path = tmp_path / file_name
    pd.DataFrame(rows).to_excel(path, index=False, header=False)
    return path


def test_overwrite_purges_previous_issues_and_summary_rows(tmp_path):
    first_path = write_excel_settlement(
        tmp_path,
        "first.xlsx",
        "单624",
        "MWCU0000001",
        [
            ["2026-08-27", "A6", 2, 500, 1000],
            ["2026-08-27", "A6", None, 500, 1000],
        ],
        payable=1000,
    )
    second_path = write_excel_settlement(
        tmp_path,
        "second.xlsx",
        "单624",
        "MWCU0000002",
        [["2026-08-28", "A6", 4, 500, 2000]],
        payable=2000,
    )
    db = SessionLocal()

    first = import_file(db, first_path)

    assert first.status == "partial"
    assert db.query(DataIssue).count() == 1
    assert db.query(SettlementSummary).count() == 1

    replaced = import_file(db, second_path, overwrite=True)

    assert replaced.status == "success"
    assert replaced.container_no == "MWCU0000002"
    assert replaced.failure_count == 0
    assert db.query(ImportBatch).count() == 1
    assert db.query(SaleRecord).count() == 1
    assert db.query(DataIssue).count() == 0
    assert replaced.issues == []
    summary = db.query(SettlementSummary).one()
    assert summary.payable_amount == Decimal("2000.0000")
    db.close()


def test_overwrite_without_existing_batch_imports_normally(tmp_path):
    path = write_csv(
        tmp_path,
        "container_no,sale_date,grade,quantity,unit_price,amount\n"
        "C008,2026-08-08,A,3,2,6\n",
    )
    db = SessionLocal()

    result = import_file(db, path, overwrite=True)

    assert result.status == "success"
    assert result.obsolete_storage_path is None
    assert db.query(ImportBatch).filter_by(merchant_no="单624").count() == 1
    db.close()


def test_data_issue_rows_keep_severity_field_and_raw_value(tmp_path):
    path = write_csv(
        tmp_path,
        "container_no,sale_date,grade,quantity,unit_price,amount\n"
        "C009,2026-08-09,A,,2,2\n"
        "C009,2026-08-09,A,1,2,3\n",
    )
    db = SessionLocal()

    result = import_file(db, path)

    issues = db.query(DataIssue).order_by(DataIssue.row_number).all()
    assert [issue.row_number for issue in issues] == [2, 3]
    assert [issue.issue_type for issue in issues] == [
        "missing_field",
        "amount_mismatch",
    ]
    assert [issue.severity for issue in issues] == ["error", "warning"]
    assert issues[0].field_name == "quantity"
    assert issues[1].field_name == "amount"
    assert issues[1].message == "金额与数量乘以单价不一致"

    batch = db.query(ImportBatch).one()
    assert result.warning_count == 1
    assert batch.warning_count == 1
    assert all(issue.import_batch_id == batch.id for issue in issues)
    assert all(issue.source_file_id is not None for issue in issues)
    assert {issue.issue_type for issue in result.issues} == {
        "missing_field",
        "amount_mismatch",
    }
    assert [issue.severity for issue in result.issues].count("warning") == 1
    db.close()


def test_spec_suffix_row_trace_and_reconciliation_are_persisted(tmp_path):
    """后缀、原文件行号、整行原文与合计对账都要落库（二次确认页要用）。"""

    path = tmp_path / "settlement.xlsx"
    rows = [[None] * 6 for _ in range(6)]
    rows[4][1:3] = ["商号：", "单629"]
    rows.extend(
        [
            [None, "销售日期", "品种(规格)", "数量", "单价", "金额"],
            [None, "2026-09-02", "B3/4(9KG)尾/微裂", 10, 12.5, 125],
            [None, None, None, None, None, None],
            [None, None, None, 10, "销售金额：", 125],
        ]
    )
    pd.DataFrame(rows).to_excel(path, index=False, header=False)
    db = SessionLocal()

    result = import_file(db, path, brand="香香")
    record = db.query(SaleRecord).one()
    batch = db.query(ImportBatch).one()
    summary = db.query(SettlementSummary).one()

    assert result.status == "success"
    assert batch.brand == "香香"
    assert batch.parse_mode == "rule"
    assert batch.confirmed_at is None
    assert record.piece_count == "3/4"
    assert record.spec_kg == "9"
    assert record.suffix == "尾/微裂"
    # 原文件行号按表头 +1 起算，整行原文保留规格单元格原文。
    assert record.source_row == 8
    assert "B3/4(9KG)尾/微裂" in (record.raw_row_text or "")
    assert db.query(SourceFile).one().row_count == 1
    assert summary.sales_quantity == Decimal("10.0000")
    assert summary.computed_sales_amount == Decimal("125.0000")
    assert summary.reconcile_status == "ok"
    db.close()
