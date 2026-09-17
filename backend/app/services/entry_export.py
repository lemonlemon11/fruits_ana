"""按结算单模板导出结算单；只写计算值，不保留公式。

手工录单直接读录单数据，导入件把结算摘要与销售明细映射到同一份模板，
保证列表里任意一行都能导出统一版式的文件。
"""

from __future__ import annotations

from copy import copy
from datetime import datetime
from decimal import Decimal
from io import BytesIO
from pathlib import Path

from openpyxl import load_workbook
from sqlalchemy.orm import Session

from ..models import ImportBatch, SaleRecord, SettlementSummary
from ..parser.spec_range import parse_spec_range
from .entry_service import FIXED_FEES, read_entry
from .merchant_no_naming import merchant_no_display
from .order_no_naming import order_no_display
from .settlement_list_export import parse_fee_detail


TEMPLATE_PATH = (
    Path(__file__).resolve().parents[3] / "attachments" / "结算单模板样式.xlsx"
)
STYLE_COLUMNS = range(2, 10)
SALES_STYLE_ROW = 15
AFTER_STYLE_ROW = 18
FEE_STYLE_ROW = 27


def _write(ws, row: int, column: int, value) -> None:
    """显式写入（含 None）：openpyxl 的 `cell(r, c, None)` 不会清空模板示例值。"""

    ws.cell(row, column).value = _cell(value)


def _cell(value):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, datetime):
        return value.date()
    return value


def _pieces_total(sales: list[dict]) -> Decimal | None:
    """头数合计：区间取上限（客户口径），一行都解析不出来时整列留空。"""

    total = Decimal("0")
    found = False
    for item in sales:
        parsed = parse_spec_range(item.get("head_count"))
        if parsed is None:
            continue
        total += parsed.representative
        found = True
    return total if found else None


def _insert_rows(ws, start_row: int, count: int) -> None:
    if count > 0:
        ws.insert_rows(start_row, count)


def _snapshot_row(ws, row: int) -> dict:
    """记录模板行的单元格样式与行高，供动态新增行复用。"""

    return {
        "style": {col: copy(ws.cell(row, col)._style) for col in STYLE_COLUMNS},
        "height": ws.row_dimensions[row].height,
    }


def _apply_row(ws, row: int, snapshot: dict) -> None:
    for col, style in snapshot["style"].items():
        ws.cell(row, col)._style = copy(style)
    if snapshot["height"] is not None:
        ws.row_dimensions[row].height = snapshot["height"]


def _restore_row_heights(
    ws,
    base_heights: dict,
    inserts: list[tuple[int, int, float | None]],
) -> None:
    """openpyxl 的 insert_rows 不会平移行高，这里按模板坐标重建行高表。"""

    heights = dict(base_heights)
    for start_row, count, fill in sorted(inserts, key=lambda item: item[0], reverse=True):
        if count <= 0:
            continue
        heights = {
            (row + count if row >= start_row else row): height
            for row, height in heights.items()
        }
        if fill is not None:
            heights.update({start_row + offset: fill for offset in range(count)})
    for row, height in heights.items():
        ws.row_dimensions[row].height = height


def _unmerge_all(ws) -> None:
    for merged_range in list(ws.merged_cells.ranges):
        ws.unmerge_cells(str(merged_range))


def _merge_entry_ranges(
    ws,
    after_header: int,
    after_total_row: int,
    fee_header: int,
    fixed_start: int,
    fee_total_row: int,
    payable_row: int,
) -> None:
    ws.merge_cells("B2:I4")
    ws.merge_cells(f"B{after_header}:B{after_total_row}")
    for row in range(after_header, after_total_row):
        ws.merge_cells(f"C{row}:D{row}")
        ws.merge_cells(f"E{row}:F{row}")
        ws.merge_cells(f"G{row}:I{row}")
    ws.merge_cells(f"C{fee_header}:G{fee_header}")
    for row in range(fixed_start, fee_total_row + 1):
        ws.merge_cells(f"C{row}:G{row}")
    ws.merge_cells(f"B{payable_row}:G{payable_row}")


def build_entry_workbook(db: Session, merchant_no: str) -> bytes:
    """导出手工录单；非手工单抛 ValueError（保持既有契约）。"""

    entry = read_entry(db, merchant_no)
    if entry is None:
        raise ValueError("该结算单不是手工录单，不能导出")
    return render_entry_workbook(entry)


def build_settlement_template_workbook(db: Session, merchant_no: str) -> bytes:
    """导出任意结算单（手工单或导入件），版式与模板一致。"""

    entry = read_entry(db, merchant_no) or read_imported_entry(db, merchant_no)
    if entry is None:
        raise ValueError("没有找到该商号的结算单")
    return render_entry_workbook(entry)


def read_imported_entry(db: Session, merchant_no: str) -> dict | None:
    """把导入件映射成渲染所需的录单结构，供列表逐行导出使用。"""

    batch = (
        db.query(ImportBatch)
        .filter(ImportBatch.merchant_no == merchant_no)
        .order_by(ImportBatch.imported_at.desc(), ImportBatch.id.desc())
        .first()
    )
    if batch is None:
        return None
    summary = (
        db.query(SettlementSummary)
        .filter(SettlementSummary.import_batch_id == batch.id)
        .first()
    )
    records = (
        db.query(SaleRecord)
        .filter(SaleRecord.import_batch_id == batch.id)
        .order_by(SaleRecord.sale_date, SaleRecord.id)
        .all()
    )
    after_amount = getattr(summary, "after_sale_amount", None)
    after_sales = []
    if after_amount:
        after_sales.append(
            {
                "content": "结算摘要售后合计",
                "summary": "导入结算摘要原值",
                "amount": abs(after_amount),
            }
        )
    fees = [
        {"name": name, "amount": amount, "is_custom": name not in FIXED_FEES}
        for name, amount in parse_fee_detail(getattr(summary, "fee_detail", None))
    ]
    customs_tax = getattr(summary, "customs_tax", None)
    if customs_tax:
        fees.append({"name": "清关税费", "amount": customs_tax, "is_custom": True})
    return {
        "merchant_no": merchant_no_display(batch.merchant_no, batch.merchant_no_normalized),
        "order_no": order_no_display(batch.order_no, batch.order_no_normalized),
        "container_no": batch.container_no,
        "vehicle_no": batch.vehicle_no,
        "market": batch.market,
        "arrival_date": batch.arrival_date,
        "arrival_quantity": batch.arrival_quantity,
        "source_type": batch.source_type,
        "sales": [
            {
                "sale_date": record.sale_date,
                "variety": record.grade.value,
                "head_count": record.piece_count,
                "spec_kg": record.spec_kg,
                "sales_quantity": record.quantity,
                "unit_price": record.unit_price,
                "remark": record.remark or record.spec_raw,
            }
            for record in records
        ],
        "after_sales": after_sales,
        "fees": fees,
    }


def render_entry_workbook(entry: dict) -> bytes:
    """按模板版式把结算单数据渲染成 xlsx 字节流。"""

    wb = load_workbook(TEMPLATE_PATH)
    ws = wb["结算单"]
    base_heights = {
        row: dim.height
        for row, dim in ws.row_dimensions.items()
        if dim.height is not None
    }
    sales_row_style = _snapshot_row(ws, SALES_STYLE_ROW)
    after_row_style = _snapshot_row(ws, AFTER_STYLE_ROW)
    fee_row_style = _snapshot_row(ws, FEE_STYLE_ROW)
    _unmerge_all(ws)

    ws["C5"] = entry["merchant_no"]
    ws["C6"] = entry["container_no"] or ""
    ws["C7"] = entry["order_no"] or ""
    ws["C8"] = entry["vehicle_no"] or ""
    ws["C9"] = entry["market"] or ""
    ws["C10"] = _cell(entry["arrival_date"]) if entry["arrival_date"] else ""
    ws["C11"] = entry["arrival_quantity"] if entry["arrival_quantity"] is not None else ""

    sales = entry["sales"]
    after_sales = entry["after_sales"]
    fees = entry["fees"]
    fixed_fee_rows = [item for item in fees if not item["is_custom"]]
    custom_fee_rows = [item for item in fees if item["is_custom"]]
    fixed_by_name = {item["name"]: item for item in fixed_fee_rows}
    fixed_rows = [
        fixed_by_name.get(name, {"name": name, "amount": Decimal("0")})
        for name in FIXED_FEES
    ]

    sales_start = 14
    sales_total_base = 16
    after_header_base = 17
    fee_header_base = 26
    fee_total_base = 33
    payable_base = 35

    sales_delta = max(0, len(sales) - 2)
    _insert_rows(ws, sales_total_base, sales_delta)
    sales_total_row = sales_total_base + sales_delta
    total_quantity = Decimal("0")
    sales_amount = Decimal("0")
    for offset, item in enumerate(sales):
        row = sales_start + offset
        amount = _cell(item["sales_quantity"] * item["unit_price"])
        _write(ws, row, 2, item["sale_date"])
        _write(ws, row, 3, item["variety"])
        _write(ws, row, 4, item["head_count"])
        _write(ws, row, 5, item["spec_kg"])
        _write(ws, row, 6, item["remark"] or "")
        _write(ws, row, 7, item["sales_quantity"])
        _write(ws, row, 8, item["unit_price"])
        _write(ws, row, 9, amount)
        if offset >= 2:
            _apply_row(ws, row, sales_row_style)
        total_quantity += item["sales_quantity"]
        sales_amount += item["sales_quantity"] * item["unit_price"]
    # 没有件数/规格的行留空而不是写 0，避免看起来像真的进了 0 件。
    _write(ws, sales_total_row, 4, _pieces_total(sales))
    _write(ws, sales_total_row, 7, total_quantity)
    _write(ws, sales_total_row, 9, sales_amount)

    after_header = after_header_base + sales_delta
    after_start = after_header + 1
    after_delta = max(0, len(after_sales) - 4)
    _insert_rows(ws, after_start + 4, after_delta)
    after_amount = Decimal("0")
    for offset, item in enumerate(after_sales):
        row = after_start + offset
        _write(ws, row, 3, item["content"])
        _write(ws, row, 5, item["summary"])
        _write(ws, row, 7, item["amount"])
        if offset >= 4:
            _apply_row(ws, row, after_row_style)
        after_amount += item["amount"]
    after_total_row = after_start + max(len(after_sales), 4) + 1
    _write(ws, after_total_row, 8, "售后合计：")
    _write(ws, after_total_row, 9, after_amount)
    goods_amount = sales_amount - after_amount
    goods_row = after_total_row + 1
    _write(ws, goods_row, 8, "货款合计：")
    _write(ws, goods_row, 9, goods_amount)

    fee_shift = sales_delta + after_delta
    fixed_start = fee_header_base + fee_shift + 1
    for offset, item in enumerate(fixed_rows):
        row = fixed_start + offset
        _write(ws, row, 3, item["name"])
        _write(ws, row, 8, item["amount"])
    fee_amount = Decimal("0")
    for item in fixed_rows + custom_fee_rows:
        fee_amount += item["amount"]
    custom_fee_start = fixed_start + len(FIXED_FEES)
    _insert_rows(ws, custom_fee_start, len(custom_fee_rows))
    for offset, item in enumerate(custom_fee_rows):
        row = custom_fee_start + offset
        _write(ws, row, 3, item["name"])
        _write(ws, row, 8, item["amount"])
        _apply_row(ws, row, fee_row_style)
    fee_total_row = custom_fee_start + len(custom_fee_rows)
    _write(ws, fee_total_row, 3, "费用合计")
    _write(ws, fee_total_row, 8, fee_amount)
    payable_amount = goods_amount - fee_amount
    payable_row = payable_base + fee_shift + len(custom_fee_rows)
    _write(ws, payable_row, 9, payable_amount)
    _restore_row_heights(
        ws,
        base_heights,
        [
            (sales_total_base, sales_delta, sales_row_style["height"]),
            (after_header_base + 1 + 4, after_delta, after_row_style["height"]),
            (fee_total_base, len(custom_fee_rows), fee_row_style["height"]),
        ],
    )
    _merge_entry_ranges(
        ws,
        after_header=after_header,
        after_total_row=after_total_row,
        fee_header=fee_header_base + fee_shift,
        fixed_start=fixed_start,
        fee_total_row=fee_total_row,
        payable_row=payable_row,
    )

    output = BytesIO()
    wb.save(output)
    return output.getvalue()


__all__ = [
    "build_entry_workbook",
    "build_settlement_template_workbook",
    "read_imported_entry",
    "render_entry_workbook",
]
