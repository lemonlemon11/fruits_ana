"""适配后单号迁移脚本：加列、回填与幂等。"""

import pytest
from sqlalchemy import create_engine, inspect, text

from scripts.add_order_no_normalized import build_plan, migrate


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

ROWS = [
    ("单624", "宝贝01"),
    ("626", "宝贝02"),
    ("单637", "宝贝003"),
    ("640", "宝贝L004"),
]


@pytest.fixture
def old_database(tmp_path):
    engine = create_engine(f"sqlite+pysqlite:///{tmp_path / 'old.sqlite3'}")
    with engine.begin() as connection:
        connection.execute(text(OLD_SCHEMA))
        for merchant_no, order_no in ROWS:
            connection.execute(
                text(
                    "INSERT INTO import_batch (merchant_no, order_no, imported_at, status) "
                    "VALUES (:merchant_no, :order_no, '2026-09-01 00:00:00', 'success')"
                ),
                {"merchant_no": merchant_no, "order_no": order_no},
            )
    return engine


def columns(engine):
    return {column["name"] for column in inspect(engine).get_columns("import_batch")}


def test_dry_run_does_not_touch_schema(old_database):
    executed = migrate(old_database, apply=False)

    assert executed == []
    assert "order_no_normalized" not in columns(old_database)


def test_migration_adds_column_and_backfills_normalized_order_no(old_database):
    executed = migrate(old_database, apply=True)

    assert executed == [
        "ALTER TABLE `import_batch` ADD COLUMN `order_no_normalized` VARCHAR(128) NULL"
    ]
    with old_database.connect() as connection:
        rows = connection.execute(
            text("SELECT order_no, order_no_normalized FROM import_batch ORDER BY id")
        ).all()
    assert rows == [
        ("宝贝01", "宝贝-001"),
        ("宝贝02", "宝贝-002"),
        ("宝贝003", "宝贝-003"),
        ("宝贝L004", "宝贝-004"),
    ]


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
            text("UPDATE import_batch SET order_no_normalized = '旧值' WHERE merchant_no = '单624'")
        )

    plan = build_plan(old_database, force=True)
    assert len(plan.backfills) == len(ROWS)

    migrate(old_database, apply=True, force=True)
    with old_database.connect() as connection:
        value = connection.execute(
            text("SELECT order_no_normalized FROM import_batch WHERE merchant_no = '单624'")
        ).scalar()
    assert value == "宝贝-001"
