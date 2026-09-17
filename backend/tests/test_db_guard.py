"""非测试库破坏性操作硬保护的回归测试（ADR-021 / ADR-024）。"""

from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine

from app.db import (
    ALLOW_DESTRUCTIVE_ENV,
    Base,
    assert_destructive_allowed,
    describe_database,
    guard_destructive_statement,
    is_destructive_statement,
    is_test_database,
)


MYSQL_PROD_URL = "mysql+pymysql://root:secret@120.48.117.234:13306/fruits_ana"
MYSQL_TEST_URL = "mysql+pymysql://root:secret@127.0.0.1:3306/fruits_ana_test"


def fake_connection(url: str):
    return SimpleNamespace(engine=SimpleNamespace(url=url))


def test_sqlite_and_test_database_are_writable() -> None:
    assert is_test_database("sqlite+pysqlite:////tmp/fruit.db") is True
    assert is_test_database(MYSQL_TEST_URL) is True
    assert is_test_database(MYSQL_PROD_URL) is False
    assert describe_database(MYSQL_PROD_URL) == "mysql://root@120.48.117.234:13306/fruits_ana"


def test_destructive_statement_detection() -> None:
    assert is_destructive_statement("DROP TABLE sale_record") is True
    assert is_destructive_statement("  drop  table if exists `sale_record`") is True
    assert is_destructive_statement("TRUNCATE TABLE sale_record") is True
    assert is_destructive_statement("DROP DATABASE fruits_ana") is True
    assert is_destructive_statement("ALTER TABLE user DROP COLUMN email") is False
    assert is_destructive_statement("DROP INDEX ix_sale_record_grade") is False
    assert is_destructive_statement("SELECT 1") is False
    assert is_destructive_statement("") is False


def test_assert_destructive_allowed_blocks_production() -> None:
    with pytest.raises(RuntimeError, match="拒绝在非测试库执行"):
        assert_destructive_allowed(MYSQL_PROD_URL, "MetaData.drop_all", environ={})
    with pytest.raises(RuntimeError, match=ALLOW_DESTRUCTIVE_ENV):
        assert_destructive_allowed(MYSQL_PROD_URL, "MetaData.drop_all", environ={})
    assert_destructive_allowed(MYSQL_PROD_URL, "MetaData.drop_all", environ={ALLOW_DESTRUCTIVE_ENV: "1"})
    assert_destructive_allowed(MYSQL_TEST_URL, "MetaData.drop_all", environ={})


def test_metadata_drop_all_refuses_production_database() -> None:
    production_engine = create_engine(MYSQL_PROD_URL)
    with pytest.raises(RuntimeError, match="拒绝在非测试库执行 Base.metadata.drop_all"):
        Base.metadata.drop_all(bind=production_engine)


def test_metadata_drop_all_allows_test_database() -> None:
    test_engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)


def test_statement_guard_blocks_production_and_passes_test_database() -> None:
    with pytest.raises(RuntimeError, match="拒绝在非测试库执行 SQL"):
        guard_destructive_statement(
            fake_connection(MYSQL_PROD_URL), None, "DROP TABLE sale_record", None, None, False
        )
    guard_destructive_statement(
        fake_connection(MYSQL_TEST_URL), None, "DROP TABLE sale_record", None, None, False
    )
    guard_destructive_statement(
        fake_connection(MYSQL_TEST_URL), None, "ALTER TABLE user DROP COLUMN email", None, None, False
    )
