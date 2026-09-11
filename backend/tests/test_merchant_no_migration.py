"""适配后商号迁移脚本：加列、回填与幂等。"""

import pytest
from sqlalchemy import create_engine, inspect, text

from scripts.add_merchant_no_normalized import build_plan, migrate


OLD_SCHEMA = """
CREATE TABLE import_batch (
    id INTEGER PRIMARY KEY,
    file_name VARCHAR(255),
    merchant_no VARCHAR(128) NOT NULL,
    order_no VARCHAR(128),
    container_no VARCHAR(128),
    vehicle_no VARCHAR(128),
    imported_at DATETIME NOT NULL,
    status VARCHAR(32) NOT NULL,
    success_count INTEGER NOT NULL DEFAULT 0,
    warning_count INTEGER NOT NULL DEFAULT 0,
    failure_count INTEGER NOT NULL DEFAULT 0,
    error_summary TEXT
);
"""

MERCHANTS = ["单637", "单624", "626", "640"]


@pytest.fixture
def old_database(tmp_path):
    engine = create_engine(f"sqlite+pysqlite:///{tmp_path / 'old.sqlite3'}")
    with engine.begin() as connection:
        connection.execute(text(OLD_SCHEMA))
        for merchant_no in MERCHANTS:
            connection.execute(
                text(
                    "INSERT INTO import_batch (merchant_no, imported_at, status) "
                    "VALUES (:merchant_no, '2026-09-01 00:00:00', 'success')"
                ),
                {"merchant_no": merchant_no},
            )
    return engine


def columns(engine):
    return {column["name"] for column in inspect(engine).get_columns("import_batch")}


def test_dry_run_does_not_touch_schema(old_database):
    executed = migrate(old_database, apply=False)

    assert executed == []
    assert "merchant_no_normalized" not in columns(old_database)


def test_migration_adds_column_and_backfills_merchant_no(old_database):
    executed = migrate(old_database, apply=True)

    assert executed == [
        "ALTER TABLE `import_batch` ADD COLUMN `merchant_no_normalized` VARCHAR(128) NULL"
    ]
    with old_database.connect() as connection:
        rows = connection.execute(
            text("SELECT merchant_no, merchant_no_normalized FROM import_batch ORDER BY id")
        ).all()
    assert rows == [("单637", "637"), ("单624", "624"), ("626", "626"), ("640", "640")]


def test_migration_is_idempotent(old_database):
    migrate(old_database, apply=True)

    second = migrate(old_database, apply=True)

    assert second == []
    plan = build_plan(old_database)
    assert plan.statements == []
    assert plan.backfills == []


def test_force_recomputes_existing_values(old_database):
    migrate(old_database, apply=True)
    with old_database.begin() as connection:
        connection.execute(
            text("UPDATE import_batch SET merchant_no_normalized = '旧值' WHERE merchant_no = '单637'")
        )

    assert len(build_plan(old_database, force=True).backfills) == len(MERCHANTS)

    migrate(old_database, apply=True, force=True)
    with old_database.connect() as connection:
        value = connection.execute(
            text("SELECT merchant_no_normalized FROM import_batch WHERE merchant_no = '单637'")
        ).scalar()
    assert value == "637"
