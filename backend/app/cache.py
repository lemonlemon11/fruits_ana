"""进程内短 TTL 结果缓存。

数据库部署在远程公网（单次往返 ~50ms）时，权限/菜单/筛选选项这类
「读多、允许分钟级滞后」的查询适合进程内缓存，摊平每个请求的固定
往返开销。多 worker 部署下各进程独立缓存，语义一致（见 start.sh 的
BACKEND_WORKERS）；测试通过 ``clear_all`` 做用例间隔离。
"""

from __future__ import annotations

import threading
import time
from typing import Any

DEFAULT_TTL_SECONDS = 60.0
_MAX_ENTRIES = 512

_entries: dict[str, tuple[float, Any]] = {}
_lock = threading.Lock()


def get(key: str, ttl: float = DEFAULT_TTL_SECONDS) -> Any | None:
    """读缓存；未命中或已过期返回 None（调用方需自行回源查询）。"""

    with _lock:
        entry = _entries.get(key)
        if entry is None:
            return None
        cached_at, value = entry
        if time.monotonic() - cached_at > ttl:
            _entries.pop(key, None)
            return None
        return value


def put(key: str, value: Any) -> None:
    """写缓存；条目过多时淘汰最旧一半，防止长期运行膨胀。"""

    with _lock:
        _entries[key] = (time.monotonic(), value)
        if len(_entries) > _MAX_ENTRIES:
            oldest = sorted(_entries.items(), key=lambda item: item[1][0])
            for stale_key, _ in oldest[: len(_entries) // 2]:
                _entries.pop(stale_key, None)


def clear_all() -> None:
    """清空全部缓存条目；测试隔离与运维刷新共用。"""

    with _lock:
        _entries.clear()
