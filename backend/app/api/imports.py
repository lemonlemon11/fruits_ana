"""结算单上传、批次查询和问题下载接口。"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import os
from pathlib import Path
from uuid import uuid4
from zipfile import BadZipFile

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from ..auth import require_current_user
from ..db import BACKEND_DIR, SessionLocal, get_db
from ..models import DataIssue, ImportBatch, SourceFile, User
from ..parser.settlement_parser import SettlementParseError
from ..parser.settlement_template import parse_settlement_template
from ..services.import_draft_service import (
    ImportConfirmBlocked,
    confirm_import_job as confirm_import_job_service,
    create_import_job,
    discard_import_job as discard_import_job_service,
    get_import_draft,
    get_import_job,
    update_import_draft as update_import_draft_service,
)
from ..services.import_service import import_file


router = APIRouter(
    prefix="/api/imports",
    tags=["imports"],
    dependencies=[Depends(require_current_user)],
)
UPLOAD_DIR = BACKEND_DIR / "data" / "uploads"
MAX_UPLOAD_SIZE = 20 * 1024 * 1024
UPLOAD_CHUNK_SIZE = 1024 * 1024


class UploadProblem(ValueError):
    """单个上传文件可安全反馈给调用方的错误。"""


@router.post("")
async def upload_imports(
    overwrite: bool = False,
    files: list[UploadFile] = File(...),
):
    results = [await _process_upload(upload, overwrite) for upload in files]
    return {"imports": results}


@router.get("")
def list_imports(db: Session = Depends(get_db)):
    batches = db.query(ImportBatch).order_by(ImportBatch.imported_at.desc()).all()
    return {"imports": [_batch_dict(batch) for batch in batches]}


@router.get("/{batch_id}/issues")
def list_issues(batch_id: int, db: Session = Depends(get_db)):
    _require_batch(db, batch_id)
    issues = _issues_query(db, batch_id).all()
    return {"issues": [_issue_dict(issue) for issue in issues]}


@router.get("/{batch_id}/issues.csv")
def download_issues(batch_id: int, db: Session = Depends(get_db)):
    _require_batch(db, batch_id)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        ["row_number", "severity", "issue_type", "field_name", "message", "raw_value"]
    )
    writer.writerows(
        [
            [_csv_safe(value) for value in (
                x.row_number, x.severity, x.issue_type, x.field_name, x.message, x.raw_value
            )]
            for x in _issues_query(db, batch_id).all()
        ]
    )
    payload = io.BytesIO(output.getvalue().encode("utf-8-sig"))
    headers = {
        "Content-Disposition": f'attachment; filename="import-{batch_id}-issues.csv"'
    }
    return StreamingResponse(payload, media_type="text/csv", headers=headers)


@router.post("/preview")
async def preview_imports(
    files: list[UploadFile] = File(...),
    user: User = Depends(require_current_user),
):
    """新模板多文件上传：只创建草稿任务，不写入正式销售事实。"""

    parsed_files: list[tuple[object, str, str, str]] = []
    failures: list[dict] = []
    for upload in files:
        filename = upload.filename or "upload.csv"
        try:
            path, created = await _store_upload(upload)
        except UploadProblem as exc:
            failures.append({"file_name": filename, "error": str(exc)})
            continue
        try:
            parsed = await run_in_threadpool(parse_settlement_template, path)
            parsed_files.append(
                (parsed, filename, path.stem, str(path))
            )
        except Exception as exc:
            await _cleanup_new_upload(path, created)
            failures.append({"file_name": filename, "error": str(exc) or "无法解析新模板"})

    if not parsed_files:
        raise HTTPException(status_code=422, detail={"message": "没有文件可预览", "failures": failures})

    db = SessionLocal()
    try:
        result = create_import_job(db, parsed_files, user.id)
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
    return {**result, "failures": failures}


@router.get("/jobs/{job_token}")
def read_import_job(
    job_token: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_current_user),
):
    result = get_import_job(db, job_token)
    if result is None:
        raise HTTPException(status_code=404, detail="导入任务不存在")
    return result


@router.get("/jobs/{job_token}/drafts/{draft_token}")
def read_import_draft(
    job_token: str,
    draft_token: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_current_user),
):
    result = get_import_draft(db, job_token, draft_token)
    if result is None:
        raise HTTPException(status_code=404, detail="导入草稿不存在")
    return result


@router.put("/jobs/{job_token}/drafts/{draft_token}")
def update_import_draft(
    job_token: str,
    draft_token: str,
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(require_current_user),
):
    try:
        return update_import_draft_service(db, job_token, draft_token, payload, user.id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/jobs/{job_token}/confirm")
def confirm_import_job(
    job_token: str,
    body: dict,
    db: Session = Depends(get_db),
    user: User = Depends(require_current_user),
):
    force = body.get("force") is True
    try:
        return confirm_import_job_service(db, job_token, force=force, user_id=user.id)
    except ImportConfirmBlocked as exc:
        raise HTTPException(status_code=409, detail=json.loads(str(exc))) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/jobs/{job_token}/discard")
def discard_import_job(
    job_token: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_current_user),
):
    try:
        return discard_import_job_service(db, job_token)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


async def _store_upload(upload: UploadFile) -> tuple[Path, bool]:
    filename = upload.filename or "upload.csv"
    suffix = Path(filename).suffix.lower()
    if suffix not in {".csv", ".xlsx"}:
        raise UploadProblem("仅支持 CSV 或 XLSX 文件")
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    temp_path = UPLOAD_DIR / f".{uuid4().hex}.upload"
    digest, total = hashlib.sha256(), 0
    try:
        with temp_path.open("wb") as output:
            while chunk := await upload.read(UPLOAD_CHUNK_SIZE):
                total += len(chunk)
                if total > MAX_UPLOAD_SIZE:
                    raise UploadProblem("单个文件不能超过 20 MiB")
                digest.update(chunk)
                await run_in_threadpool(output.write, chunk)
        path = UPLOAD_DIR / f"{digest.hexdigest()}{suffix}"
        try:
            os.link(temp_path, path)
        except FileExistsError:
            temp_path.unlink()
            return path, False
        temp_path.unlink()
        return path, True
    except Exception:
        temp_path.unlink(missing_ok=True)
        raise


async def _process_upload(upload: UploadFile, overwrite: bool = False) -> dict:
    filename = upload.filename or "upload.csv"
    try:
        path, created = await _store_upload(upload)
    except UploadProblem as exc:
        return _failed_result(filename, str(exc))
    try:
        result = await run_in_threadpool(
            _import_stored_file, path, filename, path.suffix, overwrite
        )
    except SettlementParseError as exc:
        await _cleanup_new_upload(path, created)
        return _failed_result(filename, str(exc))
    except (BadZipFile, OSError, UnicodeError, ValueError):
        await _cleanup_new_upload(path, created)
        return _failed_result(filename, "无法解析文件")
    except Exception:
        await _cleanup_new_upload(path, created)
        return _failed_result(filename, "导入文件失败")
    if result.status == "conflict":
        await _cleanup_new_upload(path, created)
    if result.obsolete_storage_path:
        await run_in_threadpool(_cleanup_obsolete_upload, Path(result.obsolete_storage_path))
    return result.to_dict()


def _import_stored_file(
    path: Path, filename: str, source_type: str, overwrite: bool = False
):
    db = SessionLocal()
    try:
        return import_file(db, path, filename, source_type, overwrite=overwrite)
    finally:
        db.close()


async def _cleanup_new_upload(path: Path, created: bool) -> None:
    if created and await run_in_threadpool(_is_unreferenced_upload, path):
        await run_in_threadpool(path.unlink, missing_ok=True)


def _cleanup_obsolete_upload(path: Path) -> None:
    """删除被覆盖结算单的旧文件；仍被其他批次引用时保留。"""

    if _is_unreferenced_upload(path):
        path.unlink(missing_ok=True)


def _is_unreferenced_upload(path: Path) -> bool:
    db = SessionLocal()
    try:
        return not db.query(SourceFile.id).filter_by(storage_path=str(path)).first()
    finally:
        db.close()


def _failed_result(filename: str, error: str) -> dict:
    return {
        "status": "failed",
        "file_name": filename,
        "batch_id": None,
        "source_file_id": None,
        "merchant_no": None,
        "merchant_no_normalized": None,
        "order_no": None,
        "order_no_normalized": None,
        "container_no": None,
        "vehicle_no": None,
        "existing_batch_id": None,
        "error_summary": error,
        "success_count": 0,
        "warning_count": 0,
        "failure_count": 1,
        "issues": [],
        "error": error,
    }


def _csv_safe(value):
    if isinstance(value, str) and value.startswith(("=", "+", "-", "@", "\t", "\r")):
        return "'" + value
    return value


def _issues_query(db, batch_id):
    return (
        db.query(DataIssue)
        .filter_by(import_batch_id=batch_id)
        .order_by(DataIssue.row_number, DataIssue.id)
    )


def _require_batch(db, batch_id):
    if not db.get(ImportBatch, batch_id):
        raise HTTPException(404, "导入批次不存在")


def _batch_dict(batch):
    fields = (
        "id",
        "file_name",
        "merchant_no",
        "merchant_no_normalized",
        "order_no",
        "order_no_normalized",
        "container_no",
        "vehicle_no",
        "imported_at",
        "status",
        "success_count",
        "warning_count",
        "failure_count",
        "error_summary",
    )
    return {name: getattr(batch, name) for name in fields}


def _issue_dict(issue):
    fields = (
        "id",
        "row_number",
        "issue_type",
        "severity",
        "field_name",
        "message",
        "raw_value",
    )
    return {name: getattr(issue, name) for name in fields}
