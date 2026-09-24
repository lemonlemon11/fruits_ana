"""FastAPI 应用入口。"""

from __future__ import annotations

import time
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.analytics import router as analytics_router
from .api.ask import router as ask_router
from .api.auth import router as auth_router
from .api.forgot_password import router as forgot_password_router
from .api.entry import router as entry_router
from .api.exports import router as exports_router
from .api.imports import router as imports_router
from .api.notifications import router as notifications_router
from .api.settlements import router as settlements_router
from .db import init_db
from .logging_config import configure_logging, get_logger, request_id_var


configure_logging()
logger = get_logger()


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="SLD-水果市场销售分析",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS配置 - 支持demo前端
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://120.48.117.234:53002",
        "http://127.0.0.1:53002",
        "http://localhost:53002",
        "http://120.48.117.234:5173",  # Vite开发服务器
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(forgot_password_router)
app.include_router(analytics_router)
app.include_router(ask_router)
app.include_router(entry_router)
app.include_router(exports_router)
app.include_router(imports_router)
app.include_router(notifications_router)
app.include_router(settlements_router)


@app.middleware("http")
async def log_requests(request, call_next):
    """记录每个请求的耗时、状态码与请求 ID；未捕获异常落 error 日志。"""

    request_id = request.headers.get("X-Request-ID") or uuid4().hex[:12]
    token = request_id_var.set(request_id)
    started = time.perf_counter()
    try:
        response = await call_next(request)
        duration_ms = (time.perf_counter() - started) * 1000
        response.headers["X-Request-ID"] = request_id
        _log_request(request.method, request.url.path, response.status_code, duration_ms)
        return response
    except Exception:
        duration_ms = (time.perf_counter() - started) * 1000
        logger.exception(
            "request failed method=%s path=%s status=500 duration_ms=%.1f",
            request.method,
            request.url.path,
            duration_ms,
        )
        raise
    finally:
        request_id_var.reset(token)


def _log_request(method: str, path: str, status_code: int, duration_ms: float) -> None:
    if status_code >= 500:
        logger.error(
            "request completed method=%s path=%s status=%s duration_ms=%.1f",
            method,
            path,
            status_code,
            duration_ms,
        )
    elif status_code >= 400:
        logger.warning(
            "request completed method=%s path=%s status=%s duration_ms=%.1f",
            method,
            path,
            status_code,
            duration_ms,
        )
    else:
        logger.info(
            "request completed method=%s path=%s status=%s duration_ms=%.1f",
            method,
            path,
            status_code,
            duration_ms,
        )


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    """返回服务存活状态。"""

    return {"status": "ok"}
