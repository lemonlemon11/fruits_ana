from datetime import date
from decimal import Decimal
from io import BytesIO

import openpyxl
import pytest
from fastapi.testclient import TestClient

from app.auth import require_current_user
from app.db import Base, SessionLocal, engine
from app.main import app
from app.models import (
    AdminFieldConversionRule,
    ImportBatch,
    SaleRecord,
    SettlementAfterSaleItem,
    SettlementFeeItem,
    SettlementSummary,
    SourceFile,
    StandardGrade,
)
from app.services.settlement_list_export import parse_fee_detail


@pytest.fixture(autouse=True)
def clean_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture(autouse=True)
def authenticated_business_api():
    app.dependency_overrides[require_current_user] = lambda: object()
    yield
    app.dependency_overrides.pop(require_current_user, None)


def seed_sale():
    db = SessionLocal()
    db.add(
        AdminFieldConversionRule(
            field_key="grade",
            source_value="BC",
            target_value="C",
            sort_order=0,
            is_active=True,
        )
    )
    batch = ImportBatch(
        file_name="sample.csv",
        status="success",
        merchant_no="单624",
        order_no="宝贝01",
        container_no="MWCU1823691",
    )
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
    assert "BC→C" in text and "C,2.0,16.0,8.0,1.0" in text


def test_settlement_xlsx_and_source_trace_are_available():
    seed_sale()
    client = TestClient(app)

    export = client.get("/api/exports/settlements/单624.xlsx")
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
        "/api/exports/overview.csv", params={"merchant_no": "=1+1"}
    )
    xlsx_response = client.get("/api/exports/settlements/单624.xlsx")

    assert "'=1+1" in csv_response.content.decode("utf-8-sig")
    workbook = openpyxl.load_workbook(BytesIO(xlsx_response.content), data_only=False)
    detail = workbook["销售明细"]
    spec_column = next(
        cell.column for cell in detail[1] if cell.value == "spec_raw"
    )
    assert detail.cell(2, spec_column).value.startswith("'=")


def test_settlement_list_xlsx_matches_list_columns_and_metrics():
    seed_sale()

    response = TestClient(app).get(
        "/api/exports/settlements.xlsx",
        params={"start_date": "2026-01-01", "end_date": "2026-01-31"},
    )

    assert response.status_code == 200
    assert response.content[:2] == b"PK"
    workbook = openpyxl.load_workbook(BytesIO(response.content), data_only=False)
    assert workbook.sheetnames == ["结算单列表", "销售明细", "售后明细", "支出费用明细", "说明"]
    sheet = workbook["结算单列表"]
    headers = [cell.value for cell in sheet[1]]
    assert headers == [
        "商号",
        "单号",
        "柜号",
        "到达日期起",
        "到达日期止",
        "总件数",
        "C果件数",
        "销售额",
        "平均每公斤售价",
        "售后合计",
        "费用合计",
        "应付贵方总金额(RMB)",
    ]
    # 商号 / 单号与页面一致走适配后写法（ADR-015 / ADR-016）。
    assert [sheet.cell(2, index).value for index in (1, 2, 3, 6, 7, 8, 9)] == [
        "624",
        "宝贝-001",
        "MWCU1823691",
        2,
        2,
        16,
        8,
    ]
    assert sheet["D2"].value.date() == date(2026, 1, 2)
    assert sheet["E2"].value.date() == date(2026, 1, 2)
    assert sheet["D2"].number_format == "yyyy-mm-dd"
    assert sheet["F2"].number_format == "#,##0.00"
    # 导入件没有结算摘要时，售后 / 费用合计留空而不是补 0，避免误导。
    assert [sheet.cell(2, index).value for index in (10, 11, 12)] == [None, None, None]
    sales = workbook["销售明细"]
    assert [cell.value for cell in sales[1]] == [
        "商号",
        "单号",
        "柜号",
        "销售日期",
        "品种",
        "等级原文",
        "规格原文",
        "规格（头数）",
        "规格（KG）",
        "销售数量",
        "单价",
        "金额",
        "备注",
    ]
    assert [sales.cell(2, index).value for index in (1, 2, 3, 5, 6, 7, 10, 11, 12)] == [
        "624",
        "宝贝-001",
        "MWCU1823691",
        "C",
        "BC6",
        "—",
        2,
        8,
        16,
    ]
    assert sales.cell(2, 4).value.date() == date(2026, 1, 2)
    assert sales.cell(2, 8).value in (None, "")
    assert workbook["售后明细"]["A2"].value == "当前筛选范围没有售后明细"
    assert workbook["支出费用明细"]["A2"].value == "当前筛选范围没有支出费用明细"
    notes = {row[0].value: row[1].value for row in workbook["说明"].iter_rows(min_row=1, max_col=2)}
    assert notes["导出行数"] == 1
    assert notes["筛选商号"] == "全部结算单"
    assert "BC→C" in notes["等级映射"]
    assert notes["销售明细行数"] == 1
    assert notes["售后明细行数"] == 0
    assert notes["支出费用行数"] == 0


def seed_manual_settlement():
    """手工录单口径：销售明细 + 售后行 + 固定/自定义费用行 + 结算摘要。"""

    db = SessionLocal()
    batch = ImportBatch(
        file_name="manual-entry",
        status="success",
        source_type="manual",
        merchant_no="637",
        order_no="宝贝-001",
        container_no="C001",
    )
    db.add(batch)
    db.flush()
    db.add_all(
        [
            SaleRecord(
                import_batch_id=batch.id,
                sale_date=date(2026, 9, 13),
                grade=StandardGrade.A,
                grade_raw="A",
                spec_raw="A4（10KG）",
                piece_count="4",
                spec_kg="10",
                quantity=Decimal("20.00"),
                unit_price=Decimal("2.50"),
                amount=Decimal("50.00"),
                remark="早市",
            ),
            SaleRecord(
                import_batch_id=batch.id,
                sale_date=date(2026, 9, 14),
                grade=StandardGrade.B,
                grade_raw="B",
                spec_raw="B3/4（9KG）",
                piece_count="3/4",
                spec_kg="9",
                quantity=Decimal("30.00"),
                unit_price=Decimal("3.00"),
                amount=Decimal("90.00"),
            ),
            SettlementAfterSaleItem(
                import_batch_id=batch.id,
                content="坏果",
                summary="扣款",
                amount=Decimal("10.00"),
                sort_order=0,
            ),
            SettlementFeeItem(
                import_batch_id=batch.id,
                name="代卖佣金",
                amount=Decimal("5.00"),
                is_custom=False,
                sort_order=0,
            ),
            SettlementFeeItem(
                import_batch_id=batch.id,
                name="其他",
                amount=Decimal("3.00"),
                is_custom=True,
                sort_order=6,
            ),
            SettlementSummary(
                import_batch_id=batch.id,
                sales_amount=Decimal("140.00"),
                after_sale_amount=Decimal("10.00"),
                goods_amount=Decimal("130.00"),
                fee_amount=Decimal("8.00"),
                payable_amount=Decimal("122.00"),
            ),
        ]
    )
    db.commit()
    db.close()


def seed_imported_settlement_summary():
    """导入口径：只有结算摘要，费用明细是『费用名 原值: 金额』文本。"""

    db = SessionLocal()
    batch = ImportBatch(
        file_name="sample.csv",
        status="success",
        merchant_no="624",
        order_no="宝贝01",
        container_no="MWCU1823691",
    )
    db.add(batch)
    db.flush()
    db.add(
        SaleRecord(
            import_batch_id=batch.id,
            sale_date=date(2026, 9, 6),
            grade=StandardGrade.A,
            grade_raw="A6（19.5KG）",
            spec_raw="A6（19.5KG）",
            quantity=Decimal("129.00"),
            unit_price=Decimal("550.00"),
            amount=Decimal("70950.00"),
        )
    )
    db.add(
        SettlementSummary(
            import_batch_id=batch.id,
            sales_amount=Decimal("70950.00"),
            after_sale_amount=Decimal("-2420.00"),
            goods_amount=Decimal("68530.00"),
            fee_amount=Decimal("10300.00"),
            fee_detail="代卖佣金 10000: 10000；压车费 300: 300",
            payable_amount=Decimal("65848.00"),
        )
    )
    db.commit()
    db.close()


def test_settlement_list_xlsx_exports_sales_after_sale_and_fee_details():
    seed_manual_settlement()
    seed_imported_settlement_summary()

    response = TestClient(app).get(
        "/api/exports/settlements.xlsx",
        params={"start_date": "2026-09-01", "end_date": "2026-09-30"},
    )

    assert response.status_code == 200
    workbook = openpyxl.load_workbook(BytesIO(response.content), data_only=False)

    summary = workbook["结算单列表"]
    manual_row = next(
        row for row in summary.iter_rows(min_row=2, values_only=True) if row[0] == "637"
    )
    imported_row = next(
        row for row in summary.iter_rows(min_row=2, values_only=True) if row[0] == "624"
    )
    assert [float(value) for value in manual_row[10:13]] == [10.0, 8.0, 122.0]
    assert [float(value) for value in imported_row[10:13]] == [-2420.0, 10300.0, 65848.0]

    sales = workbook["销售明细"]
    assert sales.max_row == 4
    manual_sales = [row for row in sales.iter_rows(min_row=2, values_only=True) if row[0] == "637"]
    assert [row[3].date() for row in manual_sales] == [date(2026, 9, 13), date(2026, 9, 14)]
    assert [row[4] for row in manual_sales] == ["A", "B"]
    assert [row[7] for row in manual_sales] == ["4", "3/4"]
    assert [row[8] for row in manual_sales] == ["10", "9"]
    assert [float(row[11]) for row in manual_sales] == [50.0, 90.0]
    assert manual_sales[0][12] == "早市"

    after_sale = workbook["售后明细"]
    manual_after = [row for row in after_sale.iter_rows(min_row=2, values_only=True) if row[0] == "637"]
    imported_after = [row for row in after_sale.iter_rows(min_row=2, values_only=True) if row[0] == "624"]
    assert manual_after == [("637", "宝贝-001", "C001", "坏果", "扣款", Decimal("10.00"), "录单录入")]
    assert imported_after == [
        ("624", "宝贝-001", "MWCU1823691", "结算摘要售后合计", "导入结算摘要原值", Decimal("-2420.00"), "结算摘要")
    ]

    fees = workbook["支出费用明细"]
    manual_fees = [row for row in fees.iter_rows(min_row=2, values_only=True) if row[0] == "637"]
    imported_fees = [row for row in fees.iter_rows(min_row=2, values_only=True) if row[0] == "624"]
    assert [(row[3], float(row[4]), row[5]) for row in manual_fees] == [
        ("代卖佣金", 5.0, "录单录入"),
        ("其他", 3.0, "录单自定义"),
    ]
    assert [(row[3], float(row[4]), row[5]) for row in imported_fees] == [
        ("代卖佣金", 10000.0, "结算摘要"),
        ("压车费", 300.0, "结算摘要"),
    ]
    notes = {row[0].value: row[1].value for row in workbook["说明"].iter_rows(min_row=1, max_col=2)}
    assert notes["销售明细行数"] == 3
    assert notes["售后明细行数"] == 2
    assert notes["支出费用行数"] == 4


def test_parse_fee_detail_reads_names_and_amounts():
    assert parse_fee_detail("代卖佣金 10000: 10000；车位费 600: 600") == [
        ("代卖佣金", Decimal("10000")),
        ("车位费", Decimal("600")),
    ]
    assert parse_fee_detail("") == []
    assert parse_fee_detail(None) == []
    assert parse_fee_detail("没有金额的费用项") == []


def test_settlement_list_xlsx_respects_filters_and_rejects_bad_range():
    seed_sale()
    client = TestClient(app)

    empty = client.get(
        "/api/exports/settlements.xlsx",
        params={"merchant_no": "不存在的商号"},
    )
    bad_range = client.get(
        "/api/exports/settlements.xlsx",
        params={"start_date": "2026-02-01", "end_date": "2026-01-01"},
    )

    assert empty.status_code == 200
    empty_sheet = openpyxl.load_workbook(BytesIO(empty.content), data_only=False)["结算单列表"]
    assert empty_sheet["A2"].value == "当前筛选范围没有结算单"
    assert empty_sheet.max_row == 2
    assert bad_range.status_code == 422


def test_settlement_template_xlsx_exports_manual_and_imported_rows():
    seed_manual_settlement()
    seed_imported_settlement_summary()
    client = TestClient(app)

    manual = client.get("/api/exports/settlements/637/template.xlsx")
    imported = client.get("/api/exports/settlements/624/template.xlsx")

    assert manual.status_code == 200
    assert imported.status_code == 200

    manual_sheet = openpyxl.load_workbook(BytesIO(manual.content), data_only=False)["结算单"]
    assert manual_sheet["B2"].value == "结 算 单"
    assert manual_sheet["C5"].value == "637"
    assert manual_sheet["B14"].value.date() == date(2026, 9, 13)
    assert [manual_sheet.cell(14, column).value for column in (3, 4, 5, 6)] == ["A", "4", "10", "早市"]
    # 头数合计取区间上限：4 + (3/4 → 4) = 8
    assert manual_sheet["D16"].value == 8
    assert manual_sheet["G16"].value == 50.0
    assert manual_sheet["I16"].value == 140.0

    imported_sheet = openpyxl.load_workbook(BytesIO(imported.content), data_only=False)["结算单"]
    assert imported_sheet["C5"].value == "624"
    assert imported_sheet["C7"].value == "宝贝-001"
    assert imported_sheet["B14"].value.date() == date(2026, 9, 6)
    # 导入件没有件数与规格，模板示例值必须被清空而不是残留。
    assert imported_sheet.cell(14, 4).value is None
    assert imported_sheet.cell(14, 5).value is None
    assert imported_sheet.cell(14, 6).value == "A6（19.5KG）"
    assert imported_sheet.cell(14, 7).value == 129.0
    assert imported_sheet["D16"].value is None
    assert imported_sheet["G16"].value == 129.0
    assert imported_sheet["I16"].value == 70950.0


def test_settlement_template_xlsx_missing_merchant_returns_404():
    response = TestClient(app).get("/api/exports/settlements/不存在/template.xlsx")

    assert response.status_code == 404
