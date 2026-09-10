"""数据库引擎和会话配置。"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Mapping

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.engine import URL, make_url
from sqlalchemy.orm import DeclarativeBase, sessionmaker


BACKEND_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND_DIR / ".env", override=False)


def build_database_url(environ: Mapping[str, str]) -> str | URL:
    """从环境变量构建数据库连接，显式 URL 的优先级最高。"""

    if explicit_url := environ.get("FRUIT_ANALYSIS_DATABASE_URL"):
        return explicit_url

    password = environ.get("FRUIT_ANALYSIS_DB_PASSWORD")
    if not password:
        raise RuntimeError("缺少必填配置 FRUIT_ANALYSIS_DB_PASSWORD")

    try:
        port = int(environ.get("FRUIT_ANALYSIS_DB_PORT", "3306"))
    except ValueError as exc:
        raise RuntimeError("FRUIT_ANALYSIS_DB_PORT 必须是整数") from exc

    return URL.create(
        "mysql+pymysql",
        username=environ.get("FRUIT_ANALYSIS_DB_USER", "root"),
        password=password,
        host=environ.get("FRUIT_ANALYSIS_DB_HOST", "127.0.0.1"),
        port=port,
        database=environ.get("FRUIT_ANALYSIS_DB_NAME", "fruits_ana"),
        query={"charset": "utf8mb4"},
    )


def engine_options(database_url: str | URL) -> dict[str, object]:
    """返回适配当前数据库方言的连接池参数。"""

    if make_url(database_url).get_backend_name() == "sqlite":
        return {"connect_args": {"check_same_thread": False}}
    return {"pool_pre_ping": True, "pool_recycle": 1800}


DATABASE_URL = build_database_url(os.environ)


class Base(DeclarativeBase):
    """所有数据库模型的基类。"""


def _create_engine(database_url: str | URL = DATABASE_URL):
    url = make_url(database_url)
    if url.get_backend_name() == "sqlite" and url.database not in (None, ":memory:"):
        Path(url.database).expanduser().parent.mkdir(parents=True, exist_ok=True)
    return create_engine(
        database_url,
        future=True,
        **engine_options(database_url),
    )


engine = _create_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def init_db() -> None:
    """初始化已注册模型对应的数据表。"""

    # 延迟导入，避免 Base 定义期间的循环依赖，同时保证应用启动时模型已注册。
    from . import models  # noqa: F401

    Base.metadata.create_all(bind=engine)


def get_db():
    """为依赖注入提供一个可自动关闭的数据库会话。"""

    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
