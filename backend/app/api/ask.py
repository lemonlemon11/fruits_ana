"""自然语言问答接口。

前端只发一个问题，后端决定调用哪些分析服务；返回正文的同时回带调用步骤，
让用户能看到每个数字的来源（口径与看板一致）。

权限：整个路由要求 `ask:view`（管理端角色授权控制），当前只有 `fruit_admin` 持有。
每次调用都会写入 `ask_audit_log`，记录用户、问题、工具调用、模型与耗时。
"""

from __future__ import annotations

import time

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import require_permission
from ..db import get_db
from ..models import AskAuditLog, User
from ..schemas import AskRequest, AskResponse
from ..services.ai_analysis_service import AiCallFailed, AiNotConfigured
from ..services.ask_service import answer_question


router = APIRouter(
    prefix="/api/ask",
    tags=["ask"],
)


def _elapsed_ms(started: float) -> int:
    """返回自 ``started`` 起的耗时毫秒数，向下取整且不小于 0。"""

    return max(0, int((time.perf_counter() - started) * 1000))


def _record_audit(
    db: Session,
    *,
    user_id: int,
    question: str,
    status: str,
    tool_calls: list,
    model: str | None,
    duration_ms: int,
    error_type: str | None = None,
    error_message: str | None = None,
) -> None:
    """写入问答调用审计；审计失败不影响原问答结果。"""

    try:
        db.add(
            AskAuditLog(
                user_id=user_id,
                question=question,
                tool_calls=tool_calls,
                model=model,
                status=status,
                duration_ms=duration_ms,
                error_type=error_type,
                error_message=error_message,
            )
        )
        db.commit()
    except Exception:
        db.rollback()


@router.post("", response_model=AskResponse)
def ask(
    payload: AskRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("ask:view")),
) -> dict:
    """按提问返回结论，并列出本次用到的数据。"""

    question = payload.question.strip()
    history = [item.model_dump() for item in payload.history]
    started = time.perf_counter()
    try:
        result = answer_question(db, question=question, history=history)
    except AiNotConfigured as exc:
        db.rollback()
        _record_audit(
            db,
            user_id=current_user.id,
            question=question,
            status="failure",
            tool_calls=[],
            model=None,
            duration_ms=_elapsed_ms(started),
            error_type="AiNotConfigured",
            error_message=str(exc),
        )
        raise HTTPException(503, str(exc)) from exc
    except AiCallFailed as exc:
        db.rollback()
        _record_audit(
            db,
            user_id=current_user.id,
            question=question,
            status="failure",
            tool_calls=[],
            model=None,
            duration_ms=_elapsed_ms(started),
            error_type="AiCallFailed",
            error_message=str(exc),
        )
        raise HTTPException(502, str(exc)) from exc
    except ValueError as exc:
        db.rollback()
        _record_audit(
            db,
            user_id=current_user.id,
            question=question,
            status="failure",
            tool_calls=[],
            model=None,
            duration_ms=_elapsed_ms(started),
            error_type="ValueError",
            error_message=str(exc),
        )
        raise HTTPException(422, str(exc)) from exc

    _record_audit(
        db,
        user_id=current_user.id,
        question=question,
        status="success",
        tool_calls=result.get("steps") or [],
        model=result.get("model"),
        duration_ms=_elapsed_ms(started),
    )
    return result
