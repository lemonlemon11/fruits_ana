"""结算单 xlsx / pdf 导出；xlsx 为财务表格样式，PDF 由 PIL 渲染图片直接生成（无外部依赖）。"""

from __future__ import annotations

import os
from datetime import datetime, date
from decimal import Decimal
from io import BytesIO
from typing import Any

from openpyxl import Workbook
from openpyxl.drawing.image import Image as XLImage
from openpyxl.drawing.spreadsheet_drawing import AnchorMarker, OneCellAnchor
from openpyxl.drawing.xdr import XDRPositiveSize2D
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.utils.units import pixels_to_EMU
from openpyxl.worksheet.page import PageMargins
from PIL import Image, ImageDraw, ImageFont
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


def _merge_sales_rows(sales: list[dict]) -> list[dict]:
    """导出合并：同一天 / 同规格（头数）/ 同重量（KG）/ 同单价，且品种、等级、备注一致的
    行合并为一行，数量汇总（金额 = 数量 × 单价，随数量汇总，合计不变）。"""
    merged: dict[tuple, dict] = {}
    for row in sales:
        key = (
            row.get("sale_date"), row.get("variety"), row.get("grade"),
            row.get("head_count"), row.get("spec_kg"), row.get("unit_price"),
            row.get("remark"),
        )
        if key in merged:
            merged[key]["sales_quantity"] += row["sales_quantity"]
        else:
            merged[key] = dict(row)
    return list(merged.values())


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

def _right():
    return Alignment(horizontal="right", vertical="center")

def _center_wrap():
    return Alignment(horizontal="center", vertical="center", wrap_text=True)


def _find_offset(sizes: list[float], target: float) -> tuple[int, float]:
    """在累积尺寸序列里定位 target 落点：返回 (索引, 段内偏移)。"""
    remaining = target
    for idx, size in enumerate(sizes):
        if remaining < size:
            return idx, max(remaining, 0.0)
        remaining -= size
    return len(sizes) - 1, 0.0


def _add_xlsx_watermark(ws, widths_units: list[float]) -> None:
    """在表格内容区域中央叠加「顺立达SLD」半透明斜向水印（PNG 图片浮于单元格上方）。

    行列像素按列宽单位 / 行高 pt 近似换算，水印只需视觉居中，不要求像素级精确。
    缺中文字体时跳过水印（不影响 xlsx 本身导出）。
    """
    col_px = [w * 7 + 5 for w in widths_units]
    row_px = []
    for r in range(1, ws.max_row + 1):
        pt = ws.row_dimensions[r].height or 15.0
        row_px.append(pt * 96 / 72)
    try:
        target_w = min(max(sum(col_px) * 0.45, 260), 640)
        stamp = _watermark_stamp(max(26, round(target_w * 2 / _watermark_units())))
    except RuntimeError:
        return
    buffer = BytesIO()
    stamp.save(buffer, format="PNG")
    col_idx, x_off = _find_offset(col_px, (sum(col_px) - stamp.width) / 2)
    row_idx, y_off = _find_offset(row_px, (sum(row_px) - stamp.height) / 2)
    img = XLImage(buffer)
    img.anchor = OneCellAnchor(
        _from=AnchorMarker(col=col_idx, colOff=pixels_to_EMU(x_off), row=row_idx, rowOff=pixels_to_EMU(y_off)),
        ext=XDRPositiveSize2D(pixels_to_EMU(stamp.width), pixels_to_EMU(stamp.height)),
    )
    ws.add_image(img)


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

    # 同一天/同规格/同重量/同单价的行先合并再渲染（用户要求；合计口径不变）。
    sales = _merge_sales_rows(entry["sales"])
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
           fill=SECTION_FILL, align=_center(), border=THIN)
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

    # 合计行：数值由数量/金额列统计；汇总区（合计/售后/货款/费用/应付各行）标签与数值
    # 右对齐（用户要求，2026-09-29 起；数据行、表头与基本信息行仍居中）。
    total_row = sr + len(sales)
    _merge(ws, total_row, 1, total_row, 6, "总件数",
           font=_body_font(bold=True, sz=10), fill=TOTAL_FILL, align=_right(), border=TOTAL_BORDER)
    _cell(ws, total_row, 7, _fmt_int(total_qty), font=_body_font(bold=True, sz=10, color=INK),
          fill=TOTAL_FILL, align=_right(), border=TOTAL_BORDER)
    _cell(ws, total_row, 8, "销售金额", font=_body_font(bold=True, sz=10),
          fill=TOTAL_FILL, align=_right(), border=TOTAL_BORDER)
    _cell(ws, total_row, 9, _fmt(sales_amt), font=_body_font(bold=True, sz=10, color=INK),
          fill=TOTAL_FILL, align=_right(), border=TOTAL_BORDER)
    ws.row_dimensions[total_row].height = 26

    # ════════════════ 售后（与销售明细同宽，对齐到 I 列） ════════════════
    r = total_row + 2
    _apply_gradient_line(ws, r)
    r += 1

    _merge(ws, r, 1, r, 9, "▼ 售  后", font=Font(name="微软雅黑", bold=True, size=11, color=INK),
           fill=SECTION_FILL, align=_center(), border=THIN)
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
        _merge(ws, row, 2, row, 3, a["content"], font=_body_font(), align=_center(), fill=fill, border=THIN)
        _merge(ws, row, 4, row, 6, a["summary"], font=_body_font(), align=_center(), fill=fill, border=THIN)
        _merge(ws, row, 7, row, 9, _fmt(a["amount"]), font=_body_font(bold=True), align=_center(), fill=fill, border=THIN)
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
           fill=SECTION_FILL, align=_center(), border=THIN)
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
        _merge(ws, row, 1, row, 6, f["name"], font=_body_font(), align=_center(), fill=fill, border=THIN)
        _merge(ws, row, 7, row, 9, _fmt(f["amount"]), font=_body_font(bold=True), align=_center(), fill=fill, border=THIN)
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
           fill=GRAND_FILL, align=_right(), border=GRAND_BORDER)
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

    # 水印居中叠在全部内容之上（列宽已在手，行高按已设值 + 默认 15pt 估算）。
    _add_xlsx_watermark(ws, widths)

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


# ──────────────────────────────────────────────
# PDF 导出（PIL 渲染图片 → PDF，无需 LibreOffice / 外部命令）
# ──────────────────────────────────────────────

# 1pt = 2px（144dpi）；A4 横向 842×595pt。PIL 存 PDF 时按 resolution 把像素折算成页面尺寸。
PDF_SCALE = 2
PDF_DPI = 72 * PDF_SCALE
PDF_PAGE_W, PDF_PAGE_H = 842 * PDF_SCALE, 595 * PDF_SCALE
PDF_MARGIN_X, PDF_MARGIN_TOP, PDF_MARGIN_BOTTOM = 50, 64, 56
PDF_TABLE_W = PDF_PAGE_W - PDF_MARGIN_X * 2

PDF_INK = (26, 60, 52)             # #1A3C34
PDF_HEADER = (43, 94, 74)          # #2B5E4A
PDF_WHITE = (255, 255, 255)
PDF_SECTION = (238, 244, 241)      # #EEF4F1
PDF_TOTAL = (240, 245, 243)        # #F0F5F3
PDF_GRAND = (225, 237, 231)        # #E1EDE7
PDF_EVEN = (248, 250, 249)         # #F8FAF9
PDF_LINE = (221, 229, 225)         # #DDE5E1
PDF_DIVIDER_END = (176, 204, 192)  # #B0CCC0

# 部署机字体位置（yum 装的 google-noto-cjk-fonts 在第一个目录）。
_FONT_DIRS = (
    "/usr/share/fonts/google-noto-cjk",
    "/usr/share/fonts/opentype/noto",
    "/usr/share/fonts/noto-cjk",
)


def _pdf_font(bold: bool, size_pt: float) -> ImageFont.FreeTypeFont:
    """Noto Sans CJK（ttc 内 index=2 为简体）；缺字体时给出可操作的报错。"""
    name = "NotoSansCJK-Bold.ttc" if bold else "NotoSansCJK-Regular.ttc"
    for directory in _FONT_DIRS:
        path = os.path.join(directory, name)
        if os.path.exists(path):
            return ImageFont.truetype(path, round(size_pt * PDF_SCALE), index=2)
    raise RuntimeError("服务器缺少中文字体（Noto Sans CJK），无法生成 PDF；请安装 google-noto-cjk-fonts")


# ── 水印：xlsx 与 PDF 共用「顺立达SLD」斜向半透明文字 ──
WATERMARK_TEXT = "顺立达SLD"
WATERMARK_COLOR = (96, 122, 110)  # 与主题绿同族的浅灰绿
WATERMARK_ALPHA = 48
WATERMARK_ANGLE = 28  # 逆时针旋转角度（PIL rotate 即逆时针）：文字自左下向右上倾斜


def _watermark_units() -> float:
    """水印文字宽度估算单位：CJK 全宽、ASCII 约 1.15 倍（Noto Bold 数字/字母略宽）。"""
    return sum(2 if ord(ch) > 0x2E80 else 1.15 for ch in WATERMARK_TEXT)


def _watermark_stamp(font_px: int) -> Image.Image:
    """生成旋转后的水印字图（RGBA、低透明度、按内容裁边），供 PDF 合成与 xlsx 嵌入共用。"""
    font = _pdf_font(True, font_px / PDF_SCALE)
    probe = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    bbox = probe.textbbox((0, 0), WATERMARK_TEXT, font=font)
    text_w, text_h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    canvas = Image.new("RGBA", (int(text_w * 1.7) + 4, int(text_h * 2.2) + 4), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    draw.text(
        ((canvas.width - text_w) / 2 - bbox[0], (canvas.height - text_h) / 2 - bbox[1]),
        WATERMARK_TEXT, font=font, fill=(*WATERMARK_COLOR, WATERMARK_ALPHA),
    )
    rotated = canvas.rotate(WATERMARK_ANGLE, resample=Image.BICUBIC)
    return rotated.crop(rotated.getbbox())


def _with_pdf_watermark(page: Image.Image) -> Image.Image:
    """页面中央合成一张约 42% 页宽的水印（不遮挡阅读，多页每页都有）。

    `_watermark_units` 以「半角宽」为单位（1 单位 = 字号一半），目标宽换算字号要乘 2。
    """
    stamp = _watermark_stamp(max(48, round(page.width * 0.42 * 2 / _watermark_units())))
    layer = Image.new("RGBA", page.size, (0, 0, 0, 0))
    layer.paste(stamp, ((page.width - stamp.width) // 2, (page.height - stamp.height) // 2), stamp)
    return Image.alpha_composite(page.convert("RGBA"), layer).convert("RGB")


def _pdf_wrap(draw: ImageDraw.ImageDraw, text: Any, font: ImageFont.FreeTypeFont, max_w: float) -> list[str]:
    """按像素宽换行：CJK 逐字断行，连续 ASCII（数字、日期、金额）视作一个词不拆开。"""
    text = "" if text is None else str(text)
    if not text or draw.textlength(text, font=font) <= max_w:
        return [text]
    tokens: list[str] = []
    buf = ""
    for ch in text:
        if ord(ch) > 0x2E80 or ch == " ":
            if buf:
                tokens.append(buf)
                buf = ""
            if ch != " ":
                tokens.append(ch)
        else:
            buf += ch
    if buf:
        tokens.append(buf)
    lines: list[str] = []
    line = ""
    for token in tokens:
        candidate = f"{line}{token}"
        if line and draw.textlength(candidate, font=font) > max_w:
            lines.append(line)
            line = token
        else:
            line = candidate
    if line:
        lines.append(line)
    return lines


class _PdfCanvas:
    """A4 横向分页画布：内容越界自动换页，换页时按需重画表头。"""

    def __init__(self) -> None:
        self.pages: list[Image.Image] = []
        self._new_page()

    def _new_page(self) -> None:
        self.image = Image.new("RGB", (PDF_PAGE_W, PDF_PAGE_H), "white")
        self.draw = ImageDraw.Draw(self.image)
        self.pages.append(self.image)
        self.y = PDF_MARGIN_TOP

    def ensure(self, height: float, repeat=None) -> None:
        """剩余高度不足时换页；``repeat`` 在新页顶部重画（如表头）。"""
        if self.y + height > PDF_PAGE_H - PDF_MARGIN_BOTTOM:
            self._new_page()
            if repeat is not None:
                repeat()

    def finish(self) -> bytes:
        output = BytesIO()
        pages = [_with_pdf_watermark(page) for page in self.pages]
        pages[0].save(
            output,
            format="PDF",
            save_all=True,
            append_images=pages[1:],
            resolution=PDF_DPI,
            quality=95,
        )
        return output.getvalue()


def _pdf_row(canvas: _PdfCanvas, xs: list[float], height: float, cells: list[tuple], top: str | None = None) -> None:
    """画一行表格格。cell = (起始列, 结束列, 文本, 对齐, 字体, 填充, 字色)。

    ``top``："thick" 画合计行粗顶线、"double" 画应付行双顶线，颜色同表头深绿。
    """
    y0, y1 = canvas.y, canvas.y + height
    for c1, c2, text, align, font, fill, color in cells:
        x0, x1 = xs[c1 - 1], xs[c2]
        if fill:
            canvas.draw.rectangle((x0, y0, x1 - 1, y1 - 1), fill=fill)
        anchor = {"left": "lm", "center": "mm", "right": "rm"}[align]
        tx = {"left": x0 + 8, "center": (x0 + x1) / 2, "right": x1 - 8}[align]
        lines = _pdf_wrap(canvas.draw, text, font, x1 - x0 - 16)
        line_h = font.size + 6
        ty = y0 + (height - line_h * len(lines)) / 2 + line_h / 2
        for ln in lines:
            canvas.draw.text((tx, ty), ln, font=font, fill=color or PDF_INK, anchor=anchor)
            ty += line_h
    for c1, c2, *_rest in cells:
        x0, x1 = xs[c1 - 1], xs[c2]
        canvas.draw.rectangle((x0, y0, x1 - 1, y1 - 1), outline=PDF_LINE, width=1)
    if top == "thick":
        canvas.draw.line((xs[0], y0, xs[-1] - 1, y0), fill=PDF_HEADER, width=3)
    elif top == "double":
        canvas.draw.line((xs[0], y0, xs[-1] - 1, y0), fill=PDF_HEADER, width=2)
        canvas.draw.line((xs[0], y0 + 4, xs[-1] - 1, y0 + 4), fill=PDF_HEADER, width=2)
    canvas.y = y1


def _pdf_row_height(canvas: _PdfCanvas, xs: list[float], cells: list[tuple], base: float = 36) -> float:
    """按换行后的最多行数撑高行，保证长备注 / 摘要不被裁掉。"""
    max_lines = 1
    for c1, c2, text, _align, font, _fill, _color in cells:
        max_lines = max(max_lines, len(_pdf_wrap(canvas.draw, text, font, xs[c2] - xs[c1 - 1] - 16)))
    return max(base, max_lines * (cells[0][4].size + 6) + 10)


def render_entry_pdf(entry: dict) -> bytes:
    """结算单画成图片后输出 A4 横向 PDF：版式与 xlsx 财务样式同款，内容多时自动分页。"""
    # 与 xlsx 相同的行合并口径，保证两份导出内容一致。
    sales = _merge_sales_rows(entry["sales"])
    after_sales = entry["after_sales"]
    fees = entry["fees"]
    fixed_rows = _fixed_fee_rows(fees)

    total_qty = sum(s["sales_quantity"] for s in sales)
    sales_amt = sum(s["sales_quantity"] * s["unit_price"] for s in sales)
    after_amt = sum(a["amount"] for a in after_sales)
    goods_amt = sales_amt - after_amt
    fee_amt = sum(f["amount"] for f in fees)
    payable = goods_amt - fee_amt

    f_title = _pdf_font(True, 20)
    f_section = _pdf_font(True, 11)
    f_hdr = _pdf_font(True, 10)
    f_info = _pdf_font(True, 10)
    f_body = _pdf_font(False, 10)
    f_bold = _pdf_font(True, 10)
    f_grand = _pdf_font(True, 16)

    canvas = _PdfCanvas()

    # 列宽：与 xlsx _auto_fit_columns 同思路（中文表头按两行折半估宽、备注列封顶 4 汉字宽），
    # 再按权重撑满表宽（对应 xlsx 的 fitToWidth=1）。
    headers = ["销售日期", "品种", "等级", "规格(头数)", "规格(KG)", "备注", "数量(件)", "单价(元)", "金额(元)"]
    needs = [(_text_units(h) + 1) // 2 + 3 for h in headers]
    for s in sales:
        values = [
            _fmt(s["sale_date"]), s["variety"] or "", s.get("grade") or "",
            s["head_count"] or "", s["spec_kg"] or "", s["remark"] or "",
            _fmt_int(s["sales_quantity"]), _fmt(s["unit_price"]),
            _fmt(s["sales_quantity"] * s["unit_price"]),
        ]
        for ci, value in enumerate(values):
            units = _text_units(value) + 3
            if ci == 5:
                units = min(units, 8.5)  # 备注列封顶，超宽靠换行
            needs[ci] = max(needs[ci], units)
    needs[6] = max(needs[6], _text_units(_fmt_int(total_qty)) + 3)
    needs[8] = max(needs[8], _text_units(_fmt(sales_amt)) + 3)
    weights = [min(n, 30.0) for n in needs]
    cols = [PDF_TABLE_W * w / sum(weights) for w in weights]
    xs = [PDF_MARGIN_X]
    for w in cols:
        xs.append(xs[-1] + w)

    def hdr_cell(c1: int, c2: int, text: str) -> tuple:
        return (c1, c2, text, "center", f_hdr, PDF_HEADER, PDF_WHITE)

    def body_cell(c1: int, c2: int, text: Any, align: str = "center", font=None, fill=None, bold=False) -> tuple:
        return (c1, c2, "" if text is None else str(text), align, font or (f_bold if bold else f_body), fill, PDF_INK)

    def divider() -> None:
        canvas.ensure(14)
        y0 = canvas.y
        for x in range(PDF_MARGIN_X, PDF_MARGIN_X + PDF_TABLE_W):
            t = (x - PDF_MARGIN_X) / PDF_TABLE_W
            color = tuple(round(a + (b - a) * t) for a, b in zip(PDF_HEADER, PDF_DIVIDER_END))
            canvas.draw.line((x, y0, x, y0 + 5), fill=color)
        canvas.y += 14

    def section(text: str) -> None:
        canvas.ensure(44)
        _pdf_row(canvas, xs, 44, [body_cell(1, 9, text, "center", f_section, PDF_SECTION)])

    # ── 标题（仅首页） ──
    canvas.ensure(92)
    canvas.draw.text(((xs[0] + xs[-1]) / 2, canvas.y + 46), "结  算  单", font=f_title, fill=PDF_INK, anchor="mm")
    canvas.y += 92

    # ── 基本信息：两行 × 每行 4 个字段，跨列分配与 xlsx _info_spans 同算法 ──
    info_rows = [
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
    for fields in info_rows:
        texts = [f"{label}：{val if val not in (None, '') else '—'}" for label, val in fields]
        needs_px = [_text_units(t) * 9.5 + 20 for t in texts]
        cells = [
            body_cell(c1, c2, text, "center", f_info, PDF_SECTION)
            for text, (c1, c2) in zip(texts, _info_spans(cols, needs_px))
        ]
        canvas.ensure(46)
        _pdf_row(canvas, xs, 46, cells)

    # ════════════════ 销售明细 ════════════════
    divider()
    section("▼ 销售明细")

    def draw_sales_header() -> None:
        _pdf_row(canvas, xs, 56, [hdr_cell(ci, ci, h) for ci, h in enumerate(headers, 1)])

    draw_sales_header()
    for i, s in enumerate(sales):
        fill = PDF_EVEN if i % 2 else None
        cells = [
            body_cell(1, 1, _fmt(s["sale_date"]), fill=fill),
            body_cell(2, 2, s["variety"] or "", fill=fill),
            body_cell(3, 3, s.get("grade") or "", fill=fill),
            body_cell(4, 4, s["head_count"] or "", fill=fill),
            body_cell(5, 5, s["spec_kg"] or "", fill=fill),
            body_cell(6, 6, s["remark"] or "", fill=fill),
            body_cell(7, 7, _fmt_int(s["sales_quantity"]), fill=fill),
            body_cell(8, 8, _fmt(s["unit_price"]), fill=fill),
            body_cell(9, 9, _fmt(s["sales_quantity"] * s["unit_price"]), bold=True, fill=fill),
        ]
        height = _pdf_row_height(canvas, xs, cells)
        canvas.ensure(height, repeat=draw_sales_header)
        _pdf_row(canvas, xs, height, cells)

    canvas.ensure(52)
    # 汇总区各行右对齐（用户要求，2026-09-29 起；数据行、表头仍居中）。
    _pdf_row(canvas, xs, 52, [
        body_cell(1, 6, "总件数", "right", f_bold, PDF_TOTAL),
        body_cell(7, 7, _fmt_int(total_qty), "right", f_bold, PDF_TOTAL),
        body_cell(8, 8, "销售金额", "right", f_bold, PDF_TOTAL),
        body_cell(9, 9, _fmt(sales_amt), "right", f_bold, PDF_TOTAL),
    ], top="thick")

    # ════════════════ 售后 ════════════════
    divider()
    section("▼ 售  后")
    canvas.ensure(40)
    _pdf_row(canvas, xs, 40, [
        hdr_cell(1, 1, "序号"), hdr_cell(2, 3, "内容"), hdr_cell(4, 6, "摘要"), hdr_cell(7, 9, "金额(元)"),
    ])
    for i, a in enumerate(after_sales):
        fill = PDF_EVEN if i % 2 else None
        cells = [
            body_cell(1, 1, i + 1, fill=fill),
            body_cell(2, 3, a["content"], "center", fill=fill),
            body_cell(4, 6, a["summary"], "center", fill=fill),
            body_cell(7, 9, _fmt(a["amount"]), "center", bold=True, fill=fill),
        ]
        height = _pdf_row_height(canvas, xs, cells)
        canvas.ensure(height)
        _pdf_row(canvas, xs, height, cells)
    canvas.ensure(40)
    _pdf_row(canvas, xs, 40, [
        body_cell(1, 6, "售后合计：", "right", f_bold, PDF_TOTAL),
        body_cell(7, 9, _fmt(after_amt), "right", f_bold, PDF_TOTAL),
    ], top="thick")
    canvas.ensure(40)
    _pdf_row(canvas, xs, 40, [
        body_cell(1, 5, "扣减售后", "right"),
        body_cell(6, 7, "货款合计：", "right", f_bold),
        body_cell(8, 9, _fmt(goods_amt), "right", f_bold),
    ])

    # ════════════════ 支出费用 ════════════════
    divider()
    section("▼ 支出费用")
    canvas.ensure(40)
    _pdf_row(canvas, xs, 40, [hdr_cell(1, 6, "费用项目"), hdr_cell(7, 9, "金额(元)")])
    for i, f in enumerate(fixed_rows):
        fill = PDF_EVEN if i % 2 else None
        cells = [
            body_cell(1, 6, f["name"], "center", fill=fill),
            body_cell(7, 9, _fmt(f["amount"]), "center", bold=True, fill=fill),
        ]
        height = _pdf_row_height(canvas, xs, cells)
        canvas.ensure(height)
        _pdf_row(canvas, xs, height, cells)
    canvas.ensure(40)
    _pdf_row(canvas, xs, 40, [
        body_cell(1, 6, "费用合计", "right", f_bold, PDF_TOTAL),
        body_cell(7, 9, _fmt(fee_amt), "right", f_bold, PDF_TOTAL),
    ], top="thick")

    # ════════════════ 应付总额 ════════════════
    divider()
    canvas.ensure(64)
    _pdf_row(canvas, xs, 64, [
        body_cell(1, 6, "应付贵方总金额（RMB）", "right", f_section, PDF_GRAND),
        body_cell(7, 9, _fmt(payable), "right", f_grand, PDF_GRAND),
    ], top="double")

    return canvas.finish()




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
    """结算单 PDF：PIL 按 xlsx 同款财务版式渲染图片后输出，A4 横向自动分页。"""
    entry = load_entry(db, merchant_no)
    return render_entry_pdf(entry)


__all__ = [
    "build_entry_workbook", "build_settlement_template_workbook",
    "build_settlement_template_pdf", "read_imported_entry",
    "render_entry_workbook", "render_entry_pdf",
    "render_entry_html", "load_entry",
]
