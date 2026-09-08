import pytest
from sqlalchemy.exc import IntegrityError

from app.db import Base, SessionLocal, engine
from app.models import ImportBatch, SaleRecord, SourceFile


@pytest.fixture(autouse=True)
def clean_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


def test_source_file_hash_is_unique():
    db = SessionLocal()
    batch = ImportBatch(file_name="one.xlsx")
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
