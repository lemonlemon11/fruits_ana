"""Pytest 全局测试隔离配置。"""

from __future__ import annotations

import os
from pathlib import Path

import pytest


BACKEND_DIR = Path(__file__).resolve().parents[1]
TEST_DATABASE_PATH = BACKEND_DIR / ".pytest-tmp" / "fruit-analysis-test.sqlite3"

# conftest 会在测试模块收集前导入，确保 app.db 首次初始化即使用隔离数据库。
os.environ["FRUIT_ANALYSIS_DATABASE_URL"] = (
    f"sqlite+pysqlite:///{TEST_DATABASE_PATH.as_posix()}"
)


@pytest.fixture(scope="session", autouse=True)
def prepare_pytest_basetemp(tmp_path_factory):
    """在任何数据库连接建立前完成 pytest 对 basetemp 的初始化清理。"""

    tmp_path_factory._given_basetemp = BACKEND_DIR / ".pytest-tmp" / "runtime"
    tmp_path_factory.getbasetemp()


@pytest.fixture(autouse=True)
def clear_process_caches():
    """每个用例前后清空进程内短 TTL 缓存（权限/菜单/筛选选项等）。

    缓存键只含业务维度（user_id、日期窗口等），而全部用例共用同一个
    sqlite 文件，不清缓存会把上一用例的结果泄漏进下一用例。
    """

    from app import cache as result_cache

    result_cache.clear_all()
    yield
    result_cache.clear_all()
