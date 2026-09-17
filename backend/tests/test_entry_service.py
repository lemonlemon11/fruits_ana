from datetime import date, datetime
from decimal import Decimal
from io import BytesIO

import pytest
from openpyxl import load_workbook

from app.db import Base, SessionLocal, engine
from app.models import (
    EntryFieldOption,
    ImportBatch,
    SaleRecord,
    SettlementAfterSaleItem,
    SettlementFeeItem,
    SettlementSummary,
)
from app.schemas import (
    EntryAfterSaleItemCreate,
    EntryCreate,
    EntryFeeItemCreate,
    EntrySaleItemCreate,
)
from app.services.entry_export import build_entry_workbook
from app.services.entry_service import ensure_manual_entry, list_field_options, read_entry, save_entry


@pytest.fixture(autouse=True)
def clean_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


def sale_item(variety="A", head_count="4", sales_quantity=20, unit_price=2.5, **kwargs):
    values = {
        "sale_date": date(2026, 9, 13),
        "variety": variety,
        "head_count": head_count,
        "spec_kg": kwargs.get("spec_kg", "10"),
        "sales_quantity": Decimal(str(sales_quantity)),
        "unit_price": Decimal(str(unit_price)),
        "remark": kwargs.get("remark"),
    }
    return EntrySaleItemCreate(**values)


def after_item(content="售后", summary="摘要", amount=10):
    return EntryAfterSaleItemCreate(
        content=content,
        summary=summary,
        amount=Decimal(str(amount)),
    )


def fee_item(name="代卖佣金", amount=5, is_custom=False):
    return EntryFeeItemCreate(
        name=name,
        amount=Decimal(str(amount)),
        is_custom=is_custom,
    )


def entry_payload(overwrite=False, sales=None, after_sales=None, fees=None, **kwargs):
    values = {
        "merchant_no": "637",
        "order_no": "宝贝-001",
        "container_no": "C001",
        "vehicle_no": "桂A0001",
        "market": "南宁海吉星",
        "arrival_date": date(2026, 9, 10),
        "arrival_quantity": 20,
        "sales": sales if sales is not None else [sale_item()],
        "after_sales": after_sales if after_sales is not None else [],
        "fees": fees if fees is not None else [],
        "overwrite": overwrite,
    }
    values.update(kwargs)
    return EntryCreate(**values)


def test_save_and_read_entry_persists_sales_after_sales_fees_and_summary():
    db = SessionLocal()
    payload = entry_payload(
        sales=[
            sale_item("A", "4", 20, 2.5),
            sale_item("B", "6/8", 30, 3, spec_kg="9/10"),
        ],
        after_sales=[after_item("坏果", "扣款", 10), after_item("补货", "", 20)],
        fees=[
            fee_item("代卖佣金", 5),
            fee_item("运费", 10),
            fee_item("其他", 3, is_custom=True),
        ],
    )

    result = save_entry(db, payload)

    assert result.status == "created"
    assert result.merchant_no == "637"

    batch = db.query(ImportBatch).one()
    assert batch.source_type == "manual"
    assert batch.market == "南宁海吉星"
    assert batch.arrival_date == date(2026, 9, 10)
    assert batch.arrival_quantity == 20

    records = db.query(SaleRecord).order_by(SaleRecord.id).all()
    assert [record.grade.value for record in records] == ["A", "B"]
    assert [record.piece_count for record in records] == ["4", "6/8"]
    assert [record.piece_count_min for record in records] == [Decimal("4"), Decimal("6")]
    assert [record.piece_count_max for record in records] == [Decimal("4"), Decimal("8")]
    assert [record.spec_kg for record in records] == ["10", "9/10"]
    assert [record.spec_kg_max for record in records] == [Decimal("10"), Decimal("10")]
    assert [record.amount for record in records] == [Decimal("50.00"), Decimal("90.00")]

    assert db.query(SettlementAfterSaleItem).count() == 2
    assert db.query(SettlementFeeItem).count() == 3
    summary = db.query(SettlementSummary).one()
    assert summary.sales_amount == Decimal("140.00")
    assert summary.after_sale_amount == Decimal("30.00")
    assert summary.goods_amount == Decimal("110.00")
    assert summary.fee_amount == Decimal("18.00")
    assert summary.payable_amount == Decimal("92.00")

    entry = read_entry(db, "637")
    assert entry is not None
    assert entry["source_type"] == "manual"
    assert len(entry["sales"]) == 2
    assert entry["after_sales"][0]["amount"] == Decimal("10.00")
    assert entry["fees"][-1]["is_custom"] is True
    db.close()


def test_save_without_overwrite_returns_conflict_and_overwrite_replaces():
    db = SessionLocal()
    first = entry_payload()
    save_entry(db, first)

    conflict = save_entry(db, entry_payload(order_no="新单号"))
    assert conflict.status == "conflict"
    assert conflict.existing_order_no == "宝贝-001"

    replaced = save_entry(
        db,
        entry_payload(
            overwrite=True,
            order_no="新单号",
            sales=[sale_item("C", "2", 5, 10), sale_item("D", "3", 7, 8)],
        ),
    )
    assert replaced.status == "saved"
    assert db.query(ImportBatch).count() == 1
    assert db.query(SaleRecord).count() == 2
    assert db.query(SettlementSummary).one().sales_amount == Decimal("106.00")
    assert db.query(ImportBatch).one().order_no == "新单号"

    manual = ensure_manual_entry(db, "637")
    assert manual.source_type == "manual"

    with pytest.raises(ValueError):
        ensure_manual_entry(db, "missing")
    db.close()


def test_field_options_only_return_active_rows_in_order():
    db = SessionLocal()
    db.add_all([
        EntryFieldOption(field_key="market", value="市场二", sort_order=2, is_active=True),
        EntryFieldOption(field_key="market", value="市场一", sort_order=1, is_active=True),
        EntryFieldOption(field_key="market", value="停用市场", sort_order=0, is_active=False),
        EntryFieldOption(field_key="variety", value="C", sort_order=2, is_active=True),
    ])
    db.commit()

    assert [item["value"] for item in list_field_options(db, "market")] == ["市场一", "市场二"]
    assert [item["value"] for item in list_field_options(db, "variety")] == ["C"]
    db.close()


def test_export_handles_dynamic_rows_and_writes_only_values():
    db = SessionLocal()
    payload = entry_payload(
        sales=[
            sale_item("A", "4", 20, 2.5),
            sale_item("B", "6/8", 30, 3, spec_kg="9/10"),
            sale_item("C", "2", 10, 4),
        ],
        after_sales=[
            after_item("内容1", "摘要1", 1),
            after_item("内容2", "摘要2", 2),
            after_item("内容3", "摘要3", 3),
            after_item("内容4", "摘要4", 4),
            after_item("内容5", "摘要5", 5),
        ],
        fees=[
            fee_item("代卖佣金", 5),
            fee_item("运费", 10),
            fee_item("车位费", 11),
            fee_item("入场费", 12),
            fee_item("搬运费", 13),
            fee_item("打冷费", 14),
            fee_item("临时人工", 9, is_custom=True),
            fee_item("临时车费", 7, is_custom=True),
        ],
    )
    save_entry(db, payload)

    content = build_entry_workbook(db, "637")
    wb = load_workbook(BytesIO(content))
    ws = wb["结算单"]

    assert ws["C5"].value == "637"
    assert ws["C9"].value == "南宁海吉星"
    assert ws["C10"].value == datetime(2026, 9, 10)
    assert ws["C11"].value == 20

    assert ws["C17"].value == "总件数"
    # 头数合计取区间上限：4 + (6/8 → 8) + 2 = 14
    assert ws["D17"].value == 14
    assert ws["G17"].value == 60
    assert ws["I17"].value == 180

    assert ws["H25"].value == "售后合计："
    assert ws["I25"].value == 15
    assert ws["H26"].value == "货款合计："
    assert ws["I26"].value == 165

    assert ws["C37"].value == "费用合计"
    assert ws["H37"].value == 81
    assert ws["I39"].value == 84

    formula_cells = [
        cell.coordinate
        for row in ws.iter_rows()
        for cell in row
        if cell.data_type == "f"
    ]
    assert formula_cells == []
    db.close()


def test_export_inserted_rows_inherit_template_style_and_height():
    """动态新增行必须继承模板样式与行高，避免打印版式走样。"""

    db = SessionLocal()
    payload = entry_payload(
        sales=[
            sale_item("A", "4", 20, 2.5),
            sale_item("B", "6/8", 30, 3, spec_kg="9/10"),
            sale_item("C", "2", 10, 4),
            sale_item("D", "3", 15, 5),
        ],
        after_sales=[after_item(f"内容{i}", f"摘要{i}", i) for i in range(1, 7)],
        fees=[
            fee_item("代卖佣金", 5),
            fee_item("运费", 10),
            fee_item("车位费", 11),
            fee_item("入场费", 12),
            fee_item("搬运费", 13),
            fee_item("打冷费", 14),
            fee_item("临时人工", 9, is_custom=True),
        ],
    )
    save_entry(db, payload)
    ws = load_workbook(BytesIO(build_entry_workbook(db, "637")))["结算单"]

    def style_of(cell):
        return (
            cell.font.sz,
            cell.number_format,
            cell.alignment.horizontal,
            cell.border.bottom.style,
        )

    # 销售新增行（第 3、4 条）与模板数据行完全一致
    assert ws["B16"].value == datetime(2026, 9, 13)
    assert style_of(ws["B16"]) == style_of(ws["B15"])
    assert style_of(ws["I16"]) == style_of(ws["I15"])
    assert ws.row_dimensions[16].height == ws.row_dimensions[15].height

    # 售后新增行（第 5、6 条）与模板售后行一致
    assert style_of(ws["C24"]) == style_of(ws["C23"])
    assert style_of(ws["G25"]) == style_of(ws["G23"])
    assert ws.row_dimensions[25].height == ws.row_dimensions[23].height

    # 自定义费用行与首条固定费用行（模板参考行 27）一致，含金额两位小数格式
    assert style_of(ws["C37"]) == style_of(ws["C31"])
    assert style_of(ws["H37"]) == style_of(ws["H31"])
    assert ws.row_dimensions[37].height == ws.row_dimensions[31].height

    # 被顶下去的标签行仍保留模板行高：总件数 / 货款合计 / 支出费用 / 应付
    assert ws.row_dimensions[18].height == 22
    assert ws.row_dimensions[28].height == 23
    assert ws.row_dimensions[30].height == 23
    assert ws.row_dimensions[40].height == 28
    db.close()
