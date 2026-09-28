"""结算单 xlsx / pdf 导出；xlsx 为财务表格样式，PDF 由 xlsx 经 LibreOffice 另存。"""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from datetime import datetime, date
from decimal import Decimal
from io import BytesIO
from pathlib import Path
from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.page import PageMargins
from sqlalchemy.orm import Session

from ..models import (
    ImportBatch,
    SaleRecord,
    SettlementAfterSaleItem,
    SettlementFeeItem,
    SettlementSummary,
)
from .entry_service import FIXED_FEES, read_entry
from .merchant_no_naming import merchant_no_display
from .order_no_naming import order_no_display
from .settlement_list_export import parse_fee_detail

# ──────────────────────────────────────────────
# 公共读取
# ──────────────────────────────────────────────

def read_imported_entry(db: Session, merchant_no: str) -> dict | None:
    batch = (db.query(ImportBatch)
             .filter(ImportBatch.merchant_no == merchant_no)
             .order_by(ImportBatch.imported_at.desc(), ImportBatch.id.desc())
             .first())
    if batch is None:
        return None
    summary = (db.query(SettlementSummary)
               .filter(SettlementSummary.import_batch_id == batch.id).first())
    records = (db.query(SaleRecord)
               .filter(SaleRecord.import_batch_id == batch.id)
               .order_by(SaleRecord.sale_date, SaleRecord.id).all())

    after_items = (db.query(SettlementAfterSaleItem)
                   .filter(SettlementAfterSaleItem.import_batch_id == batch.id)
                   .order_by(SettlementAfterSaleItem.id).all())
    if after_items:
        after_sales = [
            {"content": item.content, "summary": item.summary or "",
             "amount": abs(item.amount) if item.amount is not None else Decimal("0")}
            for item in after_items
        ]
    else:
        after_amount = getattr(summary, "after_sale_amount", None)
        after_sales = []
        if after_amount:
            after_sales.append({"content": "结算摘要售后合计",
                                "summary": "导入结算摘要原值",
                                "amount": abs(after_amount)})

    fee_items = (db.query(SettlementFeeItem)
                 .filter(SettlementFeeItem.import_batch_id == batch.id)
                 .order_by(SettlementFeeItem.id).all())
    if fee_items:
        fees = [{"name": item.name, "amount": item.amount, "is_custom": item.is_custom}
                for item in fee_items]
    else:
        fees = [{"name": n, "amount": a, "is_custom": n not in FIXED_FEES}
                for n, a in parse_fee_detail(getattr(summary, "fee_detail", None))]
        ct = getattr(summary, "customs_tax", None)
        if ct:
            fees.append({"name": "清关税费", "amount": ct, "is_custom": True})

    return {
        "merchant_no": merchant_no_display(batch.merchant_no, batch.merchant_no_normalized),
        "order_no": order_no_display(batch.order_no, batch.order_no_normalized),
        "container_no": batch.container_no, "vehicle_no": batch.vehicle_no,
        "country": batch.country,
        "market": batch.market, "arrival_date": batch.arrival_date,
        "arrival_quantity": batch.arrival_quantity,
        "source_type": batch.source_type,
        "sales": [{
            "sale_date": r.sale_date,
            "variety": r.variety or "",
            "grade": r.grade_raw if r.grade_raw is not None else r.grade.value,
            "head_count": r.piece_count, "spec_kg": r.spec_kg,
            "sales_quantity": r.quantity, "unit_price": r.unit_price,
            "remark": r.remark or "",
        } for r in records],
        "after_sales": after_sales, "fees": fees,
    }


def load_entry(db: Session, merchant_no: str) -> dict:
    """返回录单 dict，不区分手工/导入。"""
    entry = read_entry(db, merchant_no) or read_imported_entry(db, merchant_no)
    if entry is None:
        raise ValueError("没有找到该商号的结算单")
    return entry


# ──────────────────────────────────────────────
# 帮助函数
# ──────────────────────────────────────────────

def _fmt(v: Any) -> str:
    """数字格式化为千分位字符串。"""
    if v is None:
        return ""
    if isinstance(v, float | Decimal | int):
        return f"{float(v):,.2f}"
    if isinstance(v, date):
        return v.isoformat()
    return str(v)


def _fmt_int(v: Any) -> str:
    if v is None:
        return ""
    return f"{float(v):,.0f}"


# ──────────────────────────────────────────────
# XLSX 导出（专业财务报表样式）
# ──────────────────────────────────────────────

# 颜色
HEADER_FILL = PatternFill("solid", fgColor="2B5E4A")
SECTION_FILL = PatternFill("solid", fgColor="EEF4F1")
TOTAL_FILL = PatternFill("solid", fgColor="F0F5F3")
GRAND_FILL = PatternFill("solid", fgColor="E1EDE7")
EVEN_FILL = PatternFill("solid", fgColor="F8FAF9")
WHITE = "FFFFFF"
INK = "1A3C34"

THIN_SIDE = Side(style="thin", color="DDE5E1")
THICK_TOP = Side(style="medium", color="2B5E4A")
THIN = Border(left=THIN_SIDE, right=THIN_SIDE, top=Side(style="thin", color="DDE5E1"), bottom=THIN_SIDE)
TOTAL_BORDER = Border(left=THIN_SIDE, right=THIN_SIDE, top=THICK_TOP, bottom=THIN_SIDE)
SUBTLE_BORDER = Border(left=THIN_SIDE, right=THIN_SIDE, bottom=THIN_SIDE)
GRAND_BORDER = Border(left=THIN_SIDE, right=THIN_SIDE, top=Side(style="double", color="2B5E4A"), bottom=THIN_SIDE)
NO_BORDER = Border()


def _hdr_font(bold=True, sz=11):
    return Font(name="微软雅黑", bold=bold, size=sz, color=WHITE)

def _body_font(bold=False, sz=10, color=INK):
    return Font(name="微软雅黑", bold=bold, size=sz, color=color)


def _cell(ws, r, c, val, font=None, align=None, fill=None, border=None, nf=None):
    cell = ws.cell(r, c, val)
    if font: cell.font = font
    if align: cell.alignment = align
    if fill: cell.fill = fill
    if border: cell.border = border
    if nf: cell.number_format = nf


def _text_units(value: Any) -> int:
    """列宽估算：CJK / 全角字符按 2 个单位，其余按 1。"""
    text = "" if value is None else str(value)
    return sum(2 if ord(ch) > 0x2E80 else 1 for ch in text)


def _merge(ws, r1, c1, r2, c2, val=None, font=None, align=None, fill=None, border=None):
    """合并并给范围内每个格子补样式：openpyxl 的样式只落在锚点，合并格边框会缺。"""
    if (r1, c1) != (r2, c2):
        ws.merge_cells(start_row=r1, start_column=c1, end_row=r2, end_column=c2)
    for row in range(r1, r2 + 1):
        for col in range(c1, c2 + 1):
            cell = ws.cell(row, col)
            if font: cell.font = font
            if align: cell.alignment = align
            if fill: cell.fill = fill
            if border: cell.border = border
    if val is not None:
        ws.cell(r1, c1).value = val
    return ws.cell(r1, c1)


def _auto_fit_columns(ws, min_w=6.5, max_w=30.0, pad=3.0, skip_rows=frozenset(), caps=None, wrap_rows=frozenset()):
    """按内容自适应列宽：合并区域把需求平摊到跨度各列，避免大片空白。

    ``skip_rows`` 指定的行（如基本信息行）不参与计算，防止其长文本把表格列撑宽；
    ``caps`` 对指定列封顶宽度（如备注列按 4 个汉字宽度）；``wrap_rows`` 指定的行
    （如表头行）按「可换行到两行」折半估算需求，让长表头不再撑宽列。
    """
    caps = caps or {}
    merged: dict[tuple[int, int], Any] = {}
    for rng in ws.merged_cells.ranges:
        for row in range(rng.min_row, rng.max_row + 1):
            for col in range(rng.min_col, rng.max_col + 1):
                merged[(row, col)] = rng
    need: dict[int, float] = {}
    for row in ws.iter_rows():
        if row and row[0].row in skip_rows:
            continue
        for cell in row:
            if cell.value is None or cell.value == "":
                continue
            rng = merged.get((cell.row, cell.column))
            if rng is not None and (cell.row, cell.column) != (rng.min_row, rng.min_col):
                continue
            units = _text_units(cell.value)
            # 只有含中文的文本标签按可换行折半；数字与日期换行无意义，按原宽计算。
            if cell.row in wrap_rows and any(ord(ch) > 0x2E80 for ch in str(cell.value)):
                units = (units + 1) // 2
            width = units + pad
            col = cell.column
            if rng is not None:
                width = width / (rng.max_col - rng.min_col + 1)
                col = rng.min_col
            need[col] = max(need.get(col, 0.0), width)
    for col, width in need.items():
        width = min(width, caps.get(col, width))
        ws.column_dimensions[get_column_letter(col)].width = round(min(max(width, min_w), max_w), 1)


def _info_spans(widths: list[float], needs: list[float]) -> list[tuple[int, int]]:
    """为同一行的若干字段分配连续跨列：枚举列分界点取「换行缺口最小」的组合。

    保证每个字段至少 1 列且绝不超出表格列范围；宽度不足的字段靠 wrap 兜底。
    """
    from itertools import combinations

    total = len(widths)
    count = len(needs)
    prefix = [0.0]
    for width in widths:
        prefix.append(prefix[-1] + width)

    best_bounds: tuple[int, ...] | None = None
    best_key: tuple[float, float, float] | None = None
    for cuts in combinations(range(1, total), count - 1):
        bounds = (0, *cuts, total)
        span_widths = [prefix[bounds[i + 1]] - prefix[bounds[i]] for i in range(count)]
        gaps = [max(0.0, needs[i] - span_widths[i]) for i in range(count)]
        # 优先总缺口最小，其次最大缺口最小，再次避免把某字段压得过窄。
        key = (sum(gaps), max(gaps), -min(span_widths))
        if best_key is None or key < best_key:
            best_key = key
            best_bounds = bounds
    return [(best_bounds[i] + 1, best_bounds[i + 1]) for i in range(count)]


def _center():
    return Alignment(horizontal="center", vertical="center")

def _center_wrap():
    return Alignment(horizontal="center", vertical="center", wrap_text=True)

def _left():
    return Alignment(horizontal="left", vertical="center")

def _right():
    return Alignment(horizontal="right", vertical="center")


def render_entry_workbook(entry: dict) -> bytes:
    """按财务报表样式渲染 xlsx。"""
    wb = Workbook()
    ws = wb.active
    ws.title = "结算单"
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    # 页面设置：横向 A4、宽度适页（高度自然分页），供打印与另存 PDF 使用。
    ws.page_setup.orientation = "landscape"
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.page_margins = PageMargins(left=0.35, right=0.35, top=0.5, bottom=0.5)

    sales = entry["sales"]
    after_sales = entry["after_sales"]
    fees = entry["fees"]
    fixed_rows = _fixed_fee_rows(fees)

    # 计算
    total_qty = sum(s["sales_quantity"] for s in sales)  # Decimal
    sales_amt = sum(s["sales_quantity"] * s["unit_price"] for s in sales)
    after_amt = sum(a["amount"] for a in after_sales)
    goods_amt = sales_amt - after_amt
    fee_amt = sum(f["amount"] for f in fees)
    payable = goods_amt - fee_amt

    # ── 标题 ──
    _merge(ws, 1, 1, 2, 9, "结 算 单", font=Font(name="微软雅黑", bold=True, size=20, color=INK),
           align=Alignment(horizontal="center", vertical="center"))
    ws.row_dimensions[1].height = 36
    ws.row_dimensions[2].height = 8

    # 基本信息（第 3-4 行，两行 × 每行 4 个字段）在列宽确定后写入：
    # 列宽只由下方表格内容决定，信息字段按内容跨列合并，互不挤占、不换行。

    # ── 分隔 ──
    _apply_gradient_line(ws, 5)

    # ════════════════ 销售明细 ════════════════
    r = 6
    _merge(ws, r, 1, r, 9, "▼ 销售明细", font=Font(name="微软雅黑", bold=True, size=11, color=INK),
           fill=SECTION_FILL, align=_left(), border=THIN)
    ws.row_dimensions[r].height = 22

    r = 7
    headers = ["销售日期", "品种", "等级", "规格(头数)", "规格(KG)", "备注", "数量(件)", "单价(元)", "金额(元)"]
    for ci, h in enumerate(headers, 1):
        # 表头允许两行换行，长表头（规格(头数)等）不再把列撑宽。
        _cell(ws, r, ci, h, font=_hdr_font(), fill=HEADER_FILL, align=_center_wrap(), border=THIN)
    ws.row_dimensions[r].height = 30

    sr = 8
    for i, s in enumerate(sales):
        row = sr + i
        fill = EVEN_FILL if i % 2 else None
        _cell(ws, row, 1, _fmt(s["sale_date"]), font=_body_font(), align=_center(), fill=fill, border=THIN)
        _cell(ws, row, 2, s["variety"] or "", font=_body_font(), align=_center(), fill=fill, border=THIN)
        _cell(ws, row, 3, s.get("grade") or "", font=_body_font(), align=_center(), fill=fill, border=THIN)
        _cell(ws, row, 4, s["head_count"] or "", font=_body_font(), align=_center(), fill=fill, border=THIN)
        _cell(ws, row, 5, s["spec_kg"] or "", font=_body_font(), align=_center(), fill=fill, border=THIN)
        # 备注列宽度按 4 个汉字封顶，长备注换行，行高交给 Excel 自适应。
        _cell(ws, row, 6, s["remark"] or "", font=_body_font(), align=_center_wrap(), fill=fill, border=THIN)
        _cell(ws, row, 7, _fmt_int(s["sales_quantity"]), font=_body_font(), align=_center(), fill=fill, border=THIN)
        _cell(ws, row, 8, _fmt(s["unit_price"]), font=_body_font(), align=_center(), fill=fill, border=THIN)
        amt = s["sales_quantity"] * s["unit_price"]
        _cell(ws, row, 9, _fmt(amt), font=_body_font(bold=True), align=_center(), fill=fill, border=THIN)

    # 合计行：数值由数量/金额列统计，标签只写文字并靠右，紧邻数值。
    total_row = sr + len(sales)
    _merge(ws, total_row, 1, total_row, 6, "总件数",
           font=_body_font(bold=True, sz=10), fill=TOTAL_FILL, align=_right(), border=TOTAL_BORDER)
    _cell(ws, total_row, 7, _fmt_int(total_qty), font=_body_font(bold=True, sz=10, color=INK),
          fill=TOTAL_FILL, align=_right(), border=TOTAL_BORDER)
    _cell(ws, total_row, 8, "销售金额", font=_body_font(bold=True, sz=10),
          fill=TOTAL_FILL, align=_center_wrap(), border=TOTAL_BORDER)
    _cell(ws, total_row, 9, _fmt(sales_amt), font=_body_font(bold=True, sz=10, color=INK),
          fill=TOTAL_FILL, align=_right(), border=TOTAL_BORDER)
    ws.row_dimensions[total_row].height = 26

    # ════════════════ 售后（与销售明细同宽，对齐到 I 列） ════════════════
    r = total_row + 2
    _apply_gradient_line(ws, r)
    r += 1

    _merge(ws, r, 1, r, 9, "▼ 售  后", font=Font(name="微软雅黑", bold=True, size=11, color=INK),
           fill=SECTION_FILL, align=_left(), border=THIN)
    ws.row_dimensions[r].height = 22

    r += 1
    after_headers = [("序号", 1, 1), ("内容", 2, 3), ("摘要", 4, 6), ("金额(元)", 7, 9)]
    for h, c1, c2 in after_headers:
        _merge(ws, r, c1, r, c2, h,
               font=_hdr_font(sz=10), fill=HEADER_FILL, align=_center(), border=THIN)
    ws.row_dimensions[r].height = 20

    ar = r + 1
    for i, a in enumerate(after_sales):
        row = ar + i
        fill = EVEN_FILL if i % 2 else None
        _cell(ws, row, 1, i + 1, font=_body_font(), align=_center(), fill=fill, border=THIN)
        _merge(ws, row, 2, row, 3, a["content"], font=_body_font(), align=_left(), fill=fill, border=THIN)
        _merge(ws, row, 4, row, 6, a["summary"], font=_body_font(), align=_left(), fill=fill, border=THIN)
        _merge(ws, row, 7, row, 9, _fmt(a["amount"]), font=_body_font(bold=True), align=_right(), fill=fill, border=THIN)
        ws.row_dimensions[row].height = 18

    after_total_row = ar + max(len(after_sales), 1)
    _merge(ws, after_total_row, 1, after_total_row, 6, "售后合计：",
           font=_body_font(bold=True, sz=10), fill=TOTAL_FILL, align=_right(), border=TOTAL_BORDER)
    _merge(ws, after_total_row, 7, after_total_row, 9, _fmt(after_amt),
           font=_body_font(bold=True, sz=10, color=INK), fill=TOTAL_FILL, align=_right(), border=TOTAL_BORDER)
    ws.row_dimensions[after_total_row].height = 20

    # 货款合计
    goods_row = after_total_row + 1
    _merge(ws, goods_row, 1, goods_row, 5, "扣减售后",
           font=_body_font(sz=10), align=_right(), border=SUBTLE_BORDER)
    _merge(ws, goods_row, 6, goods_row, 7, "货款合计：",
           font=_body_font(bold=True, sz=10), align=_right(), border=SUBTLE_BORDER)
    _merge(ws, goods_row, 8, goods_row, 9, _fmt(goods_amt),
           font=_body_font(bold=True, sz=10, color=INK), align=_right(), border=SUBTLE_BORDER)
    ws.row_dimensions[goods_row].height = 20

    # ════════════════ 支出费用（对齐到 I 列） ════════════════
    r = goods_row + 2
    _apply_gradient_line(ws, r)
    r += 1

    _merge(ws, r, 1, r, 9, "▼ 支出费用", font=Font(name="微软雅黑", bold=True, size=11, color=INK),
           fill=SECTION_FILL, align=_left(), border=THIN)
    ws.row_dimensions[r].height = 22

    r += 1
    _merge(ws, r, 1, r, 6, "费用项目", font=_hdr_font(sz=10), fill=HEADER_FILL, align=_center(), border=THIN)
    _merge(ws, r, 7, r, 9, "金额(元)", font=_hdr_font(sz=10), fill=HEADER_FILL, align=_center(), border=THIN)
    ws.row_dimensions[r].height = 20

    fr = r + 1
    # `_fixed_fee_rows` 已把自定义费用接在固定六项之后；此处再拼一次会让自定义项重复成行。
    for i, f in enumerate(fixed_rows):
        row = fr + i
        fill = EVEN_FILL if i % 2 else None
        _merge(ws, row, 1, row, 6, f["name"], font=_body_font(), align=_left(), fill=fill, border=THIN)
        _merge(ws, row, 7, row, 9, _fmt(f["amount"]), font=_body_font(bold=True), align=_right(), fill=fill, border=THIN)
        ws.row_dimensions[row].height = 18

    fee_total_row = fr + len(fixed_rows)
    _merge(ws, fee_total_row, 1, fee_total_row, 6, "费用合计",
           font=_body_font(bold=True, sz=10), fill=TOTAL_FILL, align=_right(), border=TOTAL_BORDER)
    _merge(ws, fee_total_row, 7, fee_total_row, 9, _fmt(fee_amt),
           font=_body_font(bold=True, sz=10, color=INK), fill=TOTAL_FILL, align=_right(), border=TOTAL_BORDER)
    ws.row_dimensions[fee_total_row].height = 20

    # ════════════════ 应付总额 ════════════════
    r = fee_total_row + 2
    _apply_gradient_line(ws, r)
    r += 1

    _merge(ws, r, 1, r, 6, "应付贵方总金额（RMB）",
           font=_body_font(bold=True, sz=11, color=INK), fill=GRAND_FILL, align=_right(), border=GRAND_BORDER)
    _merge(ws, r, 7, r, 9, _fmt(payable),
           font=Font(name="微软雅黑", bold=True, size=16, color=INK),
           fill=GRAND_FILL, align=_left(), border=GRAND_BORDER)
    ws.row_dimensions[r].height = 32

    # 列宽只按表格内容自适应（跳过信息行）；备注列按 4 个汉字宽度封顶；
    # 销售表头行与合计行按可换行折半估宽，长标签不再把列撑宽。
    _auto_fit_columns(ws, skip_rows={3, 4}, caps={6: 8.5}, wrap_rows={7, total_row})

    # ── 基本信息：两行 × 每行 4 个字段，一个字段一个单元格，跨列自适应 ──
    info_rows_data = [
        [
            ("商号", entry["merchant_no"]),
            ("单号", entry["order_no"]),
            ("国家", entry.get("country")),
            ("市场", entry["market"]),
        ],
        [
            ("到达日期", _fmt(entry["arrival_date"])),
            ("来货数量", _fmt_int(entry["arrival_quantity"])),
            ("柜号", entry["container_no"]),
            ("转运公司", entry["vehicle_no"]),
        ],
    ]
    widths = [ws.column_dimensions[get_column_letter(c)].width or 8.0 for c in range(1, 10)]
    info_font = Font(name="微软雅黑", bold=True, size=10, color=INK)
    info_align = Alignment(horizontal="center", vertical="center", wrap_text=True)
    for row_idx, fields in enumerate(info_rows_data):
        rr = 3 + row_idx
        texts = [f"{label}：{val if val not in (None, '') else '—'}" for label, val in fields]
        needs = [_text_units(text) + 2.5 for text in texts]
        for text, (c1, c2) in zip(texts, _info_spans(widths, needs)):
            _merge(ws, rr, c1, rr, c2, text, font=info_font, align=info_align,
                   fill=SECTION_FILL, border=THIN)
        ws.row_dimensions[rr].height = 24

    output = BytesIO()
    wb.save(output)
    return output.getvalue()


def _fixed_fee_rows(fees):
    fixed = [f for f in fees if not f["is_custom"]]
    custom = [f for f in fees if f["is_custom"]]
    by_name = {f["name"]: f for f in fixed}
    rows = [by_name.get(n, {"name": n, "amount": Decimal("0")}) for n in FIXED_FEES]
    rows.extend(custom)
    return rows


def _apply_gradient_line(ws, r):
    for c in range(1, 10):
        _cell(ws, r, c, "", font=_body_font(sz=8), fill=PatternFill("solid", fgColor="B0CCC0"),
              border=Border())
    ws.row_dimensions[r].height = 3


# ──────────────────────────────────────────────
# HTML + PDF 导出
# ──────────────────────────────────────────────

def render_entry_html(entry: dict) -> str:
    """按财务报表样式渲染 HTML。"""
    sales = entry["sales"]
    after_sales = entry["after_sales"]
    fees = entry["fees"]
    fixed_rows = _fixed_fee_rows(fees)

    total_qty = sum(s["sales_quantity"] for s in sales)
    sales_amt = sum(s["sales_quantity"] * s["unit_price"] for s in sales)
    after_amt = sum(a["amount"] for a in after_sales)
    goods_amt = sales_amt - after_amt
    fee_amt = sum(f["amount"] for f in fees)
    payable = goods_amt - fee_amt

    # Sales rows
    sales_rows = ""
    for i, s in enumerate(sales):
        bg = ' style="background:#F8FAF9"' if i % 2 else ""
        amt = s["sales_quantity"] * s["unit_price"]
        sales_rows += f"""
        <tr{bg}>
          <td>{_fmt(s["sale_date"])}</td>
          <td>{s["variety"] or ''}</td>
          <td>{s.get("grade") or ''}</td>
          <td>{s["head_count"] or ''}</td>
          <td>{s["spec_kg"] or ''}</td>
          <td>{s["remark"] or ''}</td>
          <td class="num">{_fmt_int(s["sales_quantity"])}</td>
          <td class="num">{_fmt(s["unit_price"])}</td>
          <td class="num bold">{_fmt(amt)}</td>
        </tr>"""

    after_rows = ""
    for i, a in enumerate(after_sales):
        bg = ' style="background:#F8FAF9"' if i % 2 else ""
        after_rows += f"""
        <tr{bg}>
          <td>{i + 1}</td>
          <td colspan="2">{a["content"]}</td>
          <td colspan="3">{a["summary"]}</td>
          <td colspan="2" class="num bold">{_fmt(a["amount"])}</td>
        </tr>"""

    fee_rows = ""
    all_fees = fixed_rows
    for i, f in enumerate(all_fees):
        bg = ' style="background:#F8FAF9"' if i % 2 else ""
        fee_rows += f"""
        <tr{bg}>
          <td colspan="6">{f["name"]}</td>
          <td colspan="2" class="num bold">{_fmt(f["amount"])}</td>
        </tr>"""

    merchant = entry["merchant_no"] or ""
    order_no = entry["order_no"] or ""
    container = entry["container_no"] or ""
    vehicle = entry["vehicle_no"] or ""
    country = entry.get("country") or ""
    market = entry["market"] or ""
    arrival = _fmt(entry["arrival_date"])
    arrival_qty = _fmt_int(entry["arrival_quantity"])

    html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<style>
@page {{ margin: 20mm 18mm 18mm; size: A4 landscape; }}
* {{ margin:0; padding:0; box-sizing:border-box; }}
body {{ font-family:'Microsoft YaHei','微软雅黑',sans-serif; font-size:10pt; color:#1a3c34; }}
h1 {{ text-align:center; font-size:20pt; letter-spacing:6px; color:#1a3c34; margin-bottom:12px; }}
.info-bar {{ background:#f8faf9; border:1px solid #e8edeb; border-radius:3px; padding:8px 12px; margin-bottom:10px; font-size:9pt; line-height:1.8; }}
.info-bar b {{ color:#888; font-weight:600; }}
table {{ width:100%; border-collapse:collapse; margin-bottom:8px; }}
th {{ background:#2b5e4a; color:#fff; padding:6px 4px; font-size:9pt; font-weight:600; text-align:center; border:1px solid #1f4a3a; }}
td {{ padding:4px; text-align:center; border:1px solid #dde5e1; font-size:9pt; }}
tr.section td {{ background:#eef4f1 !important; font-weight:700; font-size:10pt; text-align:left; padding:5px 10px; }}
tr.total td {{ background:#f0f5f3 !important; font-weight:700; border-top:2.5px solid #2b5e4a; }}
tr.grand td {{ background:#e1ede7 !important; font-weight:800; font-size:11pt; border-top:3px double #2b5e4a; }}
.num {{ text-align:right; padding-right:8px; font-variant-numeric:tabular-nums; }}
.bold {{ font-weight:700; }}
.divider {{ height:3px; background:linear-gradient(90deg,#2b5e4a,#b0ccc0); margin:12px 0 8px; }}
.foot {{ font-size:8pt; color:#999; margin-top:4px; }}
</style>
</head>
<body>
<h1>结  算  单</h1>
<div class="info-bar">
<b>商号：</b>{merchant} &nbsp;&nbsp;|&nbsp;&nbsp;
<b>单号：</b>{order_no} &nbsp;&nbsp;|&nbsp;&nbsp;
<b>柜号：</b>{container} &nbsp;&nbsp;|&nbsp;&nbsp;
<b>转运公司：</b>{vehicle} &nbsp;&nbsp;|&nbsp;&nbsp;
<b>国家：</b>{country} &nbsp;&nbsp;|&nbsp;&nbsp;
<b>市场：</b>{market} &nbsp;&nbsp;|&nbsp;&nbsp;
<b>到达日期：</b>{arrival} &nbsp;&nbsp;|&nbsp;&nbsp;
<b>来货数量：</b>{arrival_qty} 件
</div>

<table>
<thead>
<tr><th>销售日期</th><th>品种</th><th>等级</th><th>规格(头数)</th><th>规格(KG)</th><th>备注</th><th>数量(件)</th><th>单价(元)</th><th>金额(元)</th></tr>
</thead>
<tbody>
{sales_rows}
<tr class="total">
  <td colspan="6" style="text-align:left; padding-left:10px;"><b>总件数：{_fmt_int(total_qty)}</b></td>
  <td class="num bold">{_fmt_int(total_qty)}</td>
  <td style="text-align:right;"><b>销售金额：</b></td>
  <td class="num bold">{_fmt(sales_amt)}</td>
</tr>
</tbody>
</table>

<div class="divider"></div>

<table>
<tbody>
<tr class="section"><td colspan="8"><b>▼ 售  后</b></td></tr>
<tr><th style="width:6%">序号</th><th colspan="2" style="width:26%">内容</th><th colspan="3" style="width:42%">摘要</th><th colspan="2" style="width:26%">金额(元)</th></tr>
{after_rows}
<tr class="total">
  <td colspan="6" style="text-align:right; padding-right:10px;"><b>售后合计：</b></td>
  <td colspan="2" class="num bold">{_fmt(after_amt)}</td>
</tr>
<tr class="total">
  <td colspan="5" style="text-align:left; padding-left:10px; color:#999;">扣减售后</td>
  <td colspan="2" style="text-align:right;"><b>货款合计：</b></td>
  <td class="num bold">{_fmt(goods_amt)}</td>
</tr>
</tbody>
</table>

<div class="divider"></div>

<table>
<tbody>
<tr class="section"><td colspan="8"><b>▼ 支出费用</b></td></tr>
<tr><th colspan="6">费用项目</th><th colspan="2">金额(元)</th></tr>
{fee_rows}
<tr class="total">
  <td colspan="6" style="text-align:right; padding-right:10px;"><b>费用合计</b></td>
  <td colspan="2" class="num bold">{_fmt(fee_amt)}</td>
</tr>
</tbody>
</table>

<div class="divider"></div>

<table>
<tbody>
<tr class="grand">
  <td colspan="6" style="font-size:11pt;"><b>应付贵方总金额（RMB）</b></td>
  <td colspan="2" class="num bold" style="font-size:16pt;">¥ {_fmt(payable)}</td>
</tr>
</tbody>
</table>

<div class="foot">
货款合计 {_fmt(sales_amt)} − 售后合计 {_fmt(after_amt)} − 费用合计 {_fmt(fee_amt)} = 应付 {_fmt(payable)}
<br>生成时间：{datetime.now().strftime('%Y-%m-%d %H:%M')}
</div>
</body>
</html>"""
    return html


def render_entry_pdf_from_workbook(content: bytes) -> bytes:
    """把结算单 xlsx 用 LibreOffice 另存为 PDF：与 Excel 版式完全一致。

    每次调用使用独立临时目录与 LibreOffice 用户 profile，避免并发转换互相阻塞。
    """
    soffice = shutil.which("soffice") or shutil.which("libreoffice")
    if not soffice:
        raise RuntimeError("服务器未安装 LibreOffice，无法把结算单另存为 PDF")
    with tempfile.TemporaryDirectory() as tmp:
        source = Path(tmp) / "settlement.xlsx"
        source.write_bytes(content)
        profile = Path(tmp) / "lo-profile"
        completed = subprocess.run(
            [
                soffice, "--headless",
                f"-env:UserInstallation=file://{profile}",
                "--convert-to", "pdf:calc_pdf_Export",
                "--outdir", tmp, str(source),
            ],
            capture_output=True,
            timeout=60,
        )
        target = Path(tmp) / "settlement.pdf"
        if completed.returncode != 0 or not target.exists():
            detail = (completed.stderr or completed.stdout).decode("utf-8", "ignore")[:200]
            raise RuntimeError(f"LibreOffice 转换 PDF 失败：{detail}")
        return target.read_bytes()




# ──────────────────────────────────────────────
# 公共入口
# ──────────────────────────────────────────────

def build_entry_workbook(db: Session, merchant_no: str) -> bytes:
    entry = read_entry(db, merchant_no)
    if entry is None:
        raise ValueError("该结算单不是手工录单，不能导出")
    return render_entry_workbook(entry)


def build_settlement_template_workbook(db: Session, merchant_no: str) -> bytes:
    entry = load_entry(db, merchant_no)
    return render_entry_workbook(entry)


def build_settlement_template_pdf(db: Session, merchant_no: str) -> bytes:
    """结算单 PDF：与 Excel 同一工作簿，经 LibreOffice 另存，版式完全一致。"""
    content = build_settlement_template_workbook(db, merchant_no)
    return render_entry_pdf_from_workbook(content)


__all__ = [
    "build_entry_workbook", "build_settlement_template_workbook",
    "build_settlement_template_pdf", "read_imported_entry",
    "render_entry_workbook", "render_entry_pdf_from_workbook",
    "render_entry_html", "load_entry",
]
