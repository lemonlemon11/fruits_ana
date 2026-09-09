import asyncio
import csv
import io
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.api import imports as imports_api
from app.db import Base, SessionLocal, engine
from app.main import app
from app.models import DataIssue, ImportBatch, SaleRecord, SourceFile


@pytest.fixture(autouse=True)
def clean_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture(autouse=True)
def isolated_upload_dir(tmp_path, monkeypatch):
    upload_dir = tmp_path / "uploads"
    upload_dir.mkdir()
    monkeypatch.setattr(imports_api, "UPLOAD_DIR", upload_dir)
    return upload_dir


def test_upload_lists_batch_and_downloads_issues_csv():
    payload = (
        "柜号,日期,等级,数量,单价,金额\n"
        "C1,2026-01-01,A6,2,5,11\n"
    ).encode("utf-8-sig")
    client = TestClient(app)

    uploaded = client.post(
        "/api/imports", files=[("files", ("sales.csv", payload, "text/csv"))]
    )

    assert uploaded.status_code == 200
    result = uploaded.json()["imports"][0]
    assert result["success_count"] == 1
    assert result["warning_count"] == 1
    assert len(client.get("/api/imports").json()["imports"]) == 1
    issues_response = client.get(f"/api/imports/{result['batch_id']}/issues")
    assert issues_response.status_code == 200
    assert issues_response.json()["issues"][0]["issue_type"] == "amount_mismatch"
    csv_response = client.get(f"/api/imports/{result['batch_id']}/issues.csv")
    assert csv_response.status_code == 200
    assert "amount_mismatch" in csv_response.content.decode("utf-8-sig")


def test_duplicate_upload_is_idempotent_and_missing_batch_is_404():
    payload = (
        "柜号,日期,等级,数量,单价,金额\n"
        "C2,2026-01-02,BC6,2,5,10\n"
    ).encode("utf-8-sig")
    client = TestClient(app)

    first = client.post(
        "/api/imports", files=[("files", ("sales.csv", payload, "text/csv"))]
    ).json()["imports"][0]
    second = client.post(
        "/api/imports", files=[("files", ("renamed.csv", payload, "text/csv"))]
    ).json()["imports"][0]

    assert first["status"] == "success"
    assert second["status"] == "duplicate"
    assert second["batch_id"] == first["batch_id"]
    assert len(client.get("/api/imports").json()["imports"]) == 1
    assert client.get("/api/imports/999/issues").status_code == 404
    stored_files = list(imports_api.UPLOAD_DIR.iterdir())
    assert len(stored_files) == 1
    assert stored_files[0].read_bytes() == payload


@pytest.mark.parametrize(
    ("filename", "payload"),
    [
        ("legacy.xls", b"not-an-xls-file"),
        ("broken.xlsx", b"not-an-xlsx-file"),
    ],
)
def test_upload_rejects_unreadable_or_unsupported_excel(filename, payload):
    client = TestClient(app, raise_server_exceptions=False)

    response = client.post(
        "/api/imports",
        files=[("files", (filename, payload, "application/octet-stream"))],
    )

    assert response.status_code == 200
    assert response.json()["imports"][0]["status"] == "failed"
    assert not list(imports_api.UPLOAD_DIR.iterdir())


def test_multi_file_upload_keeps_success_when_another_file_fails():
    valid = (
        "柜号,日期,等级,数量,单价,金额\n"
        "C3,2026-01-03,A6,2,5,10\n"
    ).encode("utf-8-sig")
    client = TestClient(app, raise_server_exceptions=False)

    response = client.post(
        "/api/imports",
        files=[
            ("files", ("valid.csv", valid, "text/csv")),
            ("files", ("broken.xlsx", b"broken", "application/octet-stream")),
        ],
    )

    assert response.status_code == 200
    assert [item["status"] for item in response.json()["imports"]] == [
        "success",
        "failed",
    ]
    assert len(client.get("/api/imports").json()["imports"]) == 1
    assert len(list(imports_api.UPLOAD_DIR.iterdir())) == 1


def test_cleanup_does_not_remove_storage_referenced_by_a_batch():
    payload = (
        "柜号,日期,等级,数量,单价,金额\n"
        "C5,2026-01-05,A6,2,5,10\n"
    ).encode("utf-8-sig")
    response = TestClient(app).post(
        "/api/imports", files=[("files", ("same.csv", payload, "text/csv"))]
    )
    result = response.json()["imports"][0]
    db = SessionLocal()
    assert db.query(ImportBatch).count() == 1
    assert db.query(SourceFile).count() == 1
    assert db.query(SaleRecord).count() == 1
    storage_path = Path(db.query(SourceFile).one().storage_path)
    db.close()
    asyncio.run(imports_api._cleanup_new_upload(storage_path, True))
    assert storage_path.exists()


def test_upload_over_20_mib_returns_failed_result_and_cleans_temp_file():
    client = TestClient(app, raise_server_exceptions=False)
    payload = b"x" * (20 * 1024 * 1024 + 1)

    response = client.post(
        "/api/imports",
        files=[("files", ("too-large.csv", payload, "text/csv"))],
    )

    assert response.status_code == 200
    result = response.json()["imports"][0]
    assert result["status"] == "failed"
    assert "20 MiB" in result["error"]
    assert not list(imports_api.UPLOAD_DIR.iterdir())


def test_upload_reads_in_bounded_chunks():
    class ChunkedUpload:
        filename = "chunked.csv"

        def __init__(self):
            self.read_sizes = []
            self.remaining = b"abc"

        async def read(self, size):
            self.read_sizes.append(size)
            chunk, self.remaining = self.remaining[:size], self.remaining[size:]
            return chunk

    upload = ChunkedUpload()

    path, created = asyncio.run(imports_api._store_upload(upload))

    assert created is True
    assert path.read_bytes() == b"abc"
    assert upload.read_sizes
    assert set(upload.read_sizes) == {imports_api.UPLOAD_CHUNK_SIZE}


def test_import_work_is_offloaded_from_async_endpoint(monkeypatch):
    called_functions = []
    real_run_in_threadpool = imports_api.run_in_threadpool

    async def tracking_run_in_threadpool(function, *args, **kwargs):
        called_functions.append(function)
        return await real_run_in_threadpool(function, *args, **kwargs)

    monkeypatch.setattr(imports_api, "run_in_threadpool", tracking_run_in_threadpool)
    payload = (
        "柜号,日期,等级,数量,单价,金额\n"
        "C4,2026-01-04,A6,2,5,10\n"
    ).encode("utf-8-sig")

    response = TestClient(app).post(
        "/api/imports", files=[("files", ("sales.csv", payload, "text/csv"))]
    )

    assert response.status_code == 200
    assert imports_api._import_stored_file in called_functions


def test_issues_csv_prefixes_formula_like_cells():
    db = SessionLocal()
    batch = ImportBatch(file_name="unsafe.csv", status="partial", failure_count=6)
    db.add(batch)
    db.flush()
    raw_values = ["=cmd", "+cmd", "-cmd", "@cmd", "\tcmd", "\rcmd"]
    db.add_all(
        [
            DataIssue(
                import_batch_id=batch.id,
                issue_type="invalid",
                severity="error",
                message="invalid",
                raw_value=value,
            )
            for value in raw_values
        ]
    )
    db.commit()
    batch_id = batch.id
    db.close()

    response = TestClient(app).get(f"/api/imports/{batch_id}/issues.csv")
    rows = list(csv.reader(io.StringIO(response.content.decode("utf-8-sig"))))

    assert [row[-1] for row in rows[1:]] == [f"'{value}" for value in raw_values]
