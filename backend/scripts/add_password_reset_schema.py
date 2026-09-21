"""为 verification_code 表添加 purpose 列，创建 password_reset_token 表。

幂等：purpose 列已存在时跳过 ALTER；password_reset_token 已存在时跳过 CREATE。
"""

from __future__ import annotations

import sys
from pathlib import Path

# 确保能导入 app 模块
BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import inspect, text

from app.db import SessionLocal, engine


def run() -> None:
    inspector = inspect(engine)
    vc_cols = {c["name"] for c in inspector.get_columns("verification_code")}

    with engine.begin() as conn:
        if "purpose" not in vc_cols:
            print("添加 verification_code.purpose 列...")
            conn.execute(
                text(
                    "ALTER TABLE verification_code "
                    "ADD COLUMN purpose VARCHAR(20) NOT NULL DEFAULT 'register' "
                    "COMMENT '用途：register / reset_password'"
                )
            )
            print("  done")
        else:
            print("verification_code.purpose 列已存在，跳过")

    tables = set(inspector.get_table_names())
    if "password_reset_token" not in tables:
        print("创建 password_reset_token 表...")
        from app.models import Base
        Base.metadata.create_all(bind=engine, tables=[
            t for t in Base.metadata.sorted_tables
            if t.name == "password_reset_token"
        ])
        print("  done")
    else:
        print("password_reset_token 表已存在，跳过")

    print("迁移完成")


if __name__ == "__main__":
    run()
