# 商号维度重构与数据明细页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 以「商号」作为结算单唯一业务键，替换柜号维度，并新增「数据明细」页展示每张结算单的汇总指标与全部明细。

**Architecture:** `import_batch` 承担结算单职责并持有 `merchant_no` 唯一键与单号/柜号/转运车号属性；`sale_record` 只保留 `import_batch_id` 关联，柜号不再下沉到明细层；分析、导出、前端全部以商号查询。设计依据 `docs/superpowers/specs/2026-09-10-merchant-number-dimension-design.md`。

**Tech Stack:** FastAPI、SQLAlchemy 2.0、PyMySQL、pandas/openpyxl、pytest、Vue 3、TypeScript、Vite、Node test runner。

**提交策略：** 本仓库当前由并发会话统一提交；除非用户明确要求，执行者只运行验证、不执行 `git commit`。原「单号唯一键」计划 `docs/superpowers/plans/2026-09-10-settlement-number-identity.md` 已被本计划取代，其未完成的步骤不再执行。

---

## 文件职责

后端

- `backend/app/parser/settlement_parser.py`：解析结算单元数据（商号/单号/柜号/转运车号）与销售明细。
- `backend/app/parser/settlement_summary.py`：提取结算金额摘要（不再依赖柜号）。
- `backend/app/models.py`：`ImportBatch` 唯一键改商号；`SaleRecord` 移除柜号；`ContainerSummary` 改名 `SettlementSummary`。
- `backend/app/services/import_service.py`：按商号冲突检测与事务覆盖。
- `backend/app/services/settlement_list_service.py`（新增）：数据明细列表与默认时间范围。
- `backend/app/services/analytics_core.py`（新增）：通用筛选与指标计算。
- `backend/app/services/settlement_analytics_service.py`（新增）：商号对比、详情、异常。
- `backend/app/services/settlement_detail_service.py`（由 `container_detail_service.py` 改名）：单张结算单摘要与来源明细。
- `backend/app/services/analytics_service.py`：兼容重导出，保持既有 import 路径可用。
- `backend/app/api/analytics.py`：`merchant_no` 筛选与 `/settlement-comparison`、`/settlements/{merchant_no}`。
- `backend/app/api/settlements.py`（新增）：`GET /api/settlements`、`GET /api/settlements/{merchant_no}/records`。
- `backend/app/api/imports.py`：`overwrite` 参数与旧文件清理。
- `backend/app/api/exports.py`：按商号导出结算单 xlsx。
- `backend/app/schemas.py`：结算单列表与明细 DTO。
- `backend/app/main.py`：注册 settlements 路由。
- `backend/scripts/backfill_settlement_identity.py`（新增）：表结构迁移 + 按原始文件回填 + 快照。

前端

- `frontend/src/api/types.ts`、`normalize.ts`、`client.ts`：商号契约与数据明细接口。
- `frontend/src/views/SettlementListView.vue`（新增）：数据明细页。
- `frontend/src/components/SettlementRecordsDialog.vue`（新增）：查看明细弹窗。
- `frontend/src/views/SettlementComparisonView.vue`（由 `ContainerComparisonView.vue` 改名）。
- `frontend/src/views/SettlementView.vue`（由 `ContainerView.vue` 改名）。
- `frontend/src/components/SettlementComparison.vue`（由 `ContainerComparison.vue` 改名）、`ComparisonPanel.vue`。
- `frontend/src/utils/settlementComparison.ts`（由 `containerComparison.ts` 改名）。
- `frontend/src/main.ts`、`frontend/src/AppShell.vue`：四项导航与路由。
- `frontend/src/views/ImportView.vue`：覆盖确认交互。

文档

- `README.md`、`docs/ARCHITECTURE.md`、`docs/DECISIONS.md`（ADR-008 改为 Accepted：商号唯一键）、`docs/TODO.md`、`docs/HANDOFF.md`。

---

### Task 1: 解析结算单元数据

**Files:**
- Modify: `backend/app/parser/settlement_parser.py`
- Modify: `backend/app/parser/settlement_summary.py`
- Modify: `backend/app/parser/__init__.py`
- Test: `backend/tests/test_parser.py`

- [x] **Step 1: 写失败测试（Excel 元数据 + 柜号缺失 + 商号缺失）**

在 `backend/tests/test_parser.py` 新增：

```python
import openpyxl


def write_settlement_xlsx(path, *, merchant_no="单624", container_no="MWCU1823691",
                          order_no="宝贝01", vehicle_no="桂AAB087"):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws["B2"] = "结 算 单"
    if merchant_no is not None:
        ws["B5"], ws["C5"] = "商号：", merchant_no
    if container_no is not None:
        ws["B6"], ws["C6"] = "柜号：", container_no
    if order_no is not None:
        ws["B7"], ws["C7"] = "单号：", order_no
    if vehicle_no is not None:
        ws["B8"], ws["C8"] = "转运公司：", vehicle_no
    ws["B10"], ws["C10"], ws["D10"], ws["E10"], ws["F10"] = (
        "销售日期", "品种(规格)", "数量", "单价", "金额",
    )
    ws["B11"], ws["C11"], ws["D11"], ws["E11"], ws["F11"] = (
        "2026-08-27", "B6", 3, 450, 1350,
    )
    wb.save(path)
    return path


def test_parse_settlement_reads_metadata(tmp_path):
    parsed = parse_settlement(write_settlement_xlsx(tmp_path / "one.xlsx"))

    assert parsed.meta.merchant_no == "单624"
    assert parsed.meta.order_no == "宝贝01"
    assert parsed.meta.container_no == "MWCU1823691"
    assert parsed.meta.vehicle_no == "桂AAB087"
    assert len(parsed.records) == 1
    assert parsed.records[0]["amount"] == Decimal("1350.0000")


def test_parse_settlement_allows_missing_container(tmp_path):
    parsed = parse_settlement(write_settlement_xlsx(tmp_path / "no-container.xlsx", container_no=None))

    assert parsed.meta.container_no is None
    assert len(parsed.records) == 1


def test_parse_settlement_requires_merchant_no(tmp_path):
    with pytest.raises(SettlementParseError, match="缺少商号"):
        parse_settlement(write_settlement_xlsx(tmp_path / "no-merchant.xlsx", merchant_no=None))


def test_parse_settlement_reads_csv_merchant_column(tmp_path):
    path = tmp_path / "sales.csv"
    path.write_text(
        "商号,单号,柜号,转运公司,销售日期,品种(规格),数量,单价,金额\n"
        "单624,宝贝01,MWCU1823691,桂AAB087,2026-08-27,B6,3,450,1350\n",
        encoding="utf-8-sig",
    )
    parsed = parse_settlement(path)

    assert parsed.meta.merchant_no == "单624"
    assert parsed.meta.container_no == "MWCU1823691"
```

导入行同步改为：`from app.parser.settlement_parser import (SettlementParseError, normalize_grade, parse_settlement, read_settlement)`。

- [x] **Step 2: 验证 RED**

Run: `.venv/bin/python -m pytest backend/tests/test_parser.py -q --basetemp=backend/.pytest-tmp`

Expected: FAIL，`parse_settlement`、`SettlementParseError` 不存在。

- [x] **Step 3: 实现结算单元数据解析**

在 `backend/app/parser/settlement_parser.py` 增加：

```python
class SettlementParseError(ValueError):
    """结算单文件级错误，例如缺少商号。"""


@dataclass(frozen=True)
class SettlementMeta:
    merchant_no: str
    order_no: str | None = None
    container_no: str | None = None
    vehicle_no: str | None = None


@dataclass
class ParsedSettlement:
    meta: SettlementMeta
    records: list[dict[str, Any]]
    issues: list[ImportIssue]
    summary: dict[str, Any] | None = None


def parse_settlement(file_path: str | Path, source_type: str | None = None) -> ParsedSettlement:
    """解析结算单文件；缺少商号时抛出 SettlementParseError。"""
```

实现要点：

- `COLUMN_ALIASES` 增加 `merchant_no: ("merchant_no", "商号")`、`order_no: ("order_no", "单号", "客户单号", "结算单号")`、`vehicle_no: ("vehicle_no", "转运车号", "车牌号", "转运公司")`。
- Excel 路径继续用 `_find_metadata_value(raw.iloc[:header_index], name)` 读取元数据；为空时回退到数据列。
- CSV 路径从列取值：每个字段取非空去重值，多于一个不同值时报 `SettlementParseError("同一文件存在多个商号: ...")`（其余三个字段只取第一个非空值）。
- `merchant_no` 为空 → `raise SettlementParseError("缺少商号，无法确定结算单身份")`（错误文案需包含「缺少商号」）。
- `_validate_row` 不再校验 `container_id`；`_record` 不再输出 `container_id`。
- 保留 `read_settlement` 与 `read_settlement_with_summary` 旧签名，内部调用 `parse_settlement`。
- `settlement_summary.extract_container_summary` 改名 `extract_settlement_summary`，去掉 `container_id` 入参与判断。

- [x] **Step 4: 验证 GREEN**

Run: `.venv/bin/python -m pytest backend/tests/test_parser.py -q --basetemp=backend/.pytest-tmp`

Expected: PASS（含原有等级与数值校验用例）。

### Task 2: 模型改造

**Files:**
- Modify: `backend/app/models.py`
- Test: `backend/tests/test_models.py`

- [x] **Step 1: 写失败测试**

```python
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
```

同步把 `test_models.py` 里 `ImportBatch(file_name="one.xlsx")` 补上 `merchant_no="单624"`。

- [x] **Step 2: 验证 RED**

Run: `.venv/bin/python -m pytest backend/tests/test_models.py -q --basetemp=backend/.pytest-tmp`

Expected: FAIL，`merchant_no` 字段与 `SettlementSummary` 不存在。

- [x] **Step 3: 实现模型**

```python
class ImportBatch(Base):
    __tablename__ = "import_batch"
    __table_args__ = (Index("ux_import_batch_merchant_no", "merchant_no", unique=True),)

    merchant_no: Mapped[str] = mapped_column(String(128), nullable=False)
    order_no: Mapped[str | None] = mapped_column(String(128), nullable=True)
    container_no: Mapped[str | None] = mapped_column(String(128), nullable=True)
    vehicle_no: Mapped[str | None] = mapped_column(String(128), nullable=True)
```

- `SaleRecord` 删除 `container_id`、`container_name` 两列与 `ix_sale_record_container_id` 索引。
- `ContainerSummary` 改名 `SettlementSummary`，`__tablename__ = "settlement_summary"`，删除 `container_id`/`container_name`，增加 `import_batch_id` 唯一索引 `ux_settlement_summary_batch`。
- 更新 `__all__`：加入 `SettlementSummary`，移除 `ContainerSummary`。
- `models.py` 需保持 ≤300 行；若超限，把 `StandardGrade`/`Grade` 与 `utc_now` 保留原位、仅做字段级调整。

- [x] **Step 4: 验证 GREEN**

Run: `.venv/bin/python -m pytest backend/tests/test_models.py -q --basetemp=backend/.pytest-tmp`

Expected: PASS。

### Task 3: 按商号导入与覆盖

**Files:**
- Modify: `backend/app/services/import_service.py`
- Modify: `backend/app/api/imports.py`
- Test: `backend/tests/test_import_service.py`
- Test: `backend/tests/test_imports_api.py`

- [x] **Step 1: 写失败测试**

在 `backend/tests/test_import_service.py` 中把所有 CSV fixture 表头补上 `商号` 列
（例如 `商号,container_no,sale_date,grade,quantity,unit_price,amount` / `单624,C000,...`），并新增：

```python
def test_same_merchant_no_returns_conflict_without_changes(tmp_path):
    first = import_file(db, write_csv(tmp_path, "商号,销售日期,等级,数量,单价,金额\n单624,2026-08-01,A,1,2,2\n"))
    changed = write_csv(tmp_path, "商号,销售日期,等级,数量,单价,金额\n单624,2026-08-02,A,5,2,10\n")

    result = import_file(db, changed, overwrite=False)

    assert result.status == "conflict"
    assert result.merchant_no == "单624"
    assert db.query(SaleRecord).count() == first.success_count


def test_overwrite_replaces_previous_batch(tmp_path):
    import_file(db, write_csv(tmp_path, "商号,销售日期,等级,数量,单价,金额\n单624,2026-08-01,A,1,2,2\n"))
    result = import_file(
        db,
        write_csv(tmp_path, "商号,销售日期,等级,数量,单价,金额\n单624,2026-08-02,A,5,2,10\n"),
        overwrite=True,
    )

    assert result.status == "success"
    assert db.query(ImportBatch).filter_by(merchant_no="单624").count() == 1
    assert [row.quantity for row in db.query(SaleRecord).all()] == [Decimal("5.0000")]
```

在 `backend/tests/test_imports_api.py` 新增 `POST /api/imports?overwrite=true` 的
冲突返回与覆盖成功用例（沿用该文件既有的 `ImportBatch(...)` 构造，补 `merchant_no`）。

- [x] **Step 2: 验证 RED**

Run: `.venv/bin/python -m pytest backend/tests/test_import_service.py backend/tests/test_imports_api.py -q --basetemp=backend/.pytest-tmp`

Expected: FAIL，`conflict` 状态与 `overwrite` 参数不存在。

- [x] **Step 3: 实现导入服务**

```python
@dataclass
class ImportResult:
    status: str
    batch_id: int | None = None
    merchant_no: str | None = None
    order_no: str | None = None
    container_no: str | None = None
    vehicle_no: str | None = None
    file_name: str | None = None
    existing_batch_id: int | None = None
    obsolete_storage_path: str | None = None
    ...


def import_file(db: Session, path: Path, overwrite: bool = False) -> ImportResult:
```

实现要点：

- `parse_settlement` 结果写入 `ImportBatch(merchant_no=..., order_no=..., container_no=..., vehicle_no=...)`。
- `SettlementParseError` 转为 `status="failed"` 且 `error_summary` 使用异常文案。
- 已存在同 `merchant_no` 且 `overwrite=False` → 返回 `status="conflict"`、`existing_batch_id`，不写库。
- `overwrite=True` → 先记录 `obsolete_storage_path`，在同一次事务内删除旧批次
  （`sale_records`/`container_summaries`/`data_issues`/`source_files` 均 cascade），再写入新批次并一次 commit；
  `except Exception: db.rollback(); raise`。
- `SettlementSummary` 写入改为 `import_batch_id` 唯一，不再写柜号。
- `SourceFile.file_hash` 唯一约束保留：覆盖同一个文件时旧行已在同一事务删除，不会冲突。

- [x] **Step 4: 实现 API 覆盖参数**

`POST /api/imports?overwrite=true`：把参数透传给每个文件；`conflict` 时删除本次新上传但未引用的文件；
覆盖成功后删除 `obsolete_storage_path` 指向且已无引用的旧文件。

- [x] **Step 5: 验证 GREEN**

Run: `.venv/bin/python -m pytest backend/tests/test_import_service.py backend/tests/test_imports_api.py -q --basetemp=backend/.pytest-tmp`

Expected: PASS。

### Task 4: 分析与对比切换到商号维度

**Files:**
- Create: `backend/app/services/analytics_core.py`
- Create: `backend/app/services/settlement_analytics_service.py`
- Create: `backend/app/services/settlement_detail_service.py`（由 `container_detail_service.py` 改名）
- Modify: `backend/app/services/analytics_service.py`（改为兼容重导出）
- Modify: `backend/app/api/analytics.py`
- Test: `backend/tests/test_analytics.py`、`backend/tests/test_analytics_api.py`
- Rename: `backend/tests/test_container_comparison_api.py` → `backend/tests/test_settlement_comparison_api.py`

- [x] **Step 1: 写失败测试（同柜号不同商号的回归）**

```python
def test_same_container_batches_are_compared_by_merchant_no(db):
    first = ImportBatch(file_name="a.xlsx", merchant_no="单637", container_no="CBHU2970762")
    second = ImportBatch(file_name="b.xlsx", merchant_no="640", container_no="CBHU2970762")
    db.add_all([first, second])
    db.flush()
    db.add_all([
        SaleRecord(import_batch_id=first.id, sale_date=date(2026, 9, 6), grade=StandardGrade.A,
                   quantity=Decimal("10"), unit_price=Decimal("500"), amount=Decimal("5000")),
        SaleRecord(import_batch_id=second.id, sale_date=date(2026, 9, 9), grade=StandardGrade.B,
                   quantity=Decimal("20"), unit_price=Decimal("400"), amount=Decimal("8000")),
    ])
    db.commit()

    comparison = get_settlement_comparison(db, include_all_settlements=True)

    assert {item["merchant_no"] for item in comparison} == {"单637", "640"}
    detail = get_settlement_detail(db, "640")
    assert detail["total"]["sales_quantity"] == 20.0
    assert detail["container_no"] == "CBHU2970762"
```

- [x] **Step 2: 验证 RED**

Run: `.venv/bin/python -m pytest backend/tests/test_analytics.py backend/tests/test_analytics_api.py backend/tests/test_settlement_comparison_api.py -q --basetemp=backend/.pytest-tmp`

Expected: FAIL，函数与路径仍按柜号。

- [x] **Step 3: 拆分服务模块**

- `analytics_core.py`：`_records`（筛选 `start_date`/`end_date`/`merchant_no`，通过
  `SaleRecord.import_batch_id == ImportBatch.id` 关联）、`_rounded`、`_metrics`、`_grade_metrics`、
  `_raw_metrics`、`_rank_values`、`_share`、`_grade_contribution`、`_grade_shares`、`_raw_average`、`GRADES`。
- `settlement_analytics_service.py`：`get_grade_summary`、`get_overview`、`get_daily_trend`、
  `get_settlement_comparison`、`get_settlement_detail`、`get_operating_anomalies`、`get_issue_counts`、
  `AnomalyThresholds`、`DEFAULT_THRESHOLDS`。
- `analytics_service.py`：仅 `from .settlement_analytics_service import *` 形式的重导出（≤40 行），
  保证 `backend/app/api/exports.py` 等既有 import 不断。
- `settlement_detail_service.py`：`get_settlement_context(db, merchant_no, records)`，
  `_record_payload` 去掉柜号字段，`_settlement` 改为按 `import_batch_id` 查 `SettlementSummary`。
- 拆分后所有文件 ≤300 行（`analytics_service.py` 原 382 行）。

对比项 payload：

```json
{
  "merchant_no": "640",
  "order_no": "宝贝L004",
  "container_no": "CBHU2970762",
  "vehicle_no": "桂ABF330",
  "total": {"sales_quantity": 20.0, "sales_amount": 8000.0, "weighted_avg_price": 400.0},
  "grades": [],
  "start_date": "2026-09-09",
  "end_date": "2026-09-09"
}
```

- [x] **Step 4: 调整 API contract**

- `GET /api/analytics/settlement-comparison`（查询参数 `include_all_settlements`）。
- `GET /api/analytics/settlements/{merchant_no}`，未知商号返回 404「结算单不存在」。
- `_filters` 的 `container_id` 参数改为 `merchant_no`，`overview`/`trend` 同步。
- 删除旧的 `/container-comparison` 与 `/containers/{container_id}` 路由。

- [x] **Step 5: 验证 GREEN**

Run: `.venv/bin/python -m pytest backend/tests/test_analytics.py backend/tests/test_analytics_api.py backend/tests/test_settlement_comparison_api.py -q --basetemp=backend/.pytest-tmp`

Expected: PASS。

### Task 5: 数据明细 API

**Files:**
- Create: `backend/app/services/settlement_list_service.py`
- Create: `backend/app/api/settlements.py`
- Create: `backend/tests/test_settlements_api.py`
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/main.py`

- [x] **Step 1: 写失败测试**

```python
def test_default_range_is_latest_month(client, db):
    seed_batches(db)  # 单624/2026-08-27、626/2026-08-28、单637/2026-09-06、640/2026-09-09

    body = client.get("/api/settlements").json()

    assert body["date_range"] == {"start_date": "2026-08-09", "end_date": "2026-09-09", "is_default": True}
    assert [row["merchant_no"] for row in body["settlements"]] == ["640", "单637", "626", "单624"]
    assert body["settlements"][0]["container_no"] == "CBHU2970762"


def test_one_month_before_clamps_to_month_end():
    assert one_month_before(date(2026, 3, 31)) == date(2026, 2, 28)


def test_merchant_filter_and_empty_range(client, db):
    seed_batches(db)

    filtered = client.get("/api/settlements", params={"merchant_no": "640"}).json()
    assert [row["merchant_no"] for row in filtered["settlements"]] == ["640"]

    empty = client.get(
        "/api/settlements", params={"start_date": "2026-01-01", "end_date": "2026-01-31"}
    ).json()
    assert empty["settlements"] == []


def test_settlement_records_endpoint(client, db):
    seed_batches(db)

    body = client.get("/api/settlements/640/records").json()

    assert body["merchant_no"] == "640"
    assert body["records"][0]["amount"] == 600.0
    assert client.get("/api/settlements/未知/records").status_code == 404
```

- [x] **Step 2: 验证 RED**

Run: `.venv/bin/python -m pytest backend/tests/test_settlements_api.py -q --basetemp=backend/.pytest-tmp`

Expected: FAIL，路由不存在（404）。

- [x] **Step 3: 实现列表服务**

```python
def one_month_before(value: date) -> date:
    """返回往前一个自然月；日序号溢出时取目标月最后一天。"""
    year, month = (value.year - 1, 12) if value.month == 1 else (value.year, value.month - 1)
    return date(year, month, min(value.day, calendar.monthrange(year, month)[1]))


def list_settlements(db, *, start_date=None, end_date=None, merchant_no=None) -> dict:
    """返回数据明细列表；未传日期时使用 [最新销售日期 - 1 个月, 最新销售日期]。"""
```

- 默认范围：`latest = db.query(func.max(SaleRecord.sale_date)).scalar()`；为空时返回
  `{"date_range": None, "settlements": []}`。
- 明细按 `start_date`/`end_date` 过滤后按 `import_batch_id` 分组统计：`sales_amount`、
  `total_quantity`、`average_price = sales_amount / total_quantity`、A/B/C 件数、`record_count`、
  `sale_date_start`/`sale_date_end`；范围内无明细的结算单不返回。
- 排序：`sale_date_end` 倒序，其次 `merchant_no` 倒序。
- 返回结构：

```json
{
  "date_range": {"start_date": "2026-08-09", "end_date": "2026-09-09", "is_default": true},
  "settlements": [{
    "merchant_no": "640", "order_no": "宝贝L004", "container_no": "CBHU2970762",
    "vehicle_no": "桂ABF330", "sale_date_start": "2026-09-09", "sale_date_end": "2026-09-09",
    "sales_amount": 8000.0, "total_quantity": 20.0, "average_price": 400.0,
    "grade_quantities": {"A": 12.0, "B": 6.0, "C": 2.0}, "record_count": 3
  }]
}
```

- [x] **Step 4: 实现路由与 DTO**

- `backend/app/api/settlements.py`：router `prefix="/api/settlements"`，依赖 `require_current_user`；
  `GET ""` 调用 `list_settlements`，`GET "/{merchant_no}/records"` 返回该结算单全部明细
  （`merchant_no` 不存在 → 404「结算单不存在」）。
- `backend/app/schemas.py` 增加 `GradeQuantityMap`（A/B/C 三个 `float`）、
  `SettlementListItem`、`SettlementListResponse`、`SettlementRecord`、`SettlementRecordsResponse`。
- `backend/app/main.py` 注册 `settlements_router`。

- [x] **Step 5: 验证 GREEN**

Run: `.venv/bin/python -m pytest backend/tests/test_settlements_api.py -q --basetemp=backend/.pytest-tmp`

Expected: PASS。

### Task 6: 导出按商号

**Files:**
- Modify: `backend/app/api/exports.py`
- Test: `backend/tests/test_exports.py`

- [x] **Step 1: 写失败测试**

```python
def test_settlement_xlsx_export_uses_merchant_no(client, db):
    seed_batch(db, merchant_no="单637", container_no="CBHU2970762", order_no="宝贝003")

    response = client.get("/api/exports/settlements/单637.xlsx")

    assert response.status_code == 200
    assert "attachment" in response.headers["content-disposition"]
    assert client.get("/api/exports/settlements/不存在.xlsx").status_code == 404
```

- [x] **Step 2: 验证 RED**

Run: `.venv/bin/python -m pytest backend/tests/test_exports.py -q --basetemp=backend/.pytest-tmp`

Expected: FAIL，旧路径为 `/api/exports/containers/{container_id}.xlsx`。

- [x] **Step 3: 切换导出口径**

- 路由 `/containers/{container_id}.xlsx` → `/settlements/{merchant_no}.xlsx`，
  `_records` 改为按 `ImportBatch.merchant_no` 关联查询，`_container_workbook` 改名
  `_settlement_workbook`，工作簿标题与列显示商号/单号/柜号/转运车号。
- `overview.csv` 与 `/records/{record_id}/source` 保持不变（后者通过 `import_batch_id` 追溯）。

- [x] **Step 4: 验证 GREEN**

Run: `.venv/bin/python -m pytest backend/tests/test_exports.py -q --basetemp=backend/.pytest-tmp`

Expected: PASS。

### Task 7: 结构迁移与数据回填脚本

**Files:**
- Create: `backend/scripts/backfill_settlement_identity.py`
- Create: `backend/tests/test_backfill_settlement_identity.py`
- Modify: `README.md`

- [x] **Step 1: 写失败测试（SQLite 上模拟旧库）**

```python
def test_backfill_reads_metadata_and_is_idempotent(tmp_path):
    legacy = build_legacy_database(tmp_path)          # 旧结构 + 已存原始文件路径

    first = backfill(legacy)
    second = backfill(legacy)

    assert first["updated"] == 1
    assert second["updated"] == 0
    assert read_merchant_no(legacy) == "单624"
    assert read_sale_record_count(legacy) == 1


def test_backfill_stops_when_merchant_no_missing(tmp_path):
    legacy = build_legacy_database(tmp_path, merchant_no=None)

    with pytest.raises(RuntimeError, match="缺少商号"):
        backfill(legacy)


def test_backfill_stops_when_source_file_missing(tmp_path):
    legacy = build_legacy_database(tmp_path, delete_source=True)

    with pytest.raises(RuntimeError, match="原始文件缺失"):
        backfill(legacy)
```

- [x] **Step 2: 验证 RED**

Run: `.venv/bin/python -m pytest backend/tests/test_backfill_settlement_identity.py -q --basetemp=backend/.pytest-tmp`

Expected: FAIL，模块不存在。

- [x] **Step 3: 实现脚本**

```python
SNAPSHOT_DIR = BACKEND_DIR / "data"


def backfill(engine: Engine = default_engine) -> dict[str, int]:
    """迁移表结构并从原始文件回填结算单元数据；幂等。"""


def main() -> int:
    ...
```

实现要点（顺序固定）：

1. 快照：把 `import_batch`、`sale_record`、`container_summary`、`source_file` 导出为
   `backend/data/pre-backfill-<UTC 时间戳>.sql`（`backend/data/` 已被 Git 忽略）。
2. DDL：`import_batch` 先以可空方式增加四个字段 → 回填 → 校验唯一后建立
   `ux_import_batch_merchant_no` 并把 `merchant_no` 改为 `NOT NULL`（SQLite 用 `create_all` + 重建表）。
3. 回填：按 `source_file.storage_path` 调 `parse_settlement` 取元数据写入对应批次；
   原始文件缺失 → `RuntimeError("原始文件缺失: <path>")`；商号缺失 → `RuntimeError("缺少商号: <file>")`。
4. `sale_record` 删除 `container_id`/`container_name`；`container_summary` 重命名为
   `settlement_summary` 并改为 `import_batch_id` 唯一（保留金额字段）。
5. 校验：`import_batch.merchant_no` 全部非空且互不重复；回填前后 `sale_record` 行数与金额合计一致，
   不一致时回滚并报错。
6. 幂等：`merchant_no` 全部非空且旧列已不存在时直接返回 `{"updated": 0}`。

- [x] **Step 4: 验证 GREEN**

Run: `.venv/bin/python -m pytest backend/tests/test_backfill_settlement_identity.py -q --basetemp=backend/.pytest-tmp`

Expected: PASS。

- [x] **Step 5: 对现有 MySQL 执行（需用户在场）**

Run: `.venv/bin/python -m scripts.backfill_settlement_identity`

Expected：`updated=4`；随后跑
`.venv/bin/python -m pytest backend/tests -q --basetemp=backend/.pytest-tmp` 全绿，
并用 SQL 校验商号为 `单624`、`626`、`单637`、`640` 且 `sale_record` 仍有 86 行。

**执行结果（2026-09-10 15:40）**：`--apply` 成功，4 个批次 / 86 条明细 /
`settlement_summary` 4 行；快照留存 `backend/data/snapshot-settlement-20260910-154020.sql`。
柜号 `CBHU2970762` 同时出现在 `单637` 与 `640`，确认柜号不唯一、商号才是业务主键。

- [x] **Step 6: 更新 README**

在「认证表结构变更」后新增「商号维度迁移」小节：说明脚本用途、快照位置、幂等性，
以及商号缺失/原始文件缺失时的处理方式。

### Task 8: 前端契约与数据明细页

**Files:**
- Modify: `frontend/src/api/types.ts`、`frontend/src/api/normalize.ts`、`frontend/src/api/client.ts`
- Create: `frontend/src/views/SettlementListView.vue`
- Create: `frontend/src/components/SettlementRecordsDialog.vue`
- Modify: `frontend/src/main.ts`、`frontend/src/AppShell.vue`
- Test: `frontend/tests/settlements-client.test.ts`、`frontend/tests/settlement-list-view.test.mjs`

- [x] **Step 1: 写失败测试**

```ts
test('settlement list 请求携带筛选参数并解析指标', async (context) => {
  let requested = ''
  globalThis.fetch = async (input) => {
    requested = String(input)
    return new Response(JSON.stringify({
      date_range: { start_date: '2026-08-09', end_date: '2026-09-09', is_default: true },
      settlements: [{
        merchant_no: '640', order_no: '宝贝L004', container_no: 'CBHU2970762', vehicle_no: '桂ABF330',
        sale_date_start: '2026-09-09', sale_date_end: '2026-09-09', sales_amount: 8000,
        total_quantity: 20, average_price: 400, grade_quantities: { A: 12, B: 6, C: 2 }, record_count: 3,
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  context.after(() => { globalThis.fetch = originalFetch })

  const list = await api.getSettlements({ merchantNo: '640' })

  assert.match(requested, /\/api\/settlements\?merchant_no=640/)
  assert.equal(list.settlements[0].merchantNo, '640')
  assert.equal(list.settlements[0].gradeQuantities.a, 12)
})
```

`settlement-list-view.test.mjs` 断言视图文本包含：`商号`、`单号`、`柜号`、`销售日期`、
`销售额`、A/B/C 件数表头、`平均售价`、`查看明细`、`SettlementRecordsDialog` 与默认范围提示
（`最近一个月`），且不含 `货柜详情`、`containerId`。

- [x] **Step 2: 验证 RED**

Run: `node --test --experimental-strip-types frontend/tests/settlements-client.test.ts frontend/tests/settlement-list-view.test.mjs`

Expected: FAIL，`getSettlements` 与视图文件不存在。

- [x] **Step 3: 扩展 API 契约**

- `types.ts`：`GradeQuantities { a: number; b: number; c: number }`、`SettlementListItem`
  （`merchantNo`/`orderNo`/`containerNo`/`vehicleNo`/`saleDateStart`/`saleDateEnd`/`salesAmount`/
  `totalQuantity`/`averagePrice`/`gradeQuantities`/`recordCount`）、`SettlementListResult`
  （`dateRange`、`settlements`）、`SettlementRecord`；`AnalyticsFilters.containerId` → `merchantNo`。
- `normalize.ts`：新增 `normalizeSettlementList`、`normalizeSettlementRecords`；
  查询参数由 `container_id` 改为 `merchant_no`。
- `client.ts`：`getSettlements(filters)` → `GET /api/settlements`、
  `getSettlementRecords(merchantNo)` → `GET /api/settlements/{merchantNo}/records`；
  对比与详情改为 `/analytics/settlement-comparison`、`/analytics/settlements/{merchantNo}`。

- [x] **Step 4: 实现数据明细页与弹窗**

`SettlementListView.vue`：筛选项为销售日期范围与商号关键字；表格列按设计文档；
`查看明细` 打开 `SettlementRecordsDialog`（`role="dialog"`、`aria-modal`、Esc 关闭、
打开时聚焦关闭按钮），展示明细行与合计；空状态区分「该时间段没有结算单」与「还没有导入任何结算单」。
`main.ts` 增加 `/settlements` 受保护路由，`AppShell.vue` 导航加入 `数据明细`。

- [x] **Step 5: 验证 GREEN 与构建**

Run: `node --test --experimental-strip-types frontend/tests/*.test.ts frontend/tests/*.test.mjs`

Run: `npm --prefix frontend run build`

Expected: 全部通过并构建成功。

### Task 9: 商号对比、商号详情与导入覆盖交互

**Files:**
- Rename: `frontend/src/views/ContainerComparisonView.vue` → `SettlementComparisonView.vue`
- Rename: `frontend/src/views/ContainerView.vue` → `SettlementView.vue`
- Rename: `frontend/src/components/ContainerComparison.vue` → `SettlementComparison.vue`
- Rename: `frontend/src/utils/containerComparison.ts` → `settlementComparison.ts`
- Modify: `frontend/src/components/ComparisonPanel.vue`、`frontend/src/views/ImportView.vue`、
  `frontend/src/main.ts`、`frontend/src/AppShell.vue`
- Test: `frontend/tests/container-comparison-selection.test.ts`、`frontend/tests/comparison-chart.test.ts`、
  `frontend/tests/farmer-ui-copy.test.mjs`

- [x] **Step 1: 写失败测试**

选择逻辑测试改为按 `merchantNo` 去重与限量（默认 2、最多 3），并断言柜号只作为辅助字段展示；
菜单文案测试断言四项为 `销售总览`、`数据明细`、`商号对比`、`数据导入`。

- [x] **Step 2: 验证 RED**

Run: `node --test --experimental-strip-types frontend/tests/*.test.ts frontend/tests/*.test.mjs`

Expected: FAIL，旧文件名与「货柜」文案仍在。

- [x] **Step 3: 执行改名与口径替换**

用 `git mv` 完成四个文件改名（保留历史）并同步 import 路径；页面文案
`货柜对比` → `商号对比`、`货柜详情` → `商号详情`；选择值、列表 key、详情路由参数与查询参数
全部改为商号；柜号/单号/转运车号作为展示字段保留。

- [x] **Step 4: 导入页覆盖确认**

`ImportView.vue`：后端返回 `conflict` 的批次提示「已存在同商号结算单，是否覆盖？」，
确认后带 `overwrite=true` 重新提交同一文件；未确认时展示既有结算单商号与导入时间，不修改数据。

- [x] **Step 5: 验证 GREEN 与构建**

Run: `node --test --experimental-strip-types frontend/tests/*.test.ts frontend/tests/*.test.mjs`

Run: `npm --prefix frontend run build`

Expected: 全部通过并构建成功。

### Task 10: 文档同步与端到端验收

**Files:**
- Modify: `docs/ARCHITECTURE.md`、`docs/DECISIONS.md`、`docs/TODO.md`、`docs/HANDOFF.md`、`README.md`

- [x] **Step 1: 更新 ADR-008**

把 `ADR-008 — 以「单号」作为结算单业务唯一键` 改为 `ADR-008 — 以「商号」作为结算单业务唯一键`，
状态改为 `Accepted`，Context 补充「单号可重复、柜号可缺失、同一柜号存在多张结算单」，
依据文档指向本设计，并注明取代原「单号唯一键」方案。

- [x] **Step 2: 更新 ARCHITECTURE / README / TODO / HANDOFF**

架构文档更新路由表、模块职责（新增 settlements API 与 settlement 服务）与数据模型说明；
README 更新导入规则（商号必填、柜号可选）与迁移脚本说明；TODO 移除已完成项；
HANDOFF 记录本次改动、验证结果与并发会话注意点。

- [x] **Step 3: 后端全量验证**

Run: `.venv/bin/python -m pytest backend/tests -q --basetemp=backend/.pytest-tmp`

Expected: 全部通过。

- [x] **Step 4: 前端全量验证与构建**

Run: `node --test --experimental-strip-types frontend/tests/*.test.ts frontend/tests/*.test.mjs`

Run: `npm --prefix frontend run build`

Expected: 全部通过并构建成功。

- [x] **Step 5: 浏览器端到端验收（http://127.0.0.1:53000）**

用 Playwright 脚本按顺序验证并截图留档：

1. 登录后进入 `数据明细`，默认范围等于 `[最新销售日期 - 1 个月, 最新销售日期]`；
2. 表格出现 4 行，列包含商号/单号/柜号/销售日期/A·B·C 件数/平均售价；
3. 点击 `640` 的 `查看明细`，弹窗行数与金额合计与后端一致，Esc 可关闭；
4. 商号对比页可选中 `单637` 与 `640`（两者柜号相同）并分别展示指标；
5. 控制台无 JS 报错。

**执行结果（2026-09-10 16:05）**：已用 Playwright + Chromium 对
`http://127.0.0.1:53000` 完成 15 项检查，全部 PASS（登录 → 销售总览 → 数据明细 →
查看明细弹窗 → 结算单对比 → 结算单详情 → 无未捕获脚本错误）。截图见 `/tmp/page-*.png`。
