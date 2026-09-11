"""通用「加列 + 回填」迁移工具：幂等、默认演练、可选快照。

结算单命名适配（ADR-015 单号 / ADR-016 商号）都需要「新增展示列 + 按规则回填」，
这里抽出共用实现，具体迁移脚本只描述表、列与计算规则。
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from sqlalchemy import Engine, inspect, text

from app.db import BACKEND_DIR
from scripts.backfill_settlement_identity import quote, write_snapshot


DEFAULT_SNAPSHOT_DIR = BACKEND_DIR / "data"
Compute = Callable[[str | None], str | None]


@dataclass
class MigrationPlan:
    """待执行的 DDL 与待回填的行，列表顺序即执行顺序。"""

    ddl: list[str] = field(default_factory=list)
    backfills: list[tuple[int, str | None, str | None]] = field(default_factory=list)

    @property
    def statements(self) -> list[str]:
        return list(self.ddl)


def _has_table(inspector, name: str) -> bool:
    return name in inspector.get_table_names()


def _columns(inspector, table: str) -> set[str]:
    return {column["name"] for column in inspector.get_columns(table)}


def add_column_sql(table: str, column: str, column_type: str) -> str:
    return f"ALTER TABLE {quote(table)} ADD COLUMN {quote(column)} {column_type} NULL"


def _pending_rows(
    engine: Engine,
    *,
    table: str,
    column: str,
    source_column: str,
    column_exists: bool,
    force: bool,
) -> list[tuple[int, str | None]]:
    """返回需要回填的 (id, 原始值)；默认只处理尚未适配的行。"""

    statement = f"SELECT {quote('id')}, {quote(source_column)} FROM {quote(table)}"
    if column_exists and not force:
        statement += f" WHERE {quote(column)} IS NULL"
    statement += f" ORDER BY {quote('id')}"
    with engine.connect() as connection:
        return [(row[0], row[1]) for row in connection.execute(text(statement)).all()]


def build_column_plan(
    engine: Engine,
    *,
    table: str,
    column: str,
    column_type: str,
    source_column: str,
    compute: Compute,
    force: bool = False,
) -> MigrationPlan:
    """返回待执行的 DDL 与待回填数据。"""

    inspector = inspect(engine)
    if not _has_table(inspector, table):
        return MigrationPlan()
    plan = MigrationPlan()
    column_exists = column in _columns(inspector, table)
    if not column_exists:
        plan.ddl.append(add_column_sql(table, column, column_type))
    for row_id, raw in _pending_rows(
        engine,
        table=table,
        column=column,
        source_column=source_column,
        column_exists=column_exists,
        force=force,
    ):
        plan.backfills.append((row_id, raw, compute(raw)))
    return plan


def run_column_migration(
    engine: Engine,
    *,
    table: str,
    column: str,
    column_type: str,
    source_column: str,
    compute: Compute,
    apply: bool = False,
    force: bool = False,
    logger: Callable[[str], None] = print,
) -> list[str]:
    """执行或演练迁移，返回实际执行的 DDL 语句列表。"""

    plan = build_column_plan(
        engine,
        table=table,
        column=column,
        column_type=column_type,
        source_column=source_column,
        compute=compute,
        force=force,
    )
    executed: list[str] = []
    if not apply:
        for statement in plan.ddl:
            logger(f"[演练] {statement}")
        for row_id, raw, normalized in plan.backfills:
            logger(f"[演练] #{row_id} {source_column}={raw!r} → {normalized!r}")
        return executed

    with engine.begin() as connection:
        for statement in plan.ddl:
            connection.execute(text(statement))
            executed.append(statement)
    with engine.begin() as connection:
        for row_id, _raw, normalized in plan.backfills:
            connection.execute(
                text(
                    f"UPDATE {quote(table)} SET {quote(column)} = :normalized "
                    f"WHERE {quote('id')} = :row_id"
                ),
                {"normalized": normalized, "row_id": row_id},
            )
    return executed


def run_cli(
    *,
    description: str,
    table: str,
    column: str,
    column_type: str,
    source_column: str,
    compute: Compute,
    snapshot_prefix: str,
    argv: list[str] | None = None,
) -> int:
    """命令行入口：默认演练，``--apply`` 才写库，``--force`` 重算已回填行。"""

    parser = argparse.ArgumentParser(
        description=description, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--apply", action="store_true", help="真正写入数据库；默认只演练")
    parser.add_argument("--force", action="store_true", help="按当前规则重算所有行")
    parser.add_argument("--snapshot-dir", type=Path, default=DEFAULT_SNAPSHOT_DIR)
    parser.add_argument(
        "--skip-snapshot", action="store_true", help="跳过 SQL 快照（不建议）"
    )
    args = parser.parse_args(argv)
    from app.db import engine

    if args.apply and not args.skip_snapshot:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        snapshot = write_snapshot(
            engine, args.snapshot_dir / f"{snapshot_prefix}-{stamp}.sql"
        )
        print(f"已导出迁移快照：{snapshot}")
    executed = run_column_migration(
        engine,
        table=table,
        column=column,
        column_type=column_type,
        source_column=source_column,
        compute=compute,
        apply=args.apply,
        force=args.force,
    )
    if not args.apply:
        print("演练完成，未写入数据库。确认无误后加 --apply 执行。")
        return 0
    for statement in executed:
        print(f"已执行：{statement}")
    print("迁移完成。")
    return 0


__all__ = [
    "Compute",
    "DEFAULT_SNAPSHOT_DIR",
    "MigrationPlan",
    "add_column_sql",
    "build_column_plan",
    "run_cli",
    "run_column_migration",
]
