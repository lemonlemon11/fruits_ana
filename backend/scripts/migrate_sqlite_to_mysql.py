"""将现有 SQLite 业务数据一次性迁移到配置的 MySQL 数据库。"""

from __future__ import annotations

import argparse
from pathlib import Path

from sqlalchemy import Engine, create_engine, func, select

from app import models  # noqa: F401  # 注册所有表。
from app.db import BACKEND_DIR, Base, DATABASE_URL


DEFAULT_SOURCE = BACKEND_DIR / "data" / "fruit_analysis.sqlite3"


def database_counts(engine: Engine) -> dict[str, int]:
    """统计应用中每张表的记录数。"""

    with engine.connect() as connection:
        return {
            table.name: connection.scalar(
                select(func.count()).select_from(table)
            ) or 0
            for table in Base.metadata.sorted_tables
        }


def migrate_database(source_engine: Engine, target_engine: Engine) -> dict[str, int]:
    """复制空目标库并校验逐表行数；不会覆盖已有业务数据。"""

    Base.metadata.create_all(target_engine)
    existing = {name: count for name, count in database_counts(target_engine).items() if count}
    if existing:
        details = ", ".join(f"{name}={count}" for name, count in existing.items())
        raise RuntimeError(f"目标数据库不是空库：{details}")

    source_counts = database_counts(source_engine)
    with source_engine.connect() as source, target_engine.begin() as target:
        for table in Base.metadata.sorted_tables:
            rows = source.execute(select(table)).mappings().all()
            if rows:
                target.execute(table.insert(), [dict(row) for row in rows])

    target_counts = database_counts(target_engine)
    if target_counts != source_counts:
        raise RuntimeError(
            f"迁移后行数校验失败：source={source_counts}, target={target_counts}"
        )
    return target_counts


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    source_path = args.source.expanduser().resolve()
    if not source_path.is_file():
        raise SystemExit(f"SQLite 数据库不存在：{source_path}")

    source_engine = create_engine(f"sqlite+pysqlite:///{source_path.as_posix()}")
    target_engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_recycle=1800,
    )
    counts = migrate_database(source_engine, target_engine)
    for table_name, count in counts.items():
        print(f"{table_name}: {count}")


if __name__ == "__main__":
    main()
