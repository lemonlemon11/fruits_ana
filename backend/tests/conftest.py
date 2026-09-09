"""Pytest 全局测试隔离配置。"""

from __future__ import annotations

import os
from pathlib import Path

import pytest


BACKEND_DIR = Path(__file__).resolve().parents[1]
TEST_DATABASE_PATH = BACKEND_DIR / ".pytest-tmp" / "fruit-analysis-test.sqlite3"

# conftest 会在测试模块收集前导入，确保 app.db 首次初始化即使用隔离数据库。
os.environ["FRUIT_ANALYSIS_DB_PATH"] = str(TEST_DATABASE_PATH)


@pytest.fixture(scope="session", autouse=True)
def prepare_pytest_basetemp(tmp_path_factory):
    """在任何数据库连接建立前完成 pytest 对 basetemp 的初始化清理。"""

    tmp_path_factory._given_basetemp = BACKEND_DIR / ".pytest-tmp" / "runtime"
    tmp_path_factory.getbasetemp()
