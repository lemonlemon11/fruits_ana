"""自然语言问答接口。

前端只发一个问题，后端决定调用哪些分析服务；返回正文的同时回带调用步骤，
让用户能看到每个数字的来源（口径与看板一致）。

权限：整个路由要求 `ask:view`（管理端角色授权控制），当前只有 `fruit_admin` 持有。
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import require_permission
from ..db import get_db
from ..schemas import AskRequest, AskResponse
from ..services.ai_analysis_service import AiCallFailed, AiNotConfigured
from ..services.ask_service import answer_question


router = APIRouter(
    prefix="/api/ask",
    tags=["ask"],
    dependencies=[Depends(require_permission("ask:view"))],
)


@router.post("", response_model=AskResponse)
def ask(payload: AskRequest, db: Session = Depends(get_db)) -> dict:
    """按提问返回结论，并列出本次用到的数据。"""

    try:
        return answer_question(
            db,
            question=payload.question.strip(),
            history=[item.model_dump() for item in payload.history],
        )
    except AiNotConfigured as exc:
        raise HTTPException(503, str(exc)) from exc
    except AiCallFailed as exc:
        raise HTTPException(502, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
