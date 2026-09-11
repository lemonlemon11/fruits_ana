"""为 ``import_batch`` 增加「适配后单号」列并回填历史数据（ADR-015）。

背景：填写人员单号写法不统一（``宝贝01`` / ``宝贝003`` / ``宝贝L004``），
页面需要统一展示；原始写法必须保留在 ``order_no`` 里，便于追溯。
本脚本只做「加列 + 按规则回填」，通用逻辑见 ``scripts/column_backfill.py``。

脚本幂等：列已存在且已回填时不会重复执行。默认演练，``--apply`` 写库，
``--force`` 按当前规则重算所有行。
"""

from __future__ import annotations

import sys
from typing import Callable

from sqlalchemy import Engine

from app.services.order_no_naming import normalize_order_no
from scripts.column_backfill import MigrationPlan, build_column_plan, run_cli
from scripts.column_backfill import run_column_migration


TABLE = "import_batch"
COLUMN = "order_no_normalized"
COLUMN_TYPE = "VARCHAR(128)"
SOURCE_COLUMN = "order_no"
SNAPSHOT_PREFIX = "snapshot-order-no"

_OPTIONS = {
    "table": TABLE,
    "column": COLUMN,
    "column_type": COLUMN_TYPE,
    "source_column": SOURCE_COLUMN,
    "compute": normalize_order_no,
}


def build_plan(engine: Engine, *, force: bool = False) -> MigrationPlan:
    """返回待执行的 DDL 与待回填数据。"""

    return build_column_plan(engine, force=force, **_OPTIONS)


def migrate(
    engine: Engine,
    *,
    apply: bool = False,
    force: bool = False,
    logger: Callable[[str], None] = print,
) -> list[str]:
    """执行或演练迁移，返回实际执行的语句列表。"""

    return run_column_migration(engine, apply=apply, force=force, logger=logger, **_OPTIONS)


def main(argv: list[str] | None = None) -> int:
    return run_cli(
        description=__doc__,
        snapshot_prefix=SNAPSHOT_PREFIX,
        argv=argv,
        **_OPTIONS,
    )


if __name__ == "__main__":
    sys.exit(main())
