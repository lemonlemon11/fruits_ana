"""FastAPI 应用入口。"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI

from .api.analytics import router as analytics_router
from .api.exports import router as exports_router
from .api.imports import router as imports_router
from .db import init_db


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="水果等级销售经营分析平台",
    version="0.1.0",
    lifespan=lifespan,
)
app.include_router(analytics_router)
app.include_router(exports_router)
app.include_router(imports_router)


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    """返回服务存活状态。"""

    return {"status": "ok"}
