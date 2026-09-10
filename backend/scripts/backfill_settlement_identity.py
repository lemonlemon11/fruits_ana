"""把结算单身份从「柜号」迁移为「商号」。

背景：柜号可以重复（例如 637 与 640 共用 CBHU2970762），商号才是商业合同唯一单据号。
迁移内容：

1. 先把现存数据导出为 SQL 快照，便于回滚；
2. ``import_batch`` 增加 ``merchant_no`` / ``order_no`` / ``container_no`` / ``vehicle_no``，
   并按原始结算单文件回填，最后为 ``merchant_no`` 建立唯一索引；
3. ``sale_record`` 删除 ``container_id`` / ``container_name``；
4. ``container_summary`` 重命名为 ``settlement_summary``，删除柜号字段并改为按结算单唯一。

脚本幂等：已完成迁移时不会重复执行。默认只演练（dry-run），加 ``--apply`` 才真正写库。
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any, Callable, Iterable

from sqlalchemy import Engine, inspect, text

from app.db import BACKEND_DIR
from app.parser.settlement_parser import SettlementParseError, parse_settlement


DEFAULT_UPLOAD_DIR = BACKEND_DIR / "data" / "uploads"
DEFAULT_SNAPSHOT_DIR = BACKEND_DIR / "data"

MERCHANT_INDEX = "ux_import_batch_merchant_no"
SETTLEMENT_SUMMARY_INDEX = "ux_settlement_summary_batch"
NEW_BATCH_COLUMNS = ("merchant_no", "order_no", "container_no", "vehicle_no")
DROPPED_SALE_COLUMNS = ("container_id", "container_name")
DROPPED_SUMMARY_COLUMNS = ("container_id", "container_name")


class MigrationError(RuntimeError):
    """迁移前校验失败，例如原始文件缺失或商号冲突。"""


@dataclass
class MigrationPlan:
    """按执行顺序拆分的迁移计划。

    ``ddl_before`` 先建列/删列，``backfills`` 再写数据，最后 ``ddl_after``
    收紧约束（NOT NULL 与唯一索引），避免在数据回填前触发非空校验失败。
    """

    ddl_before: list[str] = field(default_factory=list)
    backfills: list[tuple[int, dict[str, Any]]] = field(default_factory=list)
    ddl_after: list[str] = field(default_factory=list)

    @property
    def statements(self) -> list[str]:
        return [*self.ddl_before, *self.ddl_after]


def quote(identifier: str) -> str:
    return f"`{identifier}`"


def _has_table(inspector, name: str) -> bool:
    return name in inspector.get_table_names()


def _columns(inspector, table: str) -> set[str]:
    return {column["name"] for column in inspector.get_columns(table)}


def _indexes(inspector, table: str) -> set[str]:
    return {index["name"] for index in inspector.get_indexes(table)}


def _add_column(table: str, column: str, type_sql: str) -> str:
    return f"ALTER TABLE {quote(table)} ADD COLUMN {quote(column)} {type_sql} NULL"


def _add_unique_index(engine: Engine, table: str, index: str, columns: Iterable[str]) -> str:
    joined = ", ".join(quote(column) for column in columns)
    if engine.dialect.name == "mysql":
        return f"ALTER TABLE {quote(table)} ADD UNIQUE INDEX {index} ({joined})"
    return f"CREATE UNIQUE INDEX {index} ON {quote(table)} ({joined})"


def _drop_index(engine: Engine, table: str, index: str) -> str:
    if engine.dialect.name == "mysql":
        return f"ALTER TABLE {quote(table)} DROP INDEX {index}"
    return f"DROP INDEX {index}"


def _require_not_null(engine: Engine, table: str, column: str, type_sql: str) -> str | None:
    if engine.dialect.name != "mysql":
        return None
    return f"ALTER TABLE {quote(table)} MODIFY COLUMN {quote(column)} {type_sql} NOT NULL"


def resolve_batch_metadata(
    engine: Engine, upload_dir: Path
) -> list[tuple[int, dict[str, Any]]]:
    """按原始文件解析每个批次的商号等元数据。"""

    query = text(
        "SELECT b.id AS batch_id, s.storage_path AS storage_path, s.file_name AS file_name "
        "FROM import_batch b "
        "LEFT JOIN source_file s ON s.import_batch_id = b.id "
        "ORDER BY b.id, s.id"
    )
    with engine.connect() as connection:
        rows = connection.execute(query).mappings().all()

    seen: set[int] = set()
    resolved: list[tuple[int, dict[str, Any]]] = []
    missing: list[str] = []
    for row in rows:
        batch_id = row["batch_id"]
        if batch_id in seen:
            continue
        seen.add(batch_id)
        path = _resolve_path(row["storage_path"], upload_dir)
        if path is None:
            missing.append(f"#{batch_id}（{row['file_name'] or '无原始文件'}）")
            continue
        try:
            meta = parse_settlement(path).meta
        except (SettlementParseError, ValueError, OSError) as exc:
            missing.append(f"#{batch_id}（{path.name}：{exc}）")
            continue
        resolved.append(
            (
                batch_id,
                {
                    "merchant_no": meta.merchant_no,
                    "order_no": meta.order_no,
                    "container_no": meta.container_no,
                    "vehicle_no": meta.vehicle_no,
                },
            )
        )

    if missing:
        raise MigrationError(
            "以下批次无法从原始文件确定商号，请先补齐原始文件再迁移：" + "、".join(missing)
        )
    return resolved


def _resolve_path(storage_path: str | None, upload_dir: Path) -> Path | None:
    if not storage_path:
        return None
    path = Path(storage_path)
    if path.exists():
        return path
    fallback = upload_dir / path.name
    return fallback if fallback.exists() else None


def build_plan(
    engine: Engine, upload_dir: Path = DEFAULT_UPLOAD_DIR
) -> MigrationPlan:
    """返回待执行的 DDL 与待回填的数据，顺序即为执行顺序。"""

    inspector = inspect(engine)
    if not _has_table(inspector, "import_batch"):
        return MigrationPlan()

    plan = MigrationPlan()
    batch_columns = _columns(inspector, "import_batch")
    for column in NEW_BATCH_COLUMNS:
        if column not in batch_columns:
            plan.ddl_before.append(_add_column("import_batch", column, "VARCHAR(128)"))

    plan.backfills = resolve_batch_metadata(engine, upload_dir)

    # 非空与唯一约束必须等数据回填完成后再收紧，否则会先撞上 NULL 校验。
    not_null = _require_not_null(engine, "import_batch", "merchant_no", "VARCHAR(128)")
    if not_null:
        plan.ddl_after.append(not_null)
    if MERCHANT_INDEX not in _indexes(inspector, "import_batch"):
        plan.ddl_after.append(
            _add_unique_index(engine, "import_batch", MERCHANT_INDEX, ["merchant_no"])
        )

    if _has_table(inspector, "sale_record"):
        sale_indexes = _indexes(inspector, "sale_record")
        if "ix_sale_record_container_id" in sale_indexes:
            plan.ddl_before.append(
                _drop_index(engine, "sale_record", "ix_sale_record_container_id")
            )
        for column in DROPPED_SALE_COLUMNS:
            if column in _columns(inspector, "sale_record"):
                plan.ddl_before.append(
                    f"ALTER TABLE {quote('sale_record')} DROP COLUMN {quote(column)}"
                )

    if _has_table(inspector, "container_summary"):
        plan.ddl_before.append(
            f"ALTER TABLE {quote('container_summary')} RENAME TO {quote('settlement_summary')}"
        )
        summary_indexes = _indexes(inspector, "container_summary")
        if "ix_container_summary_container_id" in summary_indexes:
            plan.ddl_before.append(
                _drop_index(
                    engine, "settlement_summary", "ix_container_summary_container_id"
                )
            )
        summary_columns = _columns(inspector, "container_summary")
        for column in DROPPED_SUMMARY_COLUMNS:
            if column in summary_columns:
                plan.ddl_before.append(
                    f"ALTER TABLE {quote('settlement_summary')} DROP COLUMN {quote(column)}"
                )
        if SETTLEMENT_SUMMARY_INDEX not in summary_indexes:
            plan.ddl_after.append(
                _add_unique_index(
                    engine,
                    "settlement_summary",
                    SETTLEMENT_SUMMARY_INDEX,
                    ["import_batch_id"],
                )
            )
    return plan


def validate_unique_merchant(resolved: list[tuple[int, dict[str, Any]]]) -> None:
    seen: dict[str, int] = {}
    for batch_id, meta in resolved:
        merchant_no = meta["merchant_no"]
        if merchant_no in seen:
            raise MigrationError(
                f"商号 {merchant_no} 同时出现在批次 #{seen[merchant_no]} 和 #{batch_id}，"
                "请先人工合并后再迁移"
            )
        seen[merchant_no] = batch_id


def validate_summary_uniqueness(engine: Engine) -> None:
    inspector = inspect(engine)
    if not _has_table(inspector, "container_summary"):
        return
    with engine.connect() as connection:
        duplicates = connection.execute(
            text(
                "SELECT import_batch_id, COUNT(*) AS total FROM container_summary "
                "GROUP BY import_batch_id HAVING total > 1"
            )
        ).all()
    if duplicates:
        detail = "、".join(f"#{row[0]}（{row[1]} 条）" for row in duplicates)
        raise MigrationError(f"以下结算单存在多条结算摘要，请先人工去重：{detail}")


def write_snapshot(engine: Engine, path: Path) -> Path:
    """把全部业务表导出为 INSERT 语句，作为迁移前的回滚快照。"""

    inspector = inspect(engine)
    lines = [
        f"-- 结算单身份迁移快照，生成时间 {datetime.now(timezone.utc).isoformat()}",
        "-- 回滚方式：先清空对应表，再执行本文件中的 INSERT 语句。",
    ]
    with engine.connect() as connection:
        for table in inspector.get_table_names():
            rows = connection.execute(
                text(f"SELECT * FROM {quote(table)}")
            ).mappings().all()
            if not rows:
                continue
            columns = list(rows[0].keys())
            column_sql = ", ".join(quote(column) for column in columns)
            lines.append(f"-- {table}: {len(rows)} 行")
            for row in rows:
                values = ", ".join(_literal(row[column]) for column in columns)
                lines.append(
                    f"INSERT INTO {quote(table)} ({column_sql}) VALUES ({values});"
                )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def _literal(value: Any) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (Decimal, int, float)):
        return str(value)
    if isinstance(value, datetime):
        return f"'{value.isoformat(sep=' ')}'"
    if isinstance(value, date):
        return f"'{value.isoformat()}'"
    text_value = str(value).replace("\\", "\\\\").replace("'", "''")
    return f"'{text_value}'"


def migrate(
    engine: Engine,
    *,
    upload_dir: Path = DEFAULT_UPLOAD_DIR,
    apply: bool = False,
    logger: Callable[[str], None] = print,
) -> list[str]:
    """执行或演练迁移，返回实际执行的语句列表。"""

    plan = build_plan(engine, upload_dir)
    validate_unique_merchant(plan.backfills)
    validate_summary_uniqueness(engine)
    executed: list[str] = []
    if not apply:
        for statement in plan.ddl_before:
            logger(f"[演练] {statement}")
        for batch_id, meta in plan.backfills:
            logger(f"[演练] 回填批次 #{batch_id} 商号 {meta['merchant_no']}")
        for statement in plan.ddl_after:
            logger(f"[演练] {statement}")
        return executed

    with engine.begin() as connection:
        for statement in plan.ddl_before:
            connection.execute(text(statement))
            executed.append(statement)
    with engine.begin() as connection:
        for batch_id, meta in plan.backfills:
            connection.execute(
                text(
                    "UPDATE import_batch SET merchant_no = :merchant_no, "
                    "order_no = :order_no, container_no = :container_no, "
                    "vehicle_no = :vehicle_no WHERE id = :batch_id"
                ),
                {**meta, "batch_id": batch_id},
            )
    with engine.begin() as connection:
        for statement in plan.ddl_after:
            connection.execute(text(statement))
            executed.append(statement)
    return executed


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--apply", action="store_true", help="真正写入数据库；默认只演练")
    parser.add_argument("--upload-dir", type=Path, default=DEFAULT_UPLOAD_DIR)
    parser.add_argument("--snapshot-dir", type=Path, default=DEFAULT_SNAPSHOT_DIR)
    parser.add_argument(
        "--skip-snapshot", action="store_true", help="跳过 SQL 快照（不建议）"
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    from app.db import engine

    try:
        if args.apply and not args.skip_snapshot:
            stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
            snapshot = write_snapshot(
                engine, args.snapshot_dir / f"snapshot-settlement-{stamp}.sql"
            )
            print(f"已导出迁移快照：{snapshot}")
        executed = migrate(engine, upload_dir=args.upload_dir, apply=args.apply)
    except MigrationError as exc:
        print(f"迁移已中止：{exc}", file=sys.stderr)
        return 1
    if not args.apply:
        print("演练完成，未写入数据库。确认无误后加 --apply 执行。")
        return 0
    if not executed:
        print("数据库已是商号结构，无需迁移。")
        return 0
    for statement in executed:
        print(f"已执行：{statement}")
    print("迁移完成。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
