"""结算单上传、批次查询和问题下载接口。"""

from __future__ import annotations

import csv
import hashlib
import io
import os
from pathlib import Path
from uuid import uuid4
from zipfile import BadZipFile

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from ..db import BACKEND_DIR, SessionLocal, get_db
from ..models import DataIssue, ImportBatch, SourceFile
from ..services.import_service import import_file


router = APIRouter(prefix="/api/imports", tags=["imports"])
UPLOAD_DIR = BACKEND_DIR / "data" / "uploads"
MAX_UPLOAD_SIZE = 20 * 1024 * 1024
UPLOAD_CHUNK_SIZE = 1024 * 1024


class UploadProblem(ValueError):
    """单个上传文件可安全反馈给调用方的错误。"""


@router.post("")
async def upload_imports(
    files: list[UploadFile] = File(...),
):
    results = [await _process_upload(upload) for upload in files]
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


async def _process_upload(upload: UploadFile) -> dict:
    filename = upload.filename or "upload.csv"
    try:
        path, created = await _store_upload(upload)
    except UploadProblem as exc:
        return _failed_result(filename, str(exc))
    try:
        result = await run_in_threadpool(
            _import_stored_file, path, filename, path.suffix
        )
    except (BadZipFile, OSError, UnicodeError, ValueError):
        await _cleanup_new_upload(path, created)
        return _failed_result(filename, "无法解析文件")
    except Exception:
        await _cleanup_new_upload(path, created)
        return _failed_result(filename, "导入文件失败")
    if result.status == "duplicate":
        await _cleanup_new_upload(path, created)
    return result.to_dict()


def _import_stored_file(path: Path, filename: str, source_type: str):
    db = SessionLocal()
    try:
        return import_file(db, path, filename, source_type)
    finally:
        db.close()


async def _cleanup_new_upload(path: Path, created: bool) -> None:
    if created and await run_in_threadpool(_is_unreferenced_upload, path):
        await run_in_threadpool(path.unlink, missing_ok=True)


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
