"""为手工录单增加列和新表，幂等可重复执行。

新增列：
- ``import_batch.source_type`` / ``market`` / ``arrival_date`` / ``arrival_quantity``
- ``sale_record.piece_count`` / ``spec_kg``（归一后文本）
- ``sale_record.piece_count_min/max``、``spec_kg_min/max``（派生的数值端点）

新增表：
- ``settlement_after_sale_item``
- ``settlement_fee_item``
- ``entry_field_option``

类型变更（``piece_count`` INTEGER → VARCHAR(32)、``spec_kg`` DECIMAL → VARCHAR(32)）
按 ADR-027 走**开发期清库重建**，本脚本只检测并提示，不自动改写已有列。

默认演练，传入 ``--apply`` 才写库。
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


def _add_index_plan(inspector, table_name: str, index_name: str, columns: str) -> str | None:
    if table_name not in inspector.get_table_names():
        return None
    existing = {index["name"] for index in inspector.get_indexes(table_name)}
    if index_name in existing:
        return None
    return f"CREATE INDEX {index_name} ON {table_name} ({columns})"


REBUILD_REQUIRED = (
    ("sale_record", "piece_count", "varchar"),
    ("sale_record", "spec_kg", "varchar"),
)


def build_statements() -> list[str]:
    inspector = inspect(engine)
    statements = [
        statement
        for statement in [
            _add_column_plan(
                inspector,
                "import_batch",
                "source_type",
                "VARCHAR(16) NOT NULL DEFAULT 'import'",
            ),
            _add_column_plan(inspector, "import_batch", "market", "VARCHAR(128) NULL"),
            _add_column_plan(inspector, "import_batch", "arrival_date", "DATE NULL"),
            _add_column_plan(inspector, "import_batch", "arrival_quantity", "INTEGER NULL"),
            _add_column_plan(inspector, "sale_record", "piece_count", "VARCHAR(32) NULL"),
            _add_column_plan(inspector, "sale_record", "piece_count_min", "DECIMAL(18,2) NULL"),
            _add_column_plan(inspector, "sale_record", "piece_count_max", "DECIMAL(18,2) NULL"),
            _add_column_plan(inspector, "sale_record", "spec_kg", "VARCHAR(32) NULL"),
            _add_column_plan(inspector, "sale_record", "spec_kg_min", "DECIMAL(18,2) NULL"),
            _add_column_plan(inspector, "sale_record", "spec_kg_max", "DECIMAL(18,2) NULL"),
            _add_index_plan(inspector, "sale_record", "ix_sale_record_date_grade", "sale_date, grade"),
            _add_index_plan(inspector, "sale_record", "ix_sale_record_spec_kg", "spec_kg_min, spec_kg_max"),
            _add_index_plan(inspector, "sale_record", "ix_sale_record_piece_count", "piece_count_min, piece_count_max"),
        ]
        if statement
    ]
    return statements


def build_type_warnings() -> list[str]:
    """规格列已存在但类型不是文本时，提示走清库重建而不是 ALTER。"""

    inspector = inspect(engine)
    if "sale_record" not in inspector.get_table_names():
        return []
    columns = {column["name"]: str(column["type"]) for column in inspector.get_columns("sale_record")}
    warnings = []
    for table_name, column_name, expected in REBUILD_REQUIRED:
        current = columns.get(column_name)
        if current is not None and expected not in current.lower():
            warnings.append(
                f"{table_name}.{column_name} 当前类型 {current}，需要文本类型；"
                "按 ADR-027 清库重建并重新导入，不做原地 ALTER"
            )
    return warnings


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    apply = "--apply" in args
    statements = build_statements()
    warnings = build_type_warnings()
    for warning in warnings:
        print(f"[需要重建] {warning}")
    if not statements and not apply:
        if not warnings:
            print("手工录单列已存在；新表由 init_db/create_all 负责创建")
        return 0

    for statement in statements:
        print(statement)
    if not apply:
        print("dry-run：加 --apply 写库")
        return 0

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))
        Base.metadata.create_all(bind=connection)
    print("applied")
    return 0


if __name__ == "__main__":
    sys.exit(main())
