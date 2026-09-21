"""手工录单暂存草稿表，幂等可重复执行。

新增表：
- ``entry_draft``：按 ``user_id`` 唯一保存一份未提交手工单 JSON。

默认演练，传入 ``--apply`` 才写库；新表由 ``Base.metadata.create_all`` 创建。
"""

from __future__ import annotations

import sys

from sqlalchemy import inspect

from app.db import Base, engine
from app import models  # noqa: F401  # 注册全部模型


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    apply = "--apply" in args
    inspector = inspect(engine)
    if "entry_draft" in inspector.get_table_names():
        print("手工录单暂存草稿表已存在；无需处理")
        return 0
    if not apply:
        print("dry-run：将创建 entry_draft；加 --apply 写库")
        return 0

    with engine.begin() as connection:
        Base.metadata.create_all(bind=connection)
    print("applied")
    return 0


if __name__ == "__main__":
    sys.exit(main())
