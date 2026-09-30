"""对比两个 MySQL 库的完整表结构，并与 models.py 基准做三方核对。

发版前用于确认「测试库 → 生产库」需要补哪些 DDL。全量对比两边
information_schema 中的所有表（不限于 models.py 定义的表），多余/残留对象
一律列出供人工评审，不做任何删改。

只读保证：仅查询 information_schema 与 SELECT VERSION() / SHOW GRANTS，
不执行任何 DML/DDL。凭据只从环境变量或 backend/.env 读取，所有输出
（报告 / JSON / 日志）均脱敏为 user@host:port/db，绝不打印口令。

用法（仓库根目录，源库默认取 backend/.env 的 FRUIT_ANALYSIS_DB_* 配置）：

    SCHEMA_COMPARE_TARGET_URL='mysql+pymysql://user:***@host:3306/fruits_ana' \\
    .venv/bin/python -m scripts.compare_schemas --output 报告.md --json 报告.json

两端均可显式指定：`SCHEMA_COMPARE_{SOURCE,TARGET}_URL`，或分量环境变量
`SCHEMA_COMPARE_{SOURCE,TARGET}_{HOST,PORT,USER,PASSWORD,NAME}`；
SOURCE 未提供时回落到 backend/.env（即测试库）。

分类口径：
    A 类  models.py 与测试库一致、生产缺失或不一致 → 需同步到生产
    C 类  models.py 有、测试库也没有 → 测试库落后于代码，先补测试库
    B 类  测试库有、models.py 没有 → 疑似开发残留，默认不上生产，人工评审
    X 类  两边均与 models.py 不一致 → 人工逐条评审
    P 类  生产多余的对象 → 本次不动，仅列清单
    INFO  排序规则 / 表引擎 / 权限等信息项
"""

from __future__ import annotations

import argparse
import datetime as _dt
import json
import os
import re
import sys
from dataclasses import dataclass, field
from urllib.parse import quote_plus

from sqlalchemy import Integer, create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.pool import NullPool


# --------------------------------------------------------------------------
# 连接端点
# --------------------------------------------------------------------------


@dataclass
class DbEndpoint:
    label: str  # 脱敏：user@host:port/db
    url: str


def _endpoint_from_env_prefix(prefix: str) -> DbEndpoint | None:
    url = os.environ.get(f"SCHEMA_COMPARE_{prefix}_URL")
    if not url:
        host = os.environ.get(f"SCHEMA_COMPARE_{prefix}_HOST")
        database = os.environ.get(f"SCHEMA_COMPARE_{prefix}_NAME")
        if not (host and database):
            return None
        user = os.environ.get(f"SCHEMA_COMPARE_{prefix}_USER", "")
        password = os.environ.get(f"SCHEMA_COMPARE_{prefix}_PASSWORD", "")
        port = os.environ.get(f"SCHEMA_COMPARE_{prefix}_PORT", "3306")
        auth = quote_plus(user)
        if password:
            auth += ":" + quote_plus(password)
        url = f"mysql+pymysql://{auth}@{host}:{int(port)}/{database}?charset=utf8mb4"
    parsed = make_url(url)
    if parsed.get_backend_name() != "mysql":
        raise SystemExit(f"SCHEMA_COMPARE_{prefix}：仅支持 MySQL 连接，收到 {parsed.get_backend_name()}")
    if "charset" not in parsed.query:
        url += ("&" if "?" in url else "?") + "charset=utf8mb4"
    label = f"{parsed.username or ''}@{parsed.host}:{parsed.port or 3306}/{parsed.database or ''}"
    return DbEndpoint(label=label, url=url)


def _default_test_endpoint() -> DbEndpoint:
    """源库默认走 backend/.env（FRUIT_ANALYSIS_DB_*），与本地启动共用一份配置。"""
    from app.db import describe_database, engine as app_engine

    return DbEndpoint(label=describe_database(app_engine.url), url=str(app_engine.url))


# --------------------------------------------------------------------------
# 只读采集
# --------------------------------------------------------------------------


@dataclass
class DbSnapshot:
    label: str
    version: str
    tables: dict[str, dict] = field(default_factory=dict)
    columns: dict[str, dict[str, dict]] = field(default_factory=dict)
    indexes: dict[str, dict[str, dict]] = field(default_factory=dict)
    foreign_keys: dict[str, dict[str, dict]] = field(default_factory=dict)
    checks: dict[str, dict[str, str]] = field(default_factory=dict)
    views: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    grants: list[str] = field(default_factory=list)


def _norm_type(raw: object) -> str:
    t = " ".join(str(raw or "").strip().split())
    head, paren, tail = t.partition("(")
    key = head.strip().lower()
    key = {"integer": "int", "dec": "decimal", "numeric": "decimal", "bool": "tinyint", "boolean": "tinyint"}.get(key, key)
    args = ("(" + tail) if paren else ""
    if args and key in {"tinyint", "smallint", "mediumint", "int", "bigint"}:
        inner = args[1 : args.rindex(")")] if ")" in args else args[1:]
        if re.fullmatch(r"\d+", inner):
            args = ""  # 整型显示宽度：MySQL 8.0.19+ 已不再输出，两侧统一忽略
    out = re.sub(r"\s*,\s*", ",", key + args)
    return re.sub(r"\s+(unsigned|signed)", r" \1", out)


def _norm_default(value: object) -> str | None:
    if value is None:
        return None
    s = str(value).strip()
    s = re.sub(r"(?i)current_timestamp\(\)", "current_timestamp", s)
    s = re.sub(r"(?i)^now\(\)$", "current_timestamp", s)
    s = re.sub(r"(?i)^b'(.*)'$", r"\1", s)  # MySQL 8 的 bit 字面量默认值
    if len(s) >= 2 and s[0] == s[-1] and s[0] in "'\"":
        s = s[1:-1]
    return s.lower() or None


def _norm_extra(extra: object) -> str:
    s = str(extra or "").lower()
    parts: list[str] = []
    if "auto_increment" in s:
        parts.append("auto_increment")
    match = re.search(r"on update (.+)$", s)
    if match:
        parts.append("on update " + re.sub(r"\(\)", "", match.group(1).strip()))
    return ";".join(parts)


def _norm_check(clause: object) -> str:
    s = re.sub(r"`", "", str(clause or ""))
    s = re.sub(r"(?i)_utf8mb4\\?", "", s)
    return re.sub(r"\s+", "", s).lower()


def snapshot(endpoint: DbEndpoint, *, with_grants: bool = False) -> DbSnapshot:
    eng = create_engine(endpoint.url, poolclass=NullPool, connect_args={"connect_timeout": 15})
    snap = DbSnapshot(label=endpoint.label, version="")
    try:
        with eng.connect() as conn:
            snap.version = str(conn.execute(text("SELECT VERSION()")).scalar_one())
            schema = str(conn.execute(text("SELECT DATABASE()")).scalar_one())

            for row in conn.execute(
                text(
                    "SELECT TABLE_NAME, ENGINE, TABLE_COLLATION FROM information_schema.TABLES "
                    "WHERE TABLE_SCHEMA = :s AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME"
                ),
                {"s": schema},
            ):
                snap.tables[row.TABLE_NAME] = {
                    "engine": (row.ENGINE or "").lower(),
                    "collation": row.TABLE_COLLATION or "",
                }
            snap.views = [
                row.TABLE_NAME
                for row in conn.execute(
                    text(
                        "SELECT TABLE_NAME FROM information_schema.TABLES "
                        "WHERE TABLE_SCHEMA = :s AND TABLE_TYPE = 'VIEW' ORDER BY TABLE_NAME"
                    ),
                    {"s": schema},
                )
            ]

            for row in conn.execute(
                text(
                    "SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, "
                    "EXTRA, COLLATION_NAME FROM information_schema.COLUMNS "
                    "WHERE TABLE_SCHEMA = :s ORDER BY TABLE_NAME, ORDINAL_POSITION"
                ),
                {"s": schema},
            ):
                snap.columns.setdefault(row.TABLE_NAME, {})[row.COLUMN_NAME] = {
                    "type": _norm_type(row.COLUMN_TYPE),
                    "raw_type": str(row.COLUMN_TYPE),
                    "nullable": row.IS_NULLABLE == "YES",
                    "default": _norm_default(row.COLUMN_DEFAULT),
                    "extra": _norm_extra(row.EXTRA),
                    "collation": row.COLLATION_NAME or "",
                }

            for row in conn.execute(
                text(
                    "SELECT TABLE_NAME, INDEX_NAME, MAX(NON_UNIQUE) AS NON_UNIQUE, "
                    "GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS COLS, "
                    "MAX(INDEX_TYPE) AS ITYPE FROM information_schema.STATISTICS "
                    "WHERE TABLE_SCHEMA = :s GROUP BY TABLE_NAME, INDEX_NAME"
                ),
                {"s": schema},
            ):
                snap.indexes.setdefault(row.TABLE_NAME, {})[row.INDEX_NAME] = {
                    "unique": int(row.NON_UNIQUE) == 0,
                    "columns": tuple((row.COLS or "").split(",")),
                    "type": str(row.ITYPE or "").lower(),
                }

            for row in conn.execute(
                text(
                    "SELECT TABLE_NAME, CONSTRAINT_NAME, "
                    "GROUP_CONCAT(COLUMN_NAME ORDER BY ORDINAL_POSITION) AS COLS, "
                    "MAX(REFERENCED_TABLE_NAME) AS REF_TABLE, "
                    "GROUP_CONCAT(REFERENCED_COLUMN_NAME ORDER BY ORDINAL_POSITION) AS REF_COLS "
                    "FROM information_schema.KEY_COLUMN_USAGE "
                    "WHERE TABLE_SCHEMA = :s AND REFERENCED_TABLE_NAME IS NOT NULL "
                    "GROUP BY TABLE_NAME, CONSTRAINT_NAME"
                ),
                {"s": schema},
            ):
                snap.foreign_keys.setdefault(row.TABLE_NAME, {})[row.CONSTRAINT_NAME] = {
                    "columns": tuple((row.COLS or "").split(",")),
                    "ref_table": row.REF_TABLE,
                    "ref_columns": tuple((row.REF_COLS or "").split(",")),
                }

            try:
                for row in conn.execute(
                    text(
                        "SELECT tc.TABLE_NAME, cc.CONSTRAINT_NAME, cc.CHECK_CLAUSE "
                        "FROM information_schema.CHECK_CONSTRAINTS cc "
                        "JOIN information_schema.TABLE_CONSTRAINTS tc "
                        "  ON tc.CONSTRAINT_SCHEMA = cc.CONSTRAINT_SCHEMA "
                        " AND tc.CONSTRAINT_NAME = cc.CONSTRAINT_NAME "
                        "WHERE cc.CONSTRAINT_SCHEMA = :s"
                    ),
                    {"s": schema},
                ):
                    snap.checks.setdefault(row.TABLE_NAME, {})[row.CONSTRAINT_NAME] = _norm_check(row.CHECK_CLAUSE)
            except Exception as exc:  # MySQL < 8.0.16 没有 CHECK_CONSTRAINTS
                snap.notes.append(f"CHECK 约束不可采集（{exc.__class__.__name__}），请人工核对")

            if with_grants:
                snap.grants = [
                    str(row[0])
                    for row in conn.execute(text("SHOW GRANTS FOR CURRENT_USER()"))
                ]
    finally:
        eng.dispose()
    return snap


# --------------------------------------------------------------------------
# models.py 基准
# --------------------------------------------------------------------------


def models_baseline() -> dict:
    from sqlalchemy.dialects import mysql as sa_mysql

    from app import models  # noqa: F401  # 注册全部模型
    from app.db import Base

    columns: dict[str, dict[str, dict]] = {}
    indexes: dict[str, dict[str, dict]] = {}
    foreign_keys: dict[str, dict[str, dict]] = {}
    checks: dict[str, dict[str, str]] = {}

    for table in Base.metadata.sorted_tables:
        name = table.name
        columns[name] = {}
        for col in table.columns:
            try:
                raw = col.type.compile(dialect=sa_mysql.dialect())
            except Exception:
                raw = str(col.type)
            server_default = getattr(col.server_default, "arg", None)
            autoinc = col.autoincrement is True or (
                col.autoincrement == "auto" and col.primary_key and isinstance(col.type, Integer)
            )
            columns[name][col.name] = {
                "type": _norm_type(raw),
                "raw_type": raw,
                "nullable": bool(col.nullable),
                "default": _norm_default(str(server_default)) if server_default is not None else None,
                "extra": "auto_increment" if autoinc else "",
            }

        indexes[name] = {
            "PRIMARY": {
                "unique": True,
                "columns": tuple(c.name for c in table.primary_key.columns),
                "type": "btree",
            }
        }
        for ix in table.indexes:
            indexes[name][ix.name] = {
                "unique": bool(ix.unique),
                "columns": tuple(c.name for c in ix.columns),
                "type": "btree",
            }

        foreign_keys[name] = {}
        for constraint in table.constraints:
            if constraint.__class__.__name__ == "UniqueConstraint" and constraint.name:
                indexes[name][constraint.name] = {
                    "unique": True,
                    "columns": tuple(c.name for c in constraint.columns),
                    "type": "btree",
                }
            if constraint.__class__.__name__ == "CheckConstraint" and constraint.name:
                checks[name][constraint.name] = _norm_check(str(constraint.sqltext))
            if constraint.__class__.__name__ == "ForeignKeyConstraint":
                foreign_keys[name][constraint.name] = {
                    "columns": tuple(c.parent.name for c in constraint.elements),
                    "ref_table": constraint.referred_table,
                    "ref_columns": tuple(c.column.name for c in constraint.elements),
                }

    return {
        "tables": {name: {} for name in columns},
        "columns": columns,
        "indexes": indexes,
        "foreign_keys": foreign_keys,
        "checks": checks,
    }


# --------------------------------------------------------------------------
# 对比与分类
# --------------------------------------------------------------------------


@dataclass
class Finding:
    category: str  # A / C / B / X / P / INFO
    kind: str  # table / column / index / fk / check / collation / view
    table: str
    name: str
    detail: str
    hint: str = ""


# 已知迁移脚本提示（按表/列名子串匹配，提示运维可用现成脚本，不自动生成 DDL）
_MIGRATION_HINTS: dict[str, str] = {
    "password_reset_token": "backend/scripts/add_password_reset_schema.py",
    "verification_code.purpose": "backend/scripts/add_password_reset_schema.py",
    "entry_field_option": "backend/scripts/add_entry_schema.py",
    "admin_field_conversion_rule": "backend/scripts/add_entry_schema.py",
    "data_issue": "backend/scripts/add_entry_schema.py",
    "entry_draft": "backend/scripts/add_entry_draft_schema.py",
    "import_job": "backend/scripts/add_import_draft_schema.py",
    "settlement_revision": "backend/scripts/add_import_draft_schema.py",
    "import_batch.country": "backend/scripts/add_country_variety_schema.py",
    "sale_record.variety": "backend/scripts/add_country_variety_schema.py",
    "order_no_normalized": "backend/scripts/add_order_no_normalized.py",
    "merchant_no_normalized": "backend/scripts/add_merchant_no_normalized.py",
    "ck_sale_record_grade": "backend/scripts/expand_grades.py",
}


def _hint(table: str, name: str = "") -> str:
    for key, script in _MIGRATION_HINTS.items():
        target = f"{table}.{name}".lower() if name else table.lower()
        if key in target:
            return script
    return ""


def _attr_diffs(src_col: dict, tgt_col: dict) -> list[str]:
    attrs = []
    for attr in ("type", "nullable", "default", "extra"):
        if src_col[attr] != tgt_col[attr]:
            attrs.append(attr)
    return attrs


def _fmt_col(col: dict | None) -> str:
    if col is None:
        return "（无）"
    parts = [col["type"], "NULL" if col["nullable"] else "NOT NULL"]
    if col["default"] is not None:
        parts.append(f"default {col['default']}")
    if col["extra"]:
        parts.append(col["extra"])
    return " ".join(parts)


def _fmt_index(idx: dict | None) -> str:
    if idx is None:
        return "（无）"
    flag = "UNIQUE" if idx["unique"] else "INDEX"
    return f"{flag} ({','.join(idx['columns'])}) {idx['type']}"


def compare(src: DbSnapshot, tgt: DbSnapshot, baseline: dict) -> list[Finding]:
    findings: list[Finding] = []
    base_tables = baseline["tables"]

    for table in sorted(set(src.tables) - set(tgt.tables)):
        category = "A" if table in base_tables else "B"
        findings.append(
            Finding(category, "table", table, "", "生产缺表（测试库存在）", _hint(table))
        )
    for table in sorted(set(tgt.tables) - set(src.tables)):
        category = "X" if table in base_tables else "P"
        note = "代码有、生产有、测试库无：测试库落后，人工确认" if category == "X" else "生产多余对象，本次不动"
        findings.append(Finding(category, "table", table, "", note))

    for table in sorted(set(src.tables) & set(tgt.tables)):
        base_cols = baseline["columns"].get(table, {})
        src_cols = src.columns.get(table, {})
        tgt_cols = tgt.columns.get(table, {})

        for col in sorted(set(src_cols) - set(tgt_cols)):
            category = "A" if col in base_cols else "B"
            findings.append(
                Finding(category, "column", table, col, f"生产缺列；测试库：{_fmt_col(src_cols[col])}", _hint(table, col))
            )
        for col in sorted(set(tgt_cols) - set(src_cols)):
            if col in base_cols:
                findings.append(
                    Finding("X", "column", table, col, f"代码有、生产有、测试库无：测试库落后，人工确认")
                )
            else:
                findings.append(Finding("P", "column", table, col, "生产多余列，本次不动"))
        for col in sorted(set(src_cols) & set(tgt_cols)):
            diffs = _attr_diffs(src_cols[col], tgt_cols[col])
            if not diffs:
                continue
            if col in base_cols:
                base_col = base_cols[col]
                if all(src_cols[col][a] == base_col[a] for a in diffs):
                    category = "A"
                elif all(tgt_cols[col][a] == base_col[a] for a in diffs):
                    category = "B"  # 生产=代码，测试库偏离
                else:
                    category = "X"
            else:
                category = "B"
            detail = "；".join(
                f"{attr}：测试={_show(src_cols[col], attr)} 生产={_show(tgt_cols[col], attr)}"
                for attr in diffs
            )
            findings.append(Finding(category, "column", table, col, detail, _hint(table, col)))

        for kind, src_map, tgt_map, base_map, fmt in (
            ("index", src.indexes.get(table, {}), tgt.indexes.get(table, {}), baseline["indexes"].get(table, {}), _fmt_index),
            ("fk", src.foreign_keys.get(table, {}), tgt.foreign_keys.get(table, {}), baseline["foreign_keys"].get(table, {}), _fmt_index),
        ):
            for name in sorted(set(src_map) - set(tgt_map)):
                category = "A" if name in base_map else "B"
                findings.append(Finding(category, kind, table, name, f"生产缺{ '索引' if kind=='index' else '外键' }；测试库：{fmt(src_map[name])}", _hint(name)))
            for name in sorted(set(tgt_map) - set(src_map)):
                category = "X" if name in base_map else "P"
                findings.append(Finding(category, kind, table, name, "生产多余" + ("且代码有：测试库落后" if category == "X" else "，本次不动")))
            for name in sorted(set(src_map) & set(tgt_map)):
                if src_map[name] != tgt_map[name]:
                    in_base = name in base_map
                    if in_base and src_map[name] == base_map[name]:
                        category = "A"
                    elif in_base and tgt_map[name] == base_map[name]:
                        category = "B"
                    else:
                        category = "X"
                    findings.append(
                        Finding(category, kind, table, name, f"测试库：{fmt(src_map[name])}；生产：{fmt(tgt_map[name])}")
                    )

        src_checks = src.checks.get(table, {})
        tgt_checks = tgt.checks.get(table, {})
        base_checks = baseline["checks"].get(table, {})
        for name in sorted(set(src_checks) | set(tgt_checks)):
            s_val, t_val = src_checks.get(name), tgt_checks.get(name)
            if s_val == t_val:
                continue
            if name in base_checks and s_val is not None and s_val == base_checks[name]:
                category = "A"
            elif s_val is None or t_val is None:
                category = "A" if name in base_checks and s_val is not None else "B"
            else:
                category = "X"
            findings.append(
                Finding(category, "check", table, name, f"测试库：{s_val or '（无）'}；生产：{t_val or '（无）'}", _hint(name))
            )

        src_table = src.tables[table]
        tgt_table = tgt.tables[table]
        for attr in ("collation", "engine"):
            if src_table[attr] != tgt_table[attr] and src_table[attr] and tgt_table[attr]:
                findings.append(
                    Finding("INFO", attr, table, "", f"测试={src_table[attr]}；生产={tgt_table[attr]}")
                )

    for view in sorted(set(src.views) | set(tgt.views)):
        findings.append(Finding("INFO", "view", view, "", f"测试={view in src.views} 生产={view in tgt.views}"))

    order = {"A": 0, "C": 1, "B": 2, "X": 3, "P": 4, "INFO": 5}
    findings.sort(key=lambda f: (order.get(f.category, 9), f.kind, f.table, f.name))
    return findings


def _show(col: dict, attr: str) -> str:
    value = col[attr]
    if attr == "nullable":
        return "NULL" if value else "NOT NULL"
    return "（无）" if value in (None, "") else str(value)


# --------------------------------------------------------------------------
# 报告渲染
# --------------------------------------------------------------------------

_CATEGORY_DESC = {
    "A": "需同步到生产（代码与测试库一致、生产缺失或不一致）",
    "C": "测试库落后代码（models.py 有、测试库也没有）",
    "B": "疑似开发残留 / 测试库偏离（默认不上生产，人工评审）",
    "X": "两边均与代码不一致或状态异常（人工逐条评审）",
    "P": "生产多余对象（本次不动）",
    "INFO": "信息项（排序规则 / 视图 / 权限）",
}


def _render_markdown(
    src: DbSnapshot,
    tgt: DbSnapshot,
    findings: list[Finding],
    baseline_table_count: int,
) -> str:
    now = _dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    lines: list[str] = []
    lines.append("# fruits_ana schema 对比报告（测试 → 生产）")
    lines.append("")
    lines.append(f"- 生成时间：{now}（工具 `backend/scripts/compare_schemas.py`，可重跑复现）")
    lines.append(f"- 源（测试）：`{src.label}`，MySQL {src.version}，表 {len(src.tables)} 张")
    lines.append(f"- 目标（生产）：`{tgt.label}`，MySQL {tgt.version}，表 {len(tgt.tables)} 张")
    lines.append(f"- 基准：`backend/app/models.py`，共 {baseline_table_count} 张表定义")
    lines.append("- 口径：全量对比两库所有表（不限于 models.py）；列顺序（ORDINAL_POSITION）不参与对比；")
    lines.append("  连接信息已脱敏，本报告不含任何口令。")
    for snap in (src, tgt):
        lines.extend(f"- 采集备注（{snap.label}）：{note}" for note in snap.notes)
    lines.append("")

    lines.append("## 结论摘要")
    lines.append("")
    lines.append("| 类别 | 含义 | 数量 |")
    lines.append("| --- | --- | --- |")
    for cat in ("A", "C", "B", "X", "P", "INFO"):
        count = sum(1 for f in findings if f.category == cat)
        lines.append(f"| {cat} | {_CATEGORY_DESC[cat]} | {count} |")
    a_count = sum(1 for f in findings if f.category == "A")
    if a_count == 0:
        lines.append("")
        lines.append("**结论：生产与测试库结构一致（A 类为零），本次发版无需 DDL 变更。**")
    lines.append("")

    for cat in ("A", "C", "B", "X", "P", "INFO"):
        items = [f for f in findings if f.category == cat]
        lines.append(f"## {cat} 类：{_CATEGORY_DESC[cat]}（{len(items)}）")
        lines.append("")
        if not items:
            lines.append("无。")
            lines.append("")
            continue
        lines.append("| 对象 | 明细 | 迁移脚本提示 |")
        lines.append("| --- | --- | --- |")
        for f in items:
            obj = f"`{f.table}`" if not f.name else f"`{f.table}.{f.name}`" if f.kind == "column" else f"`{f.table}` {f.name}"
            detail = f.detail.replace("|", "\\|")
            hint = f.hint.replace("|", "\\|")
            lines.append(f"| {obj} | {detail} | {hint} |")
        lines.append("")

    for snap, role in ((src, "测试"), (tgt, "生产")):
        if snap.grants:
            lines.append(f"## 附：{role}库账号权限（SHOW GRANTS，脱敏）")
            lines.append("")
            lines.append("```")
            lines.extend(snap.grants)
            lines.append("```")
            lines.append("")

    a_hits = sum(1 for t in baseline["tables"] if t in src.tables and t in tgt.tables)
    lines.append("## 附：基准覆盖情况")
    lines.append("")
    lines.append(
        f"- models.py 定义 {baseline_table_count} 张表；其中测试库与生产库同时存在 {a_hits} 张。"
    )
    lines.append(
        f"- 测试库比 models.py 多 {len(set(src.tables) - set(baseline['tables']))} 张表（见 B/P 类，疑似历史遗留或开发残留）。"
    )
    return "\n".join(lines) + "\n"


# --------------------------------------------------------------------------
# 入口
# --------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="对比两个 MySQL 库的表结构（只读，输出脱敏）")
    parser.add_argument("--output", metavar="PATH", help="markdown 报告输出路径（默认打印到 stdout）")
    parser.add_argument("--json", metavar="PATH", help="额外输出机器可读 JSON")
    parser.add_argument("--grants", action="store_true", help="附带 SHOW GRANTS 权限检查")
    parser.add_argument("--skip-baseline", action="store_true", help="只做两库对比，不引入 models.py 基准")
    args = parser.parse_args(argv)

    source = _endpoint_from_env_prefix("SOURCE") or _default_test_endpoint()
    target = _endpoint_from_env_prefix("TARGET")
    if target is None:
        parser.error("缺少目标库：请设置 SCHEMA_COMPARE_TARGET_URL 或 SCHEMA_COMPARE_TARGET_{HOST,NAME,...}")

    print(f"源（测试）：{source.label}", file=sys.stderr)
    print(f"目标（生产）：{target.label}", file=sys.stderr)
    src = snapshot(source, with_grants=args.grants)
    tgt = snapshot(target, with_grants=args.grants)

    baseline = {} if args.skip_baseline else models_baseline()
    findings = compare(src, tgt, baseline)
    report = _render_markdown(src, tgt, findings, len(baseline.get("tables", {})))

    if args.output:
        output_path = os.path.abspath(args.output)
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as fh:
            fh.write(report)
        print(f"报告已写入 {output_path}", file=sys.stderr)
    else:
        print(report)

    if args.json:
        json_path = os.path.abspath(args.json)
        os.makedirs(os.path.dirname(json_path), exist_ok=True)
        payload = {
            "source": {"label": src.label, "version": src.version, "tables": sorted(src.tables)},
            "target": {"label": tgt.label, "version": tgt.version, "tables": sorted(tgt.tables)},
            "findings": [
                {"category": f.category, "kind": f.kind, "table": f.table, "name": f.name, "detail": f.detail, "hint": f.hint}
                for f in findings
            ],
        }
        with open(json_path, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, ensure_ascii=False, indent=2)
        print(f"JSON 已写入 {json_path}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main())
