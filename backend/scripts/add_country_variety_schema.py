"""为结算单模板新增「国家 / 品种」字段，并把原「品种」字段语义改为「等级」。

新增列：
- ``import_batch.country``（VARCHAR(64) NULL，一张结算单一个值，自由文本）
- ``sale_record.variety``（VARCHAR(64) NULL，销售行级品种，自由文本）

历史数据回填（仅在 ``--apply`` 时执行，幂等）：
- ``import_batch.country='越南'``（仅 NULL 行）
- ``sale_record.variety='金枕'``（仅 NULL 行）

原 ``sale_record.grade_raw`` 继续保存等级原文（A/AB/BC 等），不改写。
默认 dry-run，传入 ``--apply`` 才写库。
"""

from __future__ import annotations

import sys

from sqlalchemy import inspect, text

from app.db import Base, engine
from app import models  # noqa: F401  # 注册全部模型


def _column_names(inspector, table_name: str) -> set[str]:
    return {column["name"] for column in inspector.get_columns(table_name)}


def _add_column_plan(inspector, table_name: str, column_name: str, definition: str) -> str | None:
    if column_name in _column_names(inspector, table_name):
        return None
    return f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}"


BACKFILL = (
    "UPDATE import_batch SET country = '越南' WHERE country IS NULL",
    "UPDATE sale_record SET variety = '金枕' WHERE variety IS NULL",
)


def build_statements() -> list[str]:
    inspector = inspect(engine)
    return [
        statement
        for statement in [
            _add_column_plan(inspector, "import_batch", "country", "VARCHAR(64) NULL"),
            _add_column_plan(inspector, "sale_record", "variety", "VARCHAR(64) NULL"),
        ]
        if statement
    ]


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    apply = "--apply" in args
    statements = build_statements()

    if not statements and not apply:
        print("国家 / 品种列已存在，无需 ALTER")
        return 0

    for statement in statements:
        print(statement)
    if not apply:
        print("dry-run：加 --apply 写库并回填历史数据")
        print("回填口径：import_batch.country='越南'、sale_record.variety='金枕'（仅 NULL 行）")
        return 0

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))
        for statement in BACKFILL:
            connection.execute(text(statement))
        Base.metadata.create_all(bind=connection)
    print("applied")
    return 0


if __name__ == "__main__":
    sys.exit(main())
