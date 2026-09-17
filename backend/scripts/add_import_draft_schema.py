"""多文件导入草稿/留痕相关列与新表，幂等可重复执行。

新增列：
- ``import_batch.import_job_id``
- ``import_draft.import_job_id`` / ``version`` / ``storage_path`` /
  ``original_payload`` / ``updated_by`` / ``updated_at`` / ``confirmed_by`` /
  ``import_batch_id``
- ``settlement_summary.file_*`` 文件原值审计列

新增表：
- ``import_job``
- ``settlement_revision``

默认演练，传入 ``--apply`` 才写库；新表由 ``Base.metadata.create_all`` 创建。
"""

from __future__ import annotations

import sys

from sqlalchemy import inspect, text

from app.db import Base, engine
from app import models  # noqa: F401  # 注册全部模型


def _table_columns(inspector, table_name: str) -> set[str]:
    if table_name not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns(table_name)}


def _add_column_plan(inspector, table_name: str, column_name: str, definition: str) -> str | None:
    if table_name not in inspector.get_table_names() or column_name in _table_columns(inspector, table_name):
        return None
    return f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}"


def _add_index_plan(inspector, table_name: str, index_name: str, columns: str) -> str | None:
    if table_name not in inspector.get_table_names():
        return None
    existing = {index["name"] for index in inspector.get_indexes(table_name)}
    if index_name in existing:
        return None
    return f"CREATE INDEX {index_name} ON {table_name} ({columns})"


def _modify_mediumtext_plan(inspector, table_name: str, column_name: str) -> str | None:
    if table_name not in inspector.get_table_names():
        return None
    column = next(
        (item for item in inspector.get_columns(table_name) if item.get("name") == column_name),
        None,
    )
    if column is None or "mediumtext" in str(column.get("type") or "").lower():
        return None
    return f"ALTER TABLE {table_name} MODIFY COLUMN {column_name} MEDIUMTEXT NULL"


def build_statements() -> list[str]:
    inspector = inspect(engine)
    statements = [
        statement
        for statement in [
            _add_column_plan(inspector, "import_batch", "import_job_id", "INTEGER NULL"),
            _add_column_plan(inspector, "import_draft", "import_job_id", "INTEGER NULL"),
            _add_column_plan(inspector, "import_draft", "version", "INTEGER NOT NULL DEFAULT 1"),
            _add_column_plan(inspector, "import_draft", "storage_path", "VARCHAR(1024) NULL"),
            _add_column_plan(inspector, "import_draft", "original_payload", "MEDIUMTEXT NULL"),
            _add_column_plan(inspector, "import_draft", "updated_by", "INTEGER NULL"),
            _add_column_plan(inspector, "import_draft", "updated_at", "DATETIME(6) NULL"),
            _add_column_plan(inspector, "import_draft", "confirmed_by", "INTEGER NULL"),
            _add_column_plan(inspector, "import_draft", "import_batch_id", "INTEGER NULL"),
            _add_column_plan(inspector, "settlement_summary", "file_sales_quantity", "DECIMAL(18,4) NULL"),
            _add_column_plan(inspector, "settlement_summary", "file_sales_amount", "DECIMAL(18,4) NULL"),
            _add_column_plan(inspector, "settlement_summary", "file_after_sale_amount", "DECIMAL(18,4) NULL"),
            _add_column_plan(inspector, "settlement_summary", "file_goods_amount", "DECIMAL(18,4) NULL"),
            _add_column_plan(inspector, "settlement_summary", "file_fee_amount", "DECIMAL(18,4) NULL"),
            _add_column_plan(inspector, "settlement_summary", "file_fee_detail", "TEXT NULL"),
            _add_column_plan(inspector, "settlement_summary", "file_customs_tax", "DECIMAL(18,4) NULL"),
            _add_column_plan(inspector, "settlement_summary", "file_payable_amount", "DECIMAL(18,4) NULL"),
            _add_index_plan(inspector, "import_batch", "ix_import_batch_import_job_id", "import_job_id"),
            _add_index_plan(inspector, "import_draft", "ix_import_draft_import_job_id", "import_job_id"),
            _add_index_plan(inspector, "import_draft", "ix_import_draft_import_batch_id", "import_batch_id"),
            _modify_mediumtext_plan(inspector, "settlement_revision", "old_value"),
            _modify_mediumtext_plan(inspector, "settlement_revision", "new_value"),
        ]
        if statement
    ]
    return statements


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    apply = "--apply" in args
    statements = build_statements()
    for statement in statements:
        print(statement)
    if not statements and not apply:
        print("多文件导入草稿列已存在；新表由 init_db/create_all 负责创建")
        return 0
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
