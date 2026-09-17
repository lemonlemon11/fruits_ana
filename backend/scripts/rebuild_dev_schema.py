"""开发期清库重建（ADR-027）：删表 + 建表，不做数据迁移。

背景：规格（头数 / KG）由数值列改为文本列并新增 min/max 派生列，
开发阶段按确认口径直接清库、用 ``tickets/`` 重新导入，不写迁移脚本。

两种模式：

- 默认：删掉本项目全部 17 张表后重建（账号、权限、字典也一起重来）；
- ``--business``：只删**业务数据表**（导入批次 / 销售明细 / 结算摘要 / 售后 / 费用 /
  数据问题 / 原始文件 / 解析草稿 / AI 结论），保留 ``user`` / ``user_session`` /
  ``admin_*`` / ``entry_field_option``，避免把登录账号与录单字典一起清掉。

安全闸门（ADR-021 / ADR-024）：非测试库执行删表必须显式设置
``FRUIT_ANALYSIS_ALLOW_DESTRUCTIVE=1``，否则脚本直接拒绝执行。

用法（在 ``backend`` 目录）：

    .venv/bin/python scripts/rebuild_dev_schema.py --business            # 演练
    FRUIT_ANALYSIS_ALLOW_DESTRUCTIVE=1 .venv/bin/python scripts/rebuild_dev_schema.py --business --apply

重建后由 ``scripts/load_tickets.py`` 或导入页把 ``tickets/`` 的结算单重新导入。
"""

from __future__ import annotations

import sys

from app.db import Base, describe_database, engine, init_db
from app import models  # noqa: F401  # 注册全部模型


BUSINESS_TABLES = (
    "ai_analysis",
    "data_issue",
    "import_draft",
    "import_job",
    "import_batch",
    "sale_record",
    "settlement_after_sale_item",
    "settlement_fee_item",
    "settlement_revision",
    "settlement_summary",
    "source_file",
)


def select_tables(business_only: bool) -> list:
    """返回要删除的表对象；``--business`` 时只取业务数据表。"""

    wanted = set(BUSINESS_TABLES) if business_only else set(Base.metadata.tables)
    return [table for name, table in Base.metadata.tables.items() if name in wanted]


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    business_only = "--business" in args
    apply = "--apply" in args
    tables = select_tables(business_only)
    names = sorted(table.name for table in tables)
    kept = sorted(set(Base.metadata.tables) - set(names))

    print(f"目标库：{describe_database(engine.url)}")
    print(f"模式：{'仅业务数据表' if business_only else '全部表'}")
    print(f"将删除并重建 {len(names)} 张表：{'、'.join(names)}")
    if kept:
        print(f"保留 {len(kept)} 张表：{'、'.join(kept)}")
    if not apply:
        print("dry-run：加 --apply 执行（非测试库仍需 FRUIT_ANALYSIS_ALLOW_DESTRUCTIVE=1）")
        return 0

    Base.metadata.drop_all(bind=engine, tables=tables)
    init_db()
    print("已重建；请重新导入 tickets/ 下的结算单")
    return 0


if __name__ == "__main__":
    sys.exit(main())
