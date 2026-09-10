"""把认证用户表从邮箱登录迁移为用户名（display_name）登录。

迁移内容：删除 `user.email` 列及其唯一索引，并为 `user.display_name` 建立唯一索引。
脚本幂等，可重复执行；存在忽略大小写的重名用户时会拒绝执行。
"""

from __future__ import annotations

import sys

from sqlalchemy import Engine, inspect, text

from app.db import engine as default_engine


EMAIL_INDEX = "ux_user_email"
DISPLAY_NAME_INDEX = "ux_user_display_name"
DUPLICATE_QUERY = text(
    "SELECT LOWER(display_name) AS normalized, COUNT(*) AS total "
    "FROM user GROUP BY normalized HAVING total > 1"
)


def migrate(engine: Engine = default_engine) -> list[str]:
    """执行迁移并返回实际执行的语句，已迁移完成时返回空列表。"""

    inspector = inspect(engine)
    if not inspector.has_table("user"):
        return []

    columns = {column["name"] for column in inspector.get_columns("user")}
    indexes = {index["name"] for index in inspector.get_indexes("user")}

    statements: list[str] = []
    if EMAIL_INDEX in indexes:
        statements.append(f"ALTER TABLE user DROP INDEX {EMAIL_INDEX}")
    if "email" in columns:
        statements.append("ALTER TABLE user DROP COLUMN email")
    if DISPLAY_NAME_INDEX not in indexes:
        statements.append(
            f"ALTER TABLE user ADD UNIQUE INDEX {DISPLAY_NAME_INDEX} (display_name)"
        )
    if not statements:
        return []

    with engine.connect() as connection:
        duplicates = connection.execute(DUPLICATE_QUERY).all()
    if duplicates:
        names = ", ".join(f"{row.normalized}({row.total})" for row in duplicates)
        raise RuntimeError(f"存在重名用户，请先人工处理后重试：{names}")

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))
    return statements


def main() -> int:
    executed = migrate()
    if not executed:
        print("user 表已是用户名登录结构，无需迁移。")
        return 0
    for statement in executed:
        print(f"已执行：{statement}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
