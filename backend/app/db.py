"""SQLite 数据库引擎和会话配置。"""

from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker


BACKEND_DIR = Path(__file__).resolve().parents[1]
DEFAULT_DATABASE_PATH = BACKEND_DIR / "data" / "fruit_analysis.sqlite3"
DATABASE_PATH = Path(
    os.getenv("FRUIT_ANALYSIS_DB_PATH", str(DEFAULT_DATABASE_PATH))
).expanduser()
DATABASE_URL = f"sqlite:///{DATABASE_PATH.as_posix()}"


class Base(DeclarativeBase):
    """所有数据库模型的基类。"""


def _create_engine():
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    return create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
        future=True,
    )


engine = _create_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def init_db() -> None:
    """初始化已注册模型对应的数据表。"""

    Base.metadata.create_all(bind=engine)


def get_db():
    """为依赖注入提供一个可自动关闭的数据库会话。"""

    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
