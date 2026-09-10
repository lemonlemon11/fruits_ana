import pytest
from sqlalchemy.exc import IntegrityError

from app.db import Base, SessionLocal, engine
from app.models import ImportBatch, SaleRecord, SettlementSummary, SourceFile


@pytest.fixture(autouse=True)
def clean_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


def test_source_file_hash_is_unique():
    db = SessionLocal()
    batch = ImportBatch(file_name="one.xlsx", merchant_no="单624")
    db.add(batch)
    db.flush()
    db.add_all([
        SourceFile(import_batch_id=batch.id, file_name="one.xlsx", file_hash="same"),
        SourceFile(import_batch_id=batch.id, file_name="two.xlsx", file_hash="same"),
    ])
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
    db.close()


def test_sale_record_requires_core_fields():
    db = SessionLocal()
    db.add(SaleRecord())
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
    db.close()


def test_import_batch_requires_unique_merchant_no():
    db = SessionLocal()
    db.add(ImportBatch(file_name="one.xlsx", merchant_no="单624"))
    db.flush()
    db.add(ImportBatch(file_name="two.xlsx", merchant_no="单624"))

    with pytest.raises(IntegrityError):
        db.flush()

    db.rollback()
    db.close()


def test_sale_record_drops_container_columns():
    assert "container_id" not in SaleRecord.__table__.columns
    assert "container_name" not in SaleRecord.__table__.columns


def test_settlement_summary_is_unique_per_batch():
    assert SettlementSummary.__tablename__ == "settlement_summary"
    assert "container_id" not in SettlementSummary.__table__.columns
    assert "container_name" not in SettlementSummary.__table__.columns
    assert {index.name for index in SettlementSummary.__table__.indexes} >= {
        "ux_settlement_summary_batch"
    }
