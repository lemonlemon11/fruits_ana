"""把 ``sale_record.grade`` 的检查约束从 A/B/C 扩展为 A-F 与 OTHER。

业务背景：等级不再只有 A/B/C，识别不出的写法统一归入 OTHER。
``create_all`` 不会修改已有数据库里的 ``ck_sale_record_grade`` 约束，因此需要本脚本
对已有 MySQL 库做一次幂等迁移：删除旧约束，再按新口径重建。

脚本默认演练，``--apply`` 才写库；重复执行不会重复加约束。
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass, field
from typing import Callable

from sqlalchemy import Engine, inspect, text

from app.db import engine


TABLE = "sale_record"
CONSTRAINT = "ck_sale_record_grade"
GRADE_VALUES = ("A", "B", "AB", "C", "D", "E", "F", "OTHER")
NEW_SQL = f"grade IN ({', '.join(repr(value) for value in GRADE_VALUES)})"
ENUM_SQL = f"ENUM({', '.join(repr(value) for value in GRADE_VALUES)})"


def quote(identifier: str) -> str:
    return f"`{identifier}`"


@dataclass
class MigrationPlan:
    """按执行顺序保存的 DDL 语句。"""

    statements: list[str] = field(default_factory=list)
    needs_manual_rebuild: bool = False


def _constraints(engine: Engine, table: str) -> list[dict]:
    inspector = inspect(engine)
    if table not in inspector.get_table_names():
        return []
    return inspector.get_check_constraints(table)


def _has_new_grade_set(sqltext: str | None) -> bool:
    if not sqltext:
        return False
    normalized = sqltext.replace(" ", "").replace("'", "").replace('"', "")
    return all(value in normalized for value in GRADE_VALUES)


def _column_type(engine: Engine, table: str, column: str) -> str:
    inspector = inspect(engine)
    if table not in inspector.get_table_names():
        return ""
    for item in inspector.get_columns(table):
        if item.get("name") == column:
            return str(item.get("type") or "")
    return ""


def _needs_enum_expansion(engine: Engine) -> bool:
    column_type = _column_type(engine, TABLE, "grade")
    normalized = column_type.replace(" ", "").replace("'", "").replace('"', "")
    return "enum" in normalized.lower() and not all(
        value in normalized for value in GRADE_VALUES
    )


def build_plan(engine: Engine) -> MigrationPlan:
    """返回需要执行的 DDL；不识别旧约束时不强行修改。"""

    plan = MigrationPlan()
    if engine.dialect.name != "mysql":
        return plan
    if TABLE not in inspect(engine).get_table_names():
        return plan
    if _needs_enum_expansion(engine):
        plan.statements.append(
            f"ALTER TABLE {quote(TABLE)} MODIFY COLUMN {quote('grade')} {ENUM_SQL} NOT NULL"
        )
    for constraint in _constraints(engine, TABLE):
        if constraint.get("name") != CONSTRAINT:
            continue
        sqltext = str(constraint.get("sqltext") or "")
        if _has_new_grade_set(sqltext):
            return plan
        plan.statements.append(
            f"ALTER TABLE {quote(TABLE)} DROP CHECK {quote(CONSTRAINT)}"
        )
        break
    plan.statements.append(
        f"ALTER TABLE {quote(TABLE)} ADD CONSTRAINT {quote(CONSTRAINT)} CHECK ({NEW_SQL})"
    )
    return plan


def migrate(
    engine: Engine,
    *,
    apply: bool = False,
    logger: Callable[[str], None] = print,
) -> list[str]:
    """执行或演练迁移，返回实际执行的 DDL 语句。"""

    plan = build_plan(engine)
    if engine.dialect.name != "mysql":
        logger("[跳过] 仅 MySQL 支持直接重建检查约束；SQLite 请重建表或使用新库。")
        return []
    if not apply:
        for statement in plan.statements:
            logger(f"[演练] {statement}")
        return []
    executed: list[str] = []
    with engine.begin() as connection:
        for statement in plan.statements:
            connection.execute(text(statement))
            executed.append(statement)
    return executed


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="真正写入数据库；默认只演练")
    args = parser.parse_args(argv)
    executed = migrate(engine, apply=args.apply)
    if executed:
        for statement in executed:
            print(statement)
    return 0


if __name__ == "__main__":
    sys.exit(main())
