from datetime import date
from decimal import Decimal
from io import BytesIO

import openpyxl
import pytest
from fastapi.testclient import TestClient

from app.db import Base, SessionLocal, engine
from app.main import app
from app.models import ImportBatch, SaleRecord, SourceFile, StandardGrade


@pytest.fixture(autouse=True)
def clean_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


def seed_sale():
    db = SessionLocal()
    batch = ImportBatch(file_name="sample.csv", status="success")
    source = SourceFile(
        file_name="sample.csv",
        file_hash="export-test-hash",
        storage_path="backend/data/uploads/sample.csv",
        import_batch=batch,
    )
    db.add_all([batch, source])
    db.flush()
    db.add(
        SaleRecord(
            import_batch_id=batch.id,
            source_file_id=source.id,
            container_id="C1",
            sale_date=date(2026, 1, 2),
            grade=StandardGrade.C,
            grade_raw="BC6",
            quantity=Decimal("2"),
            unit_price=Decimal("8"),
            amount=Decimal("16"),
        )
    )
    db.commit()
    db.close()


def test_overview_csv_contains_metrics_scope_and_mapping():
    seed_sale()

    response = TestClient(app).get(
        "/api/exports/overview.csv",
        params={"start_date": "2026-01-01", "end_date": "2026-01-31"},
    )

    assert response.status_code == 200
    text = response.content.decode("utf-8-sig")
    assert "C,2.0,16.0,8.0,1.0" in text
    assert "2026-01-01" in text
    assert "BC" in text and "C" in text


def test_container_xlsx_and_source_trace_are_available():
    seed_sale()
    client = TestClient(app)

    export = client.get("/api/exports/containers/C1.xlsx")
    trace = client.get("/api/exports/records/1/source")

    assert export.status_code == 200
    assert export.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    assert export.content[:2] == b"PK"
    assert trace.status_code == 200
    assert trace.json()["source_file"]["file_name"] == "sample.csv"
    assert trace.json()["record"]["grade_raw"] == "BC6"


def test_exports_escape_spreadsheet_formula_prefixes():
    seed_sale()
    db = SessionLocal()
    record = db.query(SaleRecord).one()
    record.spec_raw = "=HYPERLINK(\"https://example.invalid\")"
    db.commit()
    db.close()
    client = TestClient(app)

    csv_response = client.get(
        "/api/exports/overview.csv", params={"container_id": "=1+1"}
    )
    xlsx_response = client.get("/api/exports/containers/C1.xlsx")

    assert "'=1+1" in csv_response.content.decode("utf-8-sig")
    workbook = openpyxl.load_workbook(BytesIO(xlsx_response.content), data_only=False)
    detail = workbook["销售明细"]
    spec_column = next(
        cell.column for cell in detail[1] if cell.value == "spec_raw"
    )
    assert detail.cell(2, spec_column).value.startswith("'=")
