# Settlement Number Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以 Excel“单号”作为结算单业务唯一键，让重复柜号的不同结算单独立分析，并在重复单号导入时由用户确认是否覆盖。

**Architecture:** `import_batch.id` 继续作为内部主键，新增唯一的 `settlement_no`。解析器负责从文件元数据读取单号；导入服务负责冲突与事务覆盖；分析 API 通过 `import_batch_id` 按单号筛选。现有 MySQL 数据由幂等脚本从原始文件回填，本次按用户要求不创建备份。

**Tech Stack:** FastAPI、SQLAlchemy、PyMySQL、pandas/openpyxl、pytest、Vue 3、TypeScript、Vite、Node test runner。

---

## 文件职责

- `backend/app/parser/settlement_parser.py`：解析 Excel/CSV 单号及销售数据。
- `backend/app/models.py`：声明 `ImportBatch.settlement_no` 唯一业务键。
- `backend/app/services/import_service.py`：处理单号冲突和事务覆盖。
- `backend/app/services/analytics_core.py`：承载通用记录筛选、指标和趋势计算。
- `backend/app/services/settlement_analytics_service.py`：按单号计算对比、详情和异常。
- `backend/app/services/analytics_service.py`：兼容导入门面，保持已有调用点稳定。
- `backend/app/services/container_detail_service.py`：按当前结算批次读取摘要和记录。
- `backend/app/api/imports.py`：暴露覆盖参数并清理未引用文件。
- `backend/app/api/analytics.py`：接受 `settlement_no` 并返回结算单对比/详情。
- `backend/app/api/exports.py`：按单号导出结算单数据。
- `backend/scripts/migrate_settlement_numbers.py`：回填并约束当前 MySQL 单号。
- `frontend/src/api/types.ts`、`normalize.ts`、`client.ts`：定义单号 API contract。
- `frontend/src/views/ImportView.vue`：拖放选择、冲突确认和覆盖提交。
- `frontend/src/views/OverviewView.vue`、`ContainerComparisonView.vue`、`ContainerView.vue`：以单号作为筛选和详情身份。
- `frontend/src/components/ContainerComparison.vue`、`ComparisonPanel.vue`：以单号作为列表 key 和选择值，柜号降为辅助信息。

### Task 1: 单号解析与模型约束

**Files:**
- Modify: `backend/app/parser/settlement_parser.py`
- Modify: `backend/app/models.py`
- Test: `backend/tests/test_parser.py`
- Test: `backend/tests/test_models.py`
- Test: `backend/tests/test_import_service.py`
- Test: `backend/tests/test_imports_api.py`

- [ ] **Step 1: 写单号解析失败测试**

新增测试，要求 Excel 从 `B7=单号：/C7=宝贝L004` 读取 `settlement_no`，CSV 从
`单号` 列读取唯一值；缺失或同一文件出现多个单号时抛出明确的文件级错误。

```python
parsed = parse_settlement(path)
assert parsed.settlement_no == "宝贝L004"

with pytest.raises(SettlementParseError, match="缺少单号"):
    parse_settlement(path_without_number)
```

- [ ] **Step 2: 验证 RED**

Run: `.venv/bin/python -m pytest backend/tests/test_parser.py -q --basetemp=backend/.pytest-tmp`

Expected: FAIL，缺少 `parse_settlement`、`settlement_no` 或错误类型。

- [ ] **Step 3: 实现结构化解析结果**

新增 `ParsedSettlement` 和 `SettlementParseError`。Excel 按标准化后的“单号”标签读取；
CSV 接受 `settlement_no/order_no/单号/结算单号`，要求所有非空值唯一。保留
`read_settlement` 与 `read_settlement_with_summary` 兼容包装。

- [ ] **Step 4: 增加模型唯一约束并更新测试 fixture**

```python
class ImportBatch(Base):
    __table_args__ = (
        Index("ux_import_batch_settlement_no", "settlement_no", unique=True),
    )
    settlement_no: Mapped[str] = mapped_column(String(128), nullable=False)
```

所有测试中的 `ImportBatch(...)` 和 CSV fixture 补充明确单号；新增重复单号触发
`IntegrityError` 的模型测试。

- [ ] **Step 5: 验证 GREEN**

Run: `.venv/bin/python -m pytest backend/tests/test_parser.py backend/tests/test_models.py -q --basetemp=backend/.pytest-tmp`

Expected: PASS。

### Task 2: 冲突检测与事务覆盖

**Files:**
- Modify: `backend/app/services/import_service.py`
- Modify: `backend/app/api/imports.py`
- Test: `backend/tests/test_import_service.py`
- Test: `backend/tests/test_imports_api.py`

- [ ] **Step 1: 写冲突与覆盖失败测试**

覆盖以下行为：初次导入成功；同单号默认返回 `conflict` 且数据库不变；
`overwrite=True` 只保留新记录；模拟 commit 失败后旧批次、旧记录和旧来源仍存在。

```python
conflict = import_file(db, changed_path, overwrite=False)
assert conflict.status == "conflict"
assert conflict.settlement_no == "宝贝L004"

replaced = import_file(db, changed_path, overwrite=True)
assert replaced.status == "success"
assert db.query(ImportBatch).filter_by(settlement_no="宝贝L004").count() == 1
```

- [ ] **Step 2: 验证 RED**

Run: `.venv/bin/python -m pytest backend/tests/test_import_service.py backend/tests/test_imports_api.py -q --basetemp=backend/.pytest-tmp`

Expected: FAIL，当前仍按文件哈希返回 duplicate 且无覆盖参数。

- [ ] **Step 3: 实现服务事务**

先解析单号，再查找旧 `ImportBatch`。默认返回 conflict；覆盖时先完成解析，再删除旧
批次并 flush，随后写入新批次，最后一次 commit。`ImportResult` 增加
`settlement_no`、`file_name`、`existing_batch_id` 和仅供 API 清理使用的
`obsolete_storage_path`。

- [ ] **Step 4: 实现 API 覆盖参数和文件清理**

`POST /api/imports?overwrite=true` 将参数传给每个文件。conflict 时清理本次新上传但
未引用的文件；覆盖成功后只清理服务返回的旧且未引用路径。返回结果顺序与上传文件
顺序一致。

- [ ] **Step 5: 验证 GREEN**

Run: `.venv/bin/python -m pytest backend/tests/test_import_service.py backend/tests/test_imports_api.py -q --basetemp=backend/.pytest-tmp`

Expected: PASS。

### Task 3: 按单号分析、详情和导出

**Files:**
- Create: `backend/app/services/analytics_core.py`
- Create: `backend/app/services/settlement_analytics_service.py`
- Modify: `backend/app/services/analytics_service.py`
- Modify: `backend/app/services/container_detail_service.py`
- Modify: `backend/app/api/analytics.py`
- Modify: `backend/app/api/exports.py`
- Test: `backend/tests/test_analytics.py`
- Test: `backend/tests/test_analytics_api.py`
- Test: `backend/tests/test_container_comparison_api.py`
- Test: `backend/tests/test_exports.py`

- [ ] **Step 1: 写重复柜号的回归测试**

创建两个 `ImportBatch(settlement_no="宝贝003")` 和
`ImportBatch(settlement_no="宝贝L004")`，令销售记录使用同一个 `container_id`。
断言对比返回两个结算单，详情按单号各自只返回所属记录和摘要。

- [ ] **Step 2: 验证 RED**

Run: `.venv/bin/python -m pytest backend/tests/test_analytics.py backend/tests/test_analytics_api.py backend/tests/test_container_comparison_api.py backend/tests/test_exports.py -q --basetemp=backend/.pytest-tmp`

Expected: FAIL，当前按 `container_id` 合并。

- [ ] **Step 3: 拆分超长分析模块并实现单号筛选**

将通用指标迁入 `analytics_core.py`，结算单比较、排名、异常与详情迁入
`settlement_analytics_service.py`，`analytics_service.py` 仅重导出公共函数。
记录查询通过 `SaleRecord.import_batch_id == ImportBatch.id` 关联并按
`ImportBatch.settlement_no` 过滤；所有修改后的文件保持不超过 300 行。

- [ ] **Step 4: 调整 API contract**

分析过滤参数使用 `settlement_no`。对比项返回：

```json
{
  "settlement_no": "宝贝L004",
  "container_id": "CBHU2970762",
  "total": {},
  "grades": []
}
```

详情和 XLSX 导出按 URL 编码后的单号查询，响应同时保留柜号。

- [ ] **Step 5: 验证 GREEN**

重复执行 Step 2 的测试命令，Expected: PASS。

### Task 4: 现有数据库迁移脚本

**Files:**
- Create: `backend/scripts/migrate_settlement_numbers.py`
- Create: `backend/tests/test_migrate_settlement_numbers.py`
- Modify: `README.md`

- [ ] **Step 1: 写幂等迁移测试**

测试 legacy `import_batch` 表、原始文件单号回填、重复运行、缺失单号与重复单号在
DDL 前停止。测试数据库使用 SQLite；MySQL 分支额外生成 `MODIFY ... NOT NULL`。

- [ ] **Step 2: 验证 RED**

Run: `.venv/bin/python -m pytest backend/tests/test_migrate_settlement_numbers.py -q --basetemp=backend/.pytest-tmp`

Expected: FAIL，迁移模块不存在。

- [ ] **Step 3: 实现迁移**

脚本先读取全部 `source_file.storage_path` 并解析映射，确认每批恰好一个非重复单号；
校验通过后添加列、回填、设置非空并创建 `ux_import_batch_settlement_no`。已完成状态
再次执行只做一致性检查。按用户要求不执行 `mysqldump`。

- [ ] **Step 4: 验证 GREEN**

重复执行 Step 2 的测试命令，Expected: PASS。

### Task 5: 前端单号 contract、拖放与覆盖确认

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/normalize.ts`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/views/ImportView.vue`
- Modify: `frontend/src/views/OverviewView.vue`
- Modify: `frontend/src/views/ContainerComparisonView.vue`
- Modify: `frontend/src/views/ContainerView.vue`
- Modify: `frontend/src/components/ContainerComparison.vue`
- Modify: `frontend/src/components/ComparisonPanel.vue`
- Test: `frontend/tests/analytics-client.test.ts`
- Create: `frontend/tests/import-drop-conflict.test.mjs`

- [ ] **Step 1: 写前端失败测试**

断言 normalize 后的比较项包含 `settlementNo`，请求使用 `settlement_no`，导入请求可
添加 `overwrite=true`；SFC 包含 `dragenter/dragover/dragleave/drop` 和逐文件冲突的
取消、覆盖按钮。

- [ ] **Step 2: 验证 RED**

Run: `node --test --experimental-strip-types frontend/tests/*.test.ts frontend/tests/*.test.mjs`

Expected: FAIL，缺少单号字段、覆盖参数和拖放交互。

- [ ] **Step 3: 实现 API contract 和页面身份**

`ContainerComparisonItem` 增加必填 `settlementNo`；所有列表 key、选择值、详情请求和
导航 query 改用该字段，主标签显示单号，辅助信息显示柜号。总览仍展示全局汇总。

- [ ] **Step 4: 实现拖放和冲突确认**

文件面板复用 `selectFiles`，拖入时使用 `is-dragging` 状态高亮。首次上传后将 conflict
结果与原 `File` 按响应顺序配对；取消移除该项，覆盖只用对应文件调用
`uploadImports([file], true)`。上传中禁用按钮并通过 `aria-live` 报告结果。

- [ ] **Step 5: 验证 GREEN 和构建**

Run: `node --test --experimental-strip-types frontend/tests/*.test.ts frontend/tests/*.test.mjs`

Run: `npm --prefix frontend run build`

Expected: tests PASS，Vite build exit 0。

### Task 6: 全量验证、开发库迁移与服务恢复

**Files:**
- Modify only if verification exposes an in-scope defect.

- [ ] **Step 1: 运行完整验证**

Run: `.venv/bin/python -m pytest backend/tests -q --basetemp=backend/.pytest-tmp`

Run: `node --test --experimental-strip-types frontend/tests/*.test.ts frontend/tests/*.test.mjs`

Run: `npm --prefix frontend run build`

Expected: 全部 exit 0，无失败或构建错误。

- [ ] **Step 2: 停止开发服务并执行迁移**

Run: `systemctl stop fruits-ana.service`

Run: `.venv/bin/python -m scripts.migrate_settlement_numbers`

Expected: 4 个批次分别回填 `宝贝003`、`宝贝01`、`宝贝02`、`宝贝L004`，唯一索引
和非空约束存在。按用户要求不备份。

- [ ] **Step 3: 重新后台启动并做 smoke test**

使用现有 systemd transient service 重新启动 `start.sh`，验证前端、`/health`、总览、
对比和 `宝贝L004` 详情。确认相同柜号 `CBHU2970762` 对应两个独立单号。

- [ ] **Step 4: 检查交付差异**

Run: `git diff --check`

Run: `git status --short`

Expected: 只有本计划范围内文件和用户原有改动；不执行 commit、push 或其他 Git 历史操作。
