"""数据库连接配置测试。"""

from sqlalchemy.engine import URL
from sqlalchemy.schema import CreateTable
from sqlalchemy.dialects import mysql

from app.db import build_database_url, engine_options
from app.models import DataIssue, ImportBatch, SourceFile, User, UserSession


def test_build_database_url_uses_explicit_url() -> None:
    explicit_url = "sqlite+pysqlite:////tmp/fruit-analysis.db"

    url = build_database_url({"FRUIT_ANALYSIS_DATABASE_URL": explicit_url})

    assert url == explicit_url


def test_build_database_url_builds_mysql_url_from_environment() -> None:
    url = build_database_url(
        {
            "FRUIT_ANALYSIS_DB_HOST": "db.example.com",
            "FRUIT_ANALYSIS_DB_PORT": "13306",
            "FRUIT_ANALYSIS_DB_USER": "fruit_user",
            "FRUIT_ANALYSIS_DB_PASSWORD": "p@ss/word",
            "FRUIT_ANALYSIS_DB_NAME": "fruits_ana",
        }
    )

    assert isinstance(url, URL)
    assert url.drivername == "mysql+pymysql"
    assert url.host == "db.example.com"
    assert url.port == 13306
    assert url.username == "fruit_user"
    assert url.password == "p@ss/word"
    assert url.database == "fruits_ana"
    assert dict(url.query) == {"charset": "utf8mb4"}


def test_engine_options_are_specific_to_sqlite() -> None:
    sqlite_options = engine_options("sqlite+pysqlite:////tmp/fruit-analysis.db")
    mysql_options = engine_options("mysql+pymysql://user:password@db/fruits_ana")

    assert sqlite_options == {"connect_args": {"check_same_thread": False}}
    assert mysql_options == {"pool_pre_ping": True, "pool_recycle": 1800}


def test_mysql_datetime_columns_preserve_microseconds() -> None:
    tables = (User, UserSession, ImportBatch, SourceFile, DataIssue)

    statements = [
        str(CreateTable(model.__table__).compile(dialect=mysql.dialect()))
        for model in tables
    ]

    # 7 个原有列 + import_batch.confirmed_at + data_issue.resolved_at（ADR-028 确认/复核留痕）
    assert sum(statement.count("DATETIME(6)") for statement in statements) == 9
