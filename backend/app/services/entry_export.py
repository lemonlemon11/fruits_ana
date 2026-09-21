"""结算单 xlsx / pdf 导出；xlsx 为财务表格样式，pdf 使用 WeasyPrint 从 HTML 渲染。"""

from __future__ import annotations

from datetime import datetime, date
from decimal import Decimal
from io import BytesIO
from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from sqlalchemy.orm import Session
# PDF via Playwright (replaces WeasyPrint)

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
        "market": batch.market, "arrival_date": batch.arrival_date,
        "arrival_quantity": batch.arrival_quantity,
        "source_type": batch.source_type,
        "sales": [{
            "sale_date": r.sale_date,
            "variety": r.grade_raw if r.grade_raw else r.grade.value,
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
MUTED = "888888"

THIN_SIDE = Side(style="thin", color="DDE5E1")
THICK_TOP = Side(style="medium", color="2B5E4A")
THIN = Border(left=THIN_SIDE, right=THIN_SIDE, top=Side(style="thin", color="DDE5E1"), bottom=THIN_SIDE)
NO_BORDER = Border()


def _hdr_font(bold=True, sz=11):
    return Font(name="微软雅黑", bold=bold, size=sz, color=WHITE)

def _body_font(bold=False, sz=10, color=INK):
    return Font(name="微软雅黑", bold=bold, size=sz, color=color)

def _body_font_muted(sz=10):
    return Font(name="微软雅黑", size=sz, color=MUTED)


def _cell(ws, r, c, val, font=None, align=None, fill=None, border=None, nf=None):
    cell = ws.cell(r, c, val)
    if font: cell.font = font
    if align: cell.alignment = align
    if fill: cell.fill = fill
    if border: cell.border = border
    if nf: cell.number_format = nf


def _center():
    return Alignment(horizontal="center", vertical="center")

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

    # 列宽
    for col, w in {1: 22, 2: 13, 3: 14, 4: 13, 5: 12, 6: 14, 7: 14, 8: 13, 9: 16}.items():
        ws.column_dimensions[get_column_letter(col)].width = w

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

    r = 1

    # ── 标题 ──
    ws.merge_cells("A1:I2")
    _cell(ws, 1, 1, "结 算 单", font=Font(name="微软雅黑", bold=True, size=20, color=INK),
          align=Alignment(horizontal="center", vertical="center"))
    ws.row_dimensions[1].height = 36
    ws.row_dimensions[2].height = 8

    # ── 基本信息 ──
    r = 3
    ws.merge_cells(f"A{r}:I{r}")
    info_grid = [
        ("商号：", entry["merchant_no"]), ("单号：", entry["order_no"]),
        ("柜号：", entry["container_no"]), ("转运公司：", entry["vehicle_no"]),
        ("市场：", entry["market"]), ("到达日期：", _fmt(entry["arrival_date"])),
        ("来货数量：", _fmt_int(entry["arrival_quantity"])),
    ]
    lbl_font = Font(name="微软雅黑", size=9, color=MUTED)
    val_font = Font(name="微软雅黑", size=11, bold=True, color=INK)

    infos = []
    for lbl, val in info_grid:
        infos.append(f"<b>{lbl}</b> {val if val else '—'}" if val else f"<b>{lbl}</b> —")

    # Use a simple row approach instead of HTML-like
    pieces = []
    for lbl, val in info_grid:
        label = lbl.replace("：", "")
        pieces.append(f"{label}：{val if val else '—'}")
    ws.merge_cells(f"A{r}:I{r}")
    _cell(ws, r, 1, "  │  ".join(pieces),
          font=Font(name="微软雅黑", size=10, color=INK),
          align=Alignment(horizontal="left", vertical="center"))
    ws.row_dimensions[r].height = 24

    # ── 分隔 ──
    r = 4
    _apply_gradient_line(ws, r)

    # ════════════════ 销售明细 ════════════════
    r = 5
    ws.merge_cells(f"A{r}:I{r}")
    _cell(ws, r, 1, "▼ 销售明细", font=Font(name="微软雅黑", bold=True, size=11, color=INK),
          fill=SECTION_FILL, align=_left())
    for c in range(1, 10):
        _border_line(ws, r, c, THIN_SIDE)
    ws.row_dimensions[r].height = 22

    r = 6
    headers = ["销售日期", "品种", "规格(头数)", "规格(KG)", "备注", "数量(件)", "单价(元)", "金额(元)"]
    for ci, h in enumerate(headers, 1):
        _cell(ws, r, ci, h, font=_hdr_font(), fill=HEADER_FILL, align=_center(), border=THIN)
    ws.row_dimensions[r].height = 22

    sr = 7
    for i, s in enumerate(sales):
        row = sr + i
        fill = EVEN_FILL if i % 2 else None
        _cell(ws, row, 1, _fmt(s["sale_date"]), font=_body_font(), align=_center(), fill=fill, border=THIN)
        _cell(ws, row, 2, s["variety"] or "", font=_body_font(), align=_center(), fill=fill, border=THIN)
        _cell(ws, row, 3, s["head_count"] or "", font=_body_font(), align=_center(), fill=fill, border=THIN)
        _cell(ws, row, 4, s["spec_kg"] or "", font=_body_font(), align=_center(), fill=fill, border=THIN)
        _cell(ws, row, 5, s["remark"] or "", font=_body_font(), align=_center(), fill=fill, border=THIN)
        _cell(ws, row, 6, _fmt_int(s["sales_quantity"]), font=_body_font(), align=_right(), fill=fill, border=THIN)
        _cell(ws, row, 7, _fmt(s["unit_price"]), font=_body_font(), align=_right(), fill=fill, border=THIN)
        amt = s["sales_quantity"] * s["unit_price"]
        _cell(ws, row, 8, _fmt(amt), font=_body_font(bold=True), align=_right(), fill=fill, border=THIN)
        ws.row_dimensions[row].height = 18

    # 合计行
    total_row = sr + len(sales)
    for c in range(1, 9):
        _border_line(ws, total_row, c, THIN_SIDE)
    ws.merge_cells(f"A{total_row}:E{total_row}")
    _cell(ws, total_row, 1, f"总件数：{_fmt_int(total_qty)}", font=_body_font(bold=True, sz=10),
          fill=TOTAL_FILL, align=_left(), border=Border(top=THICK_TOP, bottom=THIN_SIDE))
    _cell(ws, total_row, 6, _fmt_int(total_qty), font=_body_font(bold=True, sz=10, color=INK),
          fill=TOTAL_FILL, align=_right(), border=Border(top=THICK_TOP, bottom=THIN_SIDE))
    _cell(ws, total_row, 7, "销售金额：", font=_body_font(bold=True, sz=10),
          fill=TOTAL_FILL, align=_right(), border=Border(top=THICK_TOP, bottom=THIN_SIDE))
    _cell(ws, total_row, 8, _fmt(sales_amt), font=_body_font(bold=True, sz=10, color=INK),
          fill=TOTAL_FILL, align=_right(), border=Border(top=THICK_TOP, bottom=THIN_SIDE))
    ws.row_dimensions[total_row].height = 20

    # ════════════════ 售后 ════════════════
    r = total_row + 2
    _apply_gradient_line(ws, r)
    r += 1

    ws.merge_cells(f"A{r}:H{r}")
    _cell(ws, r, 1, "▼ 售  后", font=Font(name="微软雅黑", bold=True, size=11, color=INK),
          fill=SECTION_FILL, align=_left())
    for c in range(1, 9):
        _border_line(ws, r, c, THIN_SIDE)
    ws.row_dimensions[r].height = 22

    r += 1
    after_headers = ["序号", "内容", "摘要", "金额(元)"]
    for ci, h in enumerate(after_headers):
        col_map = {0: 1, 1: 2, 2: 4, 3: 7}
        col = col_map[ci]
        span = {0: 1, 1: 2, 2: 3, 3: 2}[ci]
        if span > 1:
            ws.merge_cells(f"{get_column_letter(col)}{r}:{get_column_letter(col+span-1)}{r}")
        _cell(ws, r, col, h, font=_hdr_font(sz=10), fill=HEADER_FILL, align=_center(), border=THIN)
    ws.row_dimensions[r].height = 20

    ar = r + 1
    for i, a in enumerate(after_sales):
        row = ar + i
        fill = EVEN_FILL if i % 2 else None
        _cell(ws, row, 1, i + 1, font=_body_font(), align=_center(), fill=fill, border=THIN)
        ws.merge_cells(f"B{row}:C{row}")
        _cell(ws, row, 2, a["content"], font=_body_font(), align=_left(), fill=fill, border=THIN)
        ws.merge_cells(f"D{row}:F{row}")
        _cell(ws, row, 4, a["summary"], font=_body_font_muted(), align=_left(), fill=fill, border=THIN)
        ws.merge_cells(f"G{row}:H{row}")
        _cell(ws, row, 7, _fmt(a["amount"]), font=_body_font(bold=True), align=_right(), fill=fill, border=THIN)
        ws.row_dimensions[row].height = 18

    after_total_row = ar + max(len(after_sales), 1)
    for c in range(1, 9):
        _border_line(ws, after_total_row, c, THIN_SIDE)
    ws.merge_cells(f"A{after_total_row}:F{after_total_row}")
    _cell(ws, after_total_row, 1, "售后合计：", font=_body_font(bold=True, sz=10),
          fill=TOTAL_FILL, align=_right(), border=Border(top=THICK_TOP, bottom=THIN_SIDE))
    ws.merge_cells(f"G{after_total_row}:H{after_total_row}")
    _cell(ws, after_total_row, 7, _fmt(after_amt), font=_body_font(bold=True, sz=10, color=INK),
          fill=TOTAL_FILL, align=_right(), border=Border(top=THICK_TOP, bottom=THIN_SIDE))
    ws.row_dimensions[after_total_row].height = 20

    # 货款合计
    goods_row = after_total_row + 1
    ws.merge_cells(f"A{goods_row}:E{goods_row}")
    _cell(ws, goods_row, 1, "扣减售后", font=_body_font_muted(9), align=_left(), border=Border(bottom=THIN_SIDE))
    ws.merge_cells(f"F{goods_row}:G{goods_row}")
    _cell(ws, goods_row, 6, "货款合计：", font=_body_font(bold=True, sz=10), align=_right(), border=Border(bottom=THIN_SIDE))
    _cell(ws, goods_row, 8, _fmt(goods_amt), font=_body_font(bold=True, sz=10, color=INK), align=_right(), border=Border(bottom=THIN_SIDE))
    ws.row_dimensions[goods_row].height = 20

    # ════════════════ 支出费用 ════════════════
    r = goods_row + 2
    _apply_gradient_line(ws, r)
    r += 1

    ws.merge_cells(f"A{r}:H{r}")
    _cell(ws, r, 1, "▼ 支出费用", font=Font(name="微软雅黑", bold=True, size=11, color=INK),
          fill=SECTION_FILL, align=_left())
    for c in range(1, 9):
        _border_line(ws, r, c, THIN_SIDE)
    ws.row_dimensions[r].height = 22

    r += 1
    ws.merge_cells(f"A{r}:F{r}")
    _cell(ws, r, 1, "费用项目", font=_hdr_font(sz=10), fill=HEADER_FILL, align=_center(), border=THIN)
    ws.merge_cells(f"G{r}:H{r}")
    _cell(ws, r, 7, "金额(元)", font=_hdr_font(sz=10), fill=HEADER_FILL, align=_center(), border=THIN)
    ws.row_dimensions[r].height = 20

    fr = r + 1
    # `_fixed_fee_rows` 已把自定义费用接在固定六项之后；此处再拼一次会让自定义项重复成行。
    for i, f in enumerate(fixed_rows):
        row = fr + i
        fill = EVEN_FILL if i % 2 else None
        ws.merge_cells(f"A{row}:F{row}")
        _cell(ws, row, 1, f["name"], font=_body_font(), align=_left(), fill=fill, border=THIN)
        ws.merge_cells(f"G{row}:H{row}")
        _cell(ws, row, 7, _fmt(f["amount"]), font=_body_font(bold=True), align=_right(), fill=fill, border=THIN)
        ws.row_dimensions[row].height = 18

    fee_total_row = fr + len(fixed_rows)
    ws.merge_cells(f"A{fee_total_row}:F{fee_total_row}")
    _cell(ws, fee_total_row, 1, "费用合计", font=_body_font(bold=True, sz=10),
          fill=TOTAL_FILL, align=_right(), border=Border(top=THICK_TOP, bottom=THIN_SIDE))
    ws.merge_cells(f"G{fee_total_row}:H{fee_total_row}")
    _cell(ws, fee_total_row, 7, _fmt(fee_amt), font=_body_font(bold=True, sz=10, color=INK),
          fill=TOTAL_FILL, align=_right(), border=Border(top=THICK_TOP, bottom=THIN_SIDE))
    ws.row_dimensions[fee_total_row].height = 20

    # ════════════════ 应付总额 ════════════════
    r = fee_total_row + 2
    _apply_gradient_line(ws, r)
    r += 1

    ws.merge_cells(f"A{r}:F{r}")
    _cell(ws, r, 1, "应付贵方总金额（RMB）", font=_body_font(bold=True, sz=11, color=INK),
          fill=GRAND_FILL, align=_left(), border=Border(top=Side(style="double", color="2B5E4A"), bottom=THIN_SIDE))
    ws.merge_cells(f"G{r}:H{r}")
    _cell(ws, r, 7, _fmt(payable), font=Font(name="微软雅黑", bold=True, size=16, color=INK),
          fill=GRAND_FILL, align=_right(), border=Border(top=Side(style="double", color="2B5E4A"), bottom=THIN_SIDE))
    ws.row_dimensions[r].height = 32

    # 脚注
    r += 1
    note = f"货款合计 {_fmt(sales_amt)} − 售后合计 {_fmt(after_amt)} − 费用合计 {_fmt(fee_amt)} = 应付 {_fmt(payable)}"
    ws.merge_cells(f"A{r}:H{r}")
    _cell(ws, r, 1, note, font=_body_font_muted(9), align=_left())
    ws.row_dimensions[r].height = 18

    # 生成时间
    r += 1
    ws.merge_cells(f"A{r}:H{r}")
    _cell(ws, r, 1, f"生成时间：{datetime.now().strftime('%Y-%m-%d %H:%M')}",
          font=_body_font_muted(8), align=_left())
    ws.row_dimensions[r].height = 16

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
        _cell(ws, r, c, "", fill=PatternFill("solid", fgColor="B0CCC0"),
              border=Border())
    ws.row_dimensions[r].height = 3


def _border_line(ws, r, c, side):
    ws.cell(r, c).border = Border(bottom=side, left=side, right=side)


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
<b>市场：</b>{market} &nbsp;&nbsp;|&nbsp;&nbsp;
<b>到达日期：</b>{arrival} &nbsp;&nbsp;|&nbsp;&nbsp;
<b>来货数量：</b>{arrival_qty} 件
</div>

<table>
<thead>
<tr><th>销售日期</th><th>品种</th><th>规格(头数)</th><th>规格(KG)</th><th>备注</th><th>数量(件)</th><th>单价(元)</th><th>金额(元)</th></tr>
</thead>
<tbody>
{sales_rows}
<tr class="total">
  <td colspan="5" style="text-align:left; padding-left:10px;"><b>总件数：{_fmt_int(total_qty)}</b></td>
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


def render_entry_pdf(entry: dict) -> bytes:
    """从 XLSX 相同数据用 fpdf2 渲染专业财务报表 PDF（A4 横向，支持多页）。"""
    from fpdf import FPDF

    sales = entry["sales"]
    after_sales = entry["after_sales"]
    fees = entry["fees"]

    total_qty = sum(s["sales_quantity"] for s in sales)
    sales_amt = sum(s["sales_quantity"] * s["unit_price"] for s in sales)
    after_amt = sum(a["amount"] for a in after_sales)
    goods_amt = sales_amt - after_amt
    fee_amt = sum(f["amount"] for f in fees)
    payable = goods_amt - fee_amt

    pdf = FPDF(orientation="L", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_font("yh", "", "/usr/share/fonts/wqy-microhei/wqy-microhei.ttc")
    pdf.add_font("yh", "B", "/usr/share/fonts/wqy-microhei/wqy-microhei.ttc")

    lm, tm = 18, 18
    pw = 297 - lm - 18  # A4 landscape usable width
    row_h = 6.5
    # 8 columns for sales, adjusted to fit
    col_w = [46, 28, 30, 28, 26, 30, 30, sum([48,28,30,28,26,30,30,34]) - 46-28-30-28-26-30-30]
    # Actually simpler: use percentages
    cw_pct = [0.185, 0.105, 0.115, 0.105, 0.095, 0.115, 0.115, 0.165]  # sums to 1.0
    cw = [int(pw * p) for p in cw_pct]
    # Adjust last col
    cw[-1] = pw - sum(cw[:-1])

    # 4 columns for after-sales
    after_cw = [14, int(pw * 0.42), int(pw * 0.32), pw - 14 - int(pw * 0.42) - int(pw * 0.32)]

    # 2 columns for fees
    fee_cw1 = int(pw * 0.82)
    fee_cw2 = pw - fee_cw1

    def add_title_page():
        pdf.add_page()

    def info_str():
        parts = [
            f"商号：{entry['merchant_no']}", f"单号：{entry['order_no']}",
            f"柜号：{entry['container_no']}", f"转运公司：{entry['vehicle_no']}",
            f"市场：{entry['market']}", f"到达日期：{_fmt(entry['arrival_date'])}",
            f"来货数量：{_fmt_int(entry['arrival_quantity'])}",
        ]
        return "  │  ".join(parts)

    def section_title(y_pos, text_str):
        if y_pos + 10 > 210 - 18:
            pdf.add_page()
            y_pos = tm
        pdf.set_fill_color(238, 244, 241)
        pdf.set_draw_color(200, 210, 205)
        pdf.set_font("yh", "B", 10)
        pdf.set_xy(lm, y_pos)
        pdf.cell(pw, 8, f"  {text_str}", border=1, align="L", fill=True)
        return y_pos + 10

    def table_header(y_pos, headers, widths):
        if y_pos + 9 > 210 - 18:
            pdf.add_page()
            y_pos = tm
        pdf.set_fill_color(43, 94, 74)
        pdf.set_text_color(255, 255, 255)
        pdf.set_draw_color(31, 74, 58)
        pdf.set_font("yh", "B", 7.5)
        x = lm
        for i, h in enumerate(headers):
            pdf.set_xy(x, y_pos)
            pdf.cell(widths[i], 8, h, border=1, align="C", fill=True)
            x += widths[i]
        pdf.set_text_color(26, 60, 52)
        return y_pos + 9

    def data_row(y_pos, vals, widths, aligns=None, is_even=False, bold=False):
        if y_pos + row_h > 210 - 18:
            pdf.add_page()
            y_pos = tm
        if aligns is None:
            aligns = ["C"] * (len(vals) - 3) + ["R"] * 3
            for i in range(len(vals)):
                if i >= len(vals) - 3:
                    aligns[i] = "R"
                else:
                    aligns[i] = "C"
        x = lm
        pdf.set_draw_color(200, 210, 205)
        if is_even:
            pdf.set_fill_color(248, 250, 249)
        else:
            pdf.set_fill_color(255, 255, 255)
        pdf.set_font("yh", "B" if bold else "", 7.5)
        for i, v in enumerate(vals):
            al = aligns[i] if i < len(aligns) else "C"
            pdf.set_xy(x, y_pos)
            pdf.cell(widths[i], row_h, str(v), border=1, align=al, fill=True)
            x += widths[i]
        return y_pos + row_h

    # First page
    add_title_page()
    y = tm

    # ── 标题 ──
    pdf.set_font("yh", "B", 20)
    pdf.set_text_color(26, 60, 52)
    pdf.set_xy(lm, y)
    pdf.cell(pw, 12, "结  算  单", align="C")
    y += 14

    # ── 基本信息 ──
    if y + 9 > 210 - 18:
        pdf.add_page()
        y = tm
    pdf.set_draw_color(200, 210, 205)
    pdf.set_fill_color(248, 250, 249)
    pdf.set_font("yh", "", 8.5)
    pdf.set_xy(lm, y)
    pdf.cell(pw, 9, info_str(), border=1, align="L", fill=True)
    y += 12

    # ── 销售明细 ──
    sale_headers = ["销售日期", "品种", "规格(头数)", "规格(KG)", "备注", "数量(件)", "单价(元)", "金额(元)"]
    sale_aligns = ["C", "C", "C", "C", "C", "R", "R", "R"]

    y = section_title(y, "▼ 销售明细")
    y = table_header(y, sale_headers, cw)
    for i, s in enumerate(sales):
        amt = s["sales_quantity"] * s["unit_price"]
        vals = [
            str(s["sale_date"]), s["variety"] or "", s["head_count"] or "",
            s["spec_kg"] or "", s["remark"] or "",
            _fmt_int(s["sales_quantity"]), _fmt(s["unit_price"]), _fmt(amt)
        ]
        y = data_row(y, vals, cw, sale_aligns, is_even=(i % 2 == 1))

    # 销售合计
    y = data_row(y, ["", "", "", "", "总件数/合计", _fmt_int(total_qty), "", _fmt(sales_amt)], cw, sale_aligns, bold=True)

    # ── 售后区段 ──
    after_headers = ["序号", "内容", "摘要", "金额(元)"]
    after_aligns = ["C", "L", "L", "R"]
    y = section_title(y, "▼ 售  后")
    y = table_header(y, after_headers, after_cw)
    for i, a in enumerate(after_sales):
        vals = [str(i + 1), a["content"] or "", a["summary"] or "", _fmt(a["amount"])]
        y = data_row(y, vals, after_cw, after_aligns, is_even=(i % 2 == 1))

    # 售后合计行
    pdf.set_fill_color(240, 245, 243)
    pdf.set_font("yh", "B", 9)
    if y + row_h > 210 - 18:
        pdf.add_page()
        y = tm
    pdf.set_xy(lm, y)
    pdf.set_draw_color(200, 210, 205)
    pdf.cell(after_cw[0] + after_cw[1] + after_cw[2], row_h, "  售后合计", border=1, align="L", fill=True)
    pdf.cell(after_cw[3], row_h, _fmt(after_amt), border=1, align="R", fill=True)
    y += row_h
    # 扣减售后行
    if y + row_h > 210 - 18:
        pdf.add_page()
        y = tm
    pdf.set_xy(lm, y)
    pdf.set_fill_color(240, 245, 243)
    pdf.cell(after_cw[0] + after_cw[1] + after_cw[2], row_h, "  扣减售后 / 货款合计", border=1, align="L", fill=True)
    pdf.cell(after_cw[3], row_h, _fmt(goods_amt), border=1, align="R", fill=True)
    y += 10

    # ── 支出费用 ──
    fee_headers = ["费用项目", "金额(元)"]
    fee_aligns = ["L", "R"]
    y = section_title(y, "▼ 支出费用")
    y = table_header(y, fee_headers, [fee_cw1, fee_cw2])
    for i, f in enumerate(fees):
        vals = [f["name"], _fmt(f["amount"])]
        y = data_row(y, vals, [fee_cw1, fee_cw2], fee_aligns, is_even=(i % 2 == 1))

    # 费用合计
    pdf.set_fill_color(240, 245, 243)
    pdf.set_font("yh", "B", 9)
    if y + row_h > 210 - 18:
        pdf.add_page()
        y = tm
    pdf.set_xy(lm, y)
    pdf.cell(fee_cw1, row_h, "  费用合计", border=1, align="L", fill=True)
    pdf.cell(fee_cw2, row_h, _fmt(fee_amt), border=1, align="R", fill=True)
    y += 10

    # ── 应付总金额 ──
    if y + 10 > 210 - 18:
        pdf.add_page()
        y = tm
    pdf.set_draw_color(43, 94, 74)
    pdf.set_line_width(0.5)
    pdf.set_fill_color(225, 237, 231)
    pdf.set_font("yh", "B", 11)
    pdf.set_xy(lm, y)
    pdf.cell(fee_cw1, 10, "  应付贵方总金额（RMB）", border=1, align="L", fill=True)
    pdf.set_font("yh", "B", 16)
    pdf.set_text_color(43, 94, 74)
    pdf.set_xy(lm + fee_cw1, y)
    pdf.cell(fee_cw2, 10, f"  {_fmt(payable)}", border=1, align="R", fill=True)
    pdf.set_text_color(26, 60, 52)
    y += 11

    # ── 脚注 ──
    if y + 8 > 210 - 18:
        pdf.add_page()
        y = tm
    from datetime import datetime
    foot = f"货款合计 {_fmt(sales_amt)} – 售后合计 {_fmt(after_amt)} – 费用合计 {_fmt(fee_amt)} = 应付 {_fmt(payable)}"
    pdf.set_font("yh", "", 7)
    pdf.set_text_color(140, 150, 145)
    pdf.set_xy(lm, y)
    pdf.cell(0, 5, foot)
    y += 4
    pdf.set_xy(lm, y)
    pdf.cell(0, 5, f"生成时间：{datetime.now().strftime('%Y-%m-%d %H:%M')}")

    return pdf.output()


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


__all__ = [
    "build_entry_workbook", "build_settlement_template_workbook",
    "read_imported_entry", "render_entry_workbook",
    "render_entry_html", "render_entry_pdf", "load_entry",
]
