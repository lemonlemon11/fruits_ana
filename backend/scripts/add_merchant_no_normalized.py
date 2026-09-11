"""为 ``import_batch`` 增加「适配后商号」列并回填历史数据（ADR-016）。

背景：填写人员对商号的写法不统一（``单637`` / ``单624`` / ``626`` / ``640``），
下拉框与表格里看起来像两套编号。原始商号 ``merchant_no`` 仍是业务唯一键与接口参数，
本脚本只增加展示用的 ``merchant_no_normalized``（``单637`` → ``637``）。

脚本幂等：列已存在且已回填时不会重复执行。默认演练，``--apply`` 写库，
``--force`` 按当前规则重算所有行。
"""

from __future__ import annotations

import sys
from typing import Callable

from sqlalchemy import Engine

from app.services.merchant_no_naming import normalize_merchant_no
from scripts.column_backfill import MigrationPlan, build_column_plan, run_cli
from scripts.column_backfill import run_column_migration


TABLE = "import_batch"
COLUMN = "merchant_no_normalized"
COLUMN_TYPE = "VARCHAR(128)"
SOURCE_COLUMN = "merchant_no"
SNAPSHOT_PREFIX = "snapshot-merchant-no"

_OPTIONS = {
    "table": TABLE,
    "column": COLUMN,
    "column_type": COLUMN_TYPE,
    "source_column": SOURCE_COLUMN,
    "compute": normalize_merchant_no,
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
