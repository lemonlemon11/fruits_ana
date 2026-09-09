from datetime import date
from decimal import Decimal

import pytest
import pandas as pd

from app.db import Base, DATABASE_PATH, DEFAULT_DATABASE_PATH, SessionLocal, engine
from app.services.import_service import import_file
from app.models import ContainerSummary, DataIssue, ImportBatch, SaleRecord, SourceFile


@pytest.fixture(autouse=True)
def clean_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


def write_csv(tmp_path, content: str):
    path = tmp_path / "sales.csv"
    path.write_text(content, encoding="utf-8-sig")
    return path


def test_pytest_database_is_isolated_from_default_data_database():
    assert DATABASE_PATH != DEFAULT_DATABASE_PATH
    assert DATABASE_PATH.parent.name == ".pytest-tmp"


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
    assert record.container_id == "C001"
    assert record.sale_date == date(2026, 8, 1)
    assert record.grade_raw == "A6"
    assert record.grade.value == "A"
    assert record.quantity == Decimal("10")
    assert record.unit_price == Decimal("12.5000")
    assert record.amount == Decimal("125.0000")
    assert "客户甲" in (record.remark or "")
    db.close()


def test_bc_grade_maps_to_c_and_preserves_raw_value(tmp_path):
    path = write_csv(
        tmp_path,
        "container_no,sale_date,fruit_name,grade,quantity,unit_price,amount\n"
        "C002,2026/08/02,Durian,BC6,2,20,40\n",
    )
    db = SessionLocal()
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


def test_duplicate_file_returns_duplicate_without_new_records(tmp_path):
    path = write_csv(
        tmp_path,
        "container_no,sale_date,grade,quantity,unit_price,amount\n"
        "C005,2026-08-05,A,1,2,2\n",
    )
    db = SessionLocal()
    first = import_file(db, path)
    second = import_file(db, path, original_filename="renamed.csv")

    assert first.status == "success"
    assert second.status == "duplicate"
    assert second.batch_id == first.batch_id
    assert db.query(SourceFile).count() == 1
    assert db.query(ImportBatch).count() == 1
    assert db.query(SaleRecord).count() == 1
    db.close()


def test_unknown_grade_and_missing_numeric_field_create_issues_and_skip_rows(tmp_path):
    path = write_csv(
        tmp_path,
        "container_no,sale_date,grade,quantity,unit_price,amount\n"
        "C006,2026-08-06,X6,1,2,2\n"
        "C006,2026-08-06,A,,2,2\n",
    )
    db = SessionLocal()
    result = import_file(db, path)

    assert result.status == "partial"
    assert result.success_count == 0
    assert result.failure_count == 2
    issues = db.query(DataIssue).order_by(DataIssue.row_number).all()
    assert issues[0].issue_type == "unknown_grade"
    assert issues[1].issue_type == "missing_field"
    assert db.query(SaleRecord).count() == 0
    db.close()


def test_excel_import_persists_container_summary_without_importing_summary_rows(tmp_path):
    path = tmp_path / "settlement.xlsx"
    rows = [[None] * 6 for _ in range(9)]
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
    assert db.query(SaleRecord).count() == 1
    summary = db.query(ContainerSummary).one()
    assert summary.container_id == "MWCU0000003"
    assert summary.sales_amount == Decimal("1000.0000")
    assert summary.after_sale_amount == Decimal("-20.0000")
    assert summary.goods_amount == Decimal("980.0000")
    assert summary.fee_amount == Decimal("10.0000")
    assert summary.customs_tax == Decimal("30.0000")
    assert summary.payable_amount == Decimal("940.0000")
    assert "代卖佣金" in (summary.fee_detail or "")
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
    assert db.query(ContainerSummary).count() == 0
    db.close()
