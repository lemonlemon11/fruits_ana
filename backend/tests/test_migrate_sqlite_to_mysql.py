"""数据库迁移工具测试。"""

from pathlib import Path

import pytest
from sqlalchemy import create_engine, func, select

from app.db import Base
from app.models import ImportBatch
from scripts.migrate_sqlite_to_mysql import migrate_database


def sqlite_url(path: Path) -> str:
    return f"sqlite+pysqlite:///{path.as_posix()}"


def test_migrate_database_copies_rows_and_preserves_ids(tmp_path: Path) -> None:
    source_engine = create_engine(sqlite_url(tmp_path / "source.db"))
    target_engine = create_engine(sqlite_url(tmp_path / "target.db"))
    Base.metadata.create_all(source_engine)

    with source_engine.begin() as connection:
        connection.execute(
            ImportBatch.__table__.insert(),
            {
                "id": 7,
                "file_name": "sample.xlsx",
                "status": "completed",
                "merchant_no": "单624",
            },
        )

    counts = migrate_database(source_engine, target_engine)

    assert counts["import_batch"] == 1
    with target_engine.connect() as connection:
        assert connection.scalar(select(func.count()).select_from(ImportBatch)) == 1
        assert connection.scalar(select(ImportBatch.id)) == 7


def test_migrate_database_refuses_non_empty_target(tmp_path: Path) -> None:
    source_engine = create_engine(sqlite_url(tmp_path / "source.db"))
    target_engine = create_engine(sqlite_url(tmp_path / "target.db"))
    Base.metadata.create_all(source_engine)
    Base.metadata.create_all(target_engine)

    with target_engine.begin() as connection:
        connection.execute(
            ImportBatch.__table__.insert(),
            {
                "file_name": "existing.xlsx",
                "status": "completed",
                "merchant_no": "单999",
            },
        )

    with pytest.raises(RuntimeError, match="目标数据库不是空库"):
        migrate_database(source_engine, target_engine)
