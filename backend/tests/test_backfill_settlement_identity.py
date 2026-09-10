"""结算单身份迁移脚本测试。"""

from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

import openpyxl
import pytest
from sqlalchemy import create_engine, inspect, text

from scripts.backfill_settlement_identity import (
    MigrationError,
    _literal,
    _require_not_null,
    build_plan,
    migrate,
    write_snapshot,
)


class _Dialect:
    def __init__(self, name):
        self.name = name


class _EngineStub:
    def __init__(self, name):
        self.dialect = _Dialect(name)


OLD_SCHEMA = """
CREATE TABLE import_batch (
    id INTEGER PRIMARY KEY,
    file_name VARCHAR(255),
    imported_at DATETIME NOT NULL,
    status VARCHAR(32) NOT NULL,
    success_count INTEGER NOT NULL DEFAULT 0,
    warning_count INTEGER NOT NULL DEFAULT 0,
    failure_count INTEGER NOT NULL DEFAULT 0,
    error_summary TEXT
);
CREATE TABLE source_file (
    id INTEGER PRIMARY KEY,
    import_batch_id INTEGER NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_hash VARCHAR(128) NOT NULL,
    storage_path VARCHAR(1024),
    stored_at DATETIME NOT NULL
);
CREATE TABLE sale_record (
    id INTEGER PRIMARY KEY,
    import_batch_id INTEGER,
    source_file_id INTEGER,
    container_id VARCHAR(128) NOT NULL,
    container_name VARCHAR(255),
    sale_date DATE NOT NULL,
    fruit_type VARCHAR(64) NOT NULL,
    grade_raw VARCHAR(64),
    grade VARCHAR(1) NOT NULL,
    spec_raw VARCHAR(255),
    quantity NUMERIC(18, 4) NOT NULL,
    unit_price NUMERIC(18, 4) NOT NULL,
    amount NUMERIC(18, 4) NOT NULL,
    remark TEXT,
    sales_region VARCHAR(128)
);
CREATE INDEX ix_sale_record_container_id ON sale_record (container_id);
CREATE TABLE container_summary (
    id INTEGER PRIMARY KEY,
    import_batch_id INTEGER NOT NULL,
    container_id VARCHAR(128) NOT NULL,
    container_name VARCHAR(255),
    sales_amount NUMERIC(18, 4),
    after_sale_amount NUMERIC(18, 4),
    goods_amount NUMERIC(18, 4),
    fee_amount NUMERIC(18, 4),
    fee_detail TEXT,
    customs_tax NUMERIC(18, 4),
    payable_amount NUMERIC(18, 4),
    remark TEXT
);
CREATE INDEX ix_container_summary_container_id ON container_summary (container_id);
CREATE INDEX ix_container_summary_import_batch_id ON container_summary (import_batch_id);
"""


def write_settlement_xlsx(path: Path, *, merchant_no="单624", order_no="宝贝01"):
    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet["B2"] = "结 算 单"
    sheet["B5"], sheet["C5"] = "商号：", merchant_no
    sheet["B6"], sheet["C6"] = "柜号：", "MWCU1823691"
    sheet["B7"], sheet["C7"] = "单号：", order_no
    sheet["B8"], sheet["C8"] = "转运公司：", "桂AAB087"
    sheet["B10"], sheet["C10"], sheet["D10"], sheet["E10"], sheet["F10"] = (
        "销售日期", "品种(规格)", "数量", "单价", "金额",
    )
    sheet["B11"], sheet["C11"], sheet["D11"], sheet["E11"], sheet["F11"] = (
        "2026-08-27", "B6", 3, 450, 1350,
    )
    workbook.save(path)
    return path


@pytest.fixture
def old_database(tmp_path):
    """构造一份柜号维度的旧库，并写入一个批次与原始文件。"""

    engine = create_engine(f"sqlite+pysqlite:///{(tmp_path / 'old.db').as_posix()}")
    with engine.begin() as connection:
        for statement in OLD_SCHEMA.strip().split(";"):
            if statement.strip():
                connection.execute(text(statement))
    upload_dir = tmp_path / "uploads"
    upload_dir.mkdir()
    source = write_settlement_xlsx(upload_dir / "sample.xlsx")
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO import_batch (id, file_name, imported_at, status, success_count) "
                "VALUES (1, 'sample.xlsx', '2026-09-01 10:00:00', 'success', 1)"
            )
        )
        connection.execute(
            text(
                "INSERT INTO source_file (id, import_batch_id, file_name, file_hash, storage_path, stored_at) "
                "VALUES (1, 1, 'sample.xlsx', 'hash-1', :path, '2026-09-01 10:00:00')"
            ),
            {"path": str(source)},
        )
        connection.execute(
            text(
                "INSERT INTO sale_record (id, import_batch_id, source_file_id, container_id, container_name, "
                "sale_date, fruit_type, grade_raw, grade, quantity, unit_price, amount) "
                "VALUES (1, 1, 1, 'MWCU1823691', '货柜1', '2026-08-27', '榴莲', 'B6', 'B', 3, 450, 1350)"
            )
        )
        connection.execute(
            text(
                "INSERT INTO container_summary (id, import_batch_id, container_id, payable_amount) "
                "VALUES (1, 1, 'MWCU1823691', 940)"
            )
        )
    return engine, upload_dir


def test_dry_run_reports_statements_without_touching_schema(old_database):
    engine, upload_dir = old_database

    executed = migrate(engine, upload_dir=upload_dir, apply=False)

    assert executed == []
    assert "merchant_no" not in {column["name"] for column in inspect(engine).get_columns("import_batch")}
    assert "container_summary" in inspect(engine).get_table_names()


def test_constraints_are_scheduled_after_data_backfill(old_database):
    engine, upload_dir = old_database

    plan = build_plan(engine, upload_dir)

    assert plan.backfills
    assert not [item for item in plan.ddl_before if "ux_import_batch_merchant_no" in item]
    assert [item for item in plan.ddl_after if "ux_import_batch_merchant_no" in item]
    assert plan.statements
    assert _require_not_null(
        _EngineStub("mysql"), "import_batch", "merchant_no", "VARCHAR(128)"
    ).endswith("NOT NULL")
    assert _require_not_null(
        _EngineStub("sqlite"), "import_batch", "merchant_no", "VARCHAR(128)"
    ) is None


def test_migration_backfills_merchant_identity_and_drops_container_columns(old_database):
    engine, upload_dir = old_database

    executed = migrate(engine, upload_dir=upload_dir, apply=True)

    assert executed
    inspector = inspect(engine)
    batch_columns = {column["name"] for column in inspector.get_columns("import_batch")}
    assert {"merchant_no", "order_no", "container_no", "vehicle_no"} <= batch_columns
    with engine.connect() as connection:
        row = connection.execute(
            text("SELECT merchant_no, order_no, container_no, vehicle_no FROM import_batch")
        ).one()
    assert row == ("单624", "宝贝01", "MWCU1823691", "桂AAB087")

    assert "container_id" not in {column["name"] for column in inspector.get_columns("sale_record")}
    assert "container_name" not in {column["name"] for column in inspector.get_columns("sale_record")}

    assert "container_summary" not in inspector.get_table_names()
    summary_columns = {column["name"] for column in inspector.get_columns("settlement_summary")}
    assert "container_id" not in summary_columns
    assert "container_name" not in summary_columns
    assert "ux_settlement_summary_batch" in {
        index["name"] for index in inspector.get_indexes("settlement_summary")
    }
    assert "ux_import_batch_merchant_no" in {
        index["name"] for index in inspector.get_indexes("import_batch")
    }
    with engine.connect() as connection:
        assert connection.execute(text("SELECT payable_amount FROM settlement_summary")).scalar() == 940


def test_migration_is_idempotent(old_database):
    engine, upload_dir = old_database
    migrate(engine, upload_dir=upload_dir, apply=True)

    second = migrate(engine, upload_dir=upload_dir, apply=True)

    assert second == []


def test_plan_rejects_batches_without_readable_source_file(old_database):
    engine, upload_dir = old_database
    with engine.begin() as connection:
        connection.execute(text("UPDATE source_file SET storage_path = '/nowhere/missing.xlsx'"))

    with pytest.raises(MigrationError, match="无法从原始文件确定商号"):
        build_plan(engine, upload_dir)


def test_plan_rejects_duplicate_merchant_numbers(tmp_path):
    engine = create_engine(f"sqlite+pysqlite:///{(tmp_path / 'dup.db').as_posix()}")
    with engine.begin() as connection:
        for statement in OLD_SCHEMA.strip().split(";"):
            if statement.strip():
                connection.execute(text(statement))
    upload_dir = tmp_path / "uploads"
    upload_dir.mkdir()
    first = write_settlement_xlsx(upload_dir / "one.xlsx", merchant_no="单624")
    second = write_settlement_xlsx(upload_dir / "two.xlsx", merchant_no="单624")
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO import_batch (id, file_name, imported_at, status) VALUES "
                "(1, 'one.xlsx', '2026-09-01 10:00:00', 'success'), "
                "(2, 'two.xlsx', '2026-09-02 10:00:00', 'success')"
            )
        )
        connection.execute(
            text(
                "INSERT INTO source_file (id, import_batch_id, file_name, file_hash, storage_path, stored_at) "
                "VALUES (1, 1, 'one.xlsx', 'h1', :one, '2026-09-01'), "
                "(2, 2, 'two.xlsx', 'h2', :two, '2026-09-02')"
            ),
            {"one": str(first), "two": str(second)},
        )

    plan = build_plan(engine, upload_dir)
    with pytest.raises(MigrationError, match="请先人工合并"):
        migrate(engine, upload_dir=upload_dir, apply=False)
    assert [batch_id for batch_id, _ in plan.backfills] == [1, 2]


def test_migration_rejects_multiple_summaries_per_settlement(old_database):
    engine, upload_dir = old_database
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO container_summary (id, import_batch_id, container_id, payable_amount) "
                "VALUES (2, 1, 'MWCU1823691', 1000)"
            )
        )

    with pytest.raises(MigrationError, match="多条结算摘要"):
        migrate(engine, upload_dir=upload_dir, apply=True)


def test_snapshot_contains_insert_statements(old_database, tmp_path):
    engine, _ = old_database

    path = write_snapshot(engine, tmp_path / "snapshot.sql")

    content = path.read_text(encoding="utf-8")
    assert "INSERT INTO `import_batch`" in content
    assert "INSERT INTO `container_summary`" in content
    assert "MWCU1823691" in content


def test_snapshot_literals_handle_dates_numbers_and_quotes():
    assert _literal(None) == "NULL"
    assert _literal(Decimal("1350.0000")) == "1350.0000"
    assert _literal(7) == "7"
    assert _literal(True) == "1"
    assert _literal(date(2026, 8, 27)) == "'2026-08-27'"
    assert _literal(datetime(2026, 9, 1, 10, 30, 0)) == "'2026-09-01 10:30:00'"
    assert _literal("O'Brien") == "'O''Brien'"
