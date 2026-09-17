"""数据库引擎和会话配置。

含一条安全约束：**非测试库拒绝执行破坏性 DDL**（`DROP TABLE` / `DROP DATABASE` /
`TRUNCATE` 与 `MetaData.drop_all`）。2026-09-15 曾因临时脚本对真实库执行
`Base.metadata.drop_all(bind=engine)` 误删 12 张表，详见 `docs/DECISIONS.md` ADR-021 / ADR-024。
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Mapping

from dotenv import load_dotenv
from sqlalchemy import MetaData, create_engine, event
from sqlalchemy.engine import URL, Connection, Engine, make_url
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


BACKEND_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND_DIR / ".env", override=False)

ALLOW_DESTRUCTIVE_ENV = "FRUIT_ANALYSIS_ALLOW_DESTRUCTIVE"
_DESTRUCTIVE_STATEMENT = re.compile(
    r"^\s*(?:drop\s+(?:table|database|schema)\b|truncate\b)",
    re.IGNORECASE,
)


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


def is_test_database(database_url: str | URL) -> bool:
    """判断连接串是否指向可以随意重建的测试库（SQLite 或库名含 test）。"""

    url = make_url(database_url)
    if url.get_backend_name() == "sqlite":
        return True
    return "test" in (url.database or "").lower()


def describe_database(database_url: str | URL) -> str:
    """返回可安全打印的连接描述（不含口令）。"""

    url = make_url(database_url)
    host = url.host or ""
    port = f":{url.port}" if url.port else ""
    return f"{url.get_backend_name()}://{url.username or ''}@{host}{port}/{url.database or ''}"


def _allow_destructive_opt_in(environ: Mapping[str, str] | None = None) -> bool:
    source = os.environ if environ is None else environ
    return str(source.get(ALLOW_DESTRUCTIVE_ENV, "")).strip().lower() in {"1", "true", "yes"}


def assert_destructive_allowed(
    database_url: str | URL,
    operation: str,
    *,
    environ: Mapping[str, str] | None = None,
) -> None:
    """非测试库执行破坏性操作时抛出 `RuntimeError`。"""

    if is_test_database(database_url) or _allow_destructive_opt_in(environ):
        return
    raise RuntimeError(
        f"拒绝在非测试库执行 {operation}：{describe_database(database_url)}；"
        f"确认要执行请显式设置 {ALLOW_DESTRUCTIVE_ENV}=1"
        "（仅限受控的一次性运维，见 docs/DECISIONS.md ADR-021）"
    )


def is_destructive_statement(statement: str) -> bool:
    """判断 SQL 是否为破坏性 DDL 语句。"""

    return bool(_DESTRUCTIVE_STATEMENT.match(statement or ""))


def binding_url(bind: object) -> str | URL:
    """解析 `bind` 指向的数据库；无法识别时按当前连接串处理（fail-closed）。"""

    if isinstance(bind, Engine):
        return bind.url
    if isinstance(bind, Connection):
        return bind.engine.url
    if isinstance(bind, Session):
        return binding_url(bind.get_bind())
    if isinstance(bind, str | URL):
        return bind
    return DATABASE_URL


class GuardedMetaData(MetaData):
    """在非测试库拒绝 `drop_all`，避免误删生产表（ADR-021 / ADR-024）。"""

    def drop_all(self, bind=None, tables=None, checkfirst: bool = True) -> None:
        assert_destructive_allowed(binding_url(bind), "Base.metadata.drop_all")
        return super().drop_all(bind=bind, tables=tables, checkfirst=checkfirst)


class Base(DeclarativeBase):
    """所有数据库模型的基类。"""

    metadata = GuardedMetaData()


def guard_destructive_statement(
    conn, cursor, statement, parameters, context, executemany
) -> None:
    """`before_cursor_execute` 监听器：拦截裸 SQL 的破坏性 DDL。"""

    if is_destructive_statement(statement):
        assert_destructive_allowed(conn.engine.url, f"SQL：{statement.strip()[:80]}")


def _install_destructive_ddl_guard(target_engine: Engine) -> None:
    """给引擎挂上破坏性 DDL 拦截器。"""

    event.listen(target_engine, "before_cursor_execute", guard_destructive_statement)


def _create_engine(database_url: str | URL = DATABASE_URL) -> Engine:
    url = make_url(database_url)
    if url.get_backend_name() == "sqlite" and url.database not in (None, ":memory:"):
        Path(url.database).expanduser().parent.mkdir(parents=True, exist_ok=True)
    created = create_engine(
        database_url,
        future=True,
        **engine_options(database_url),
    )
    _install_destructive_ddl_guard(created)
    return created


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
