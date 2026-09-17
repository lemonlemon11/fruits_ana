"""把 ``tickets/`` 下的品牌结算单批量导入，供开发期重建后重新灌数据。

- 只读 ``tickets/<品牌>/*.xlsx``；``润控金象`` 本期不做，``.xls`` 老格式跳过；
- 品牌默认取目录名，个别「目录与内容不符」的文件用 ``FILE_BRAND_OVERRIDES`` 显式纠正
  （确认单 C3：品牌以人工选择为准，这里就是人工选择的结果）；
- 同商号重复文件按 ``overwrite`` 处理，后导入的覆盖先导入的（确认单 C4 的现有语义）；
- 默认演练：只打印将要导入的文件与品牌；加 ``--apply`` 才写库。

用法（在 ``backend`` 目录）：

    .venv/bin/python scripts/load_tickets.py                  # 演练
    .venv/bin/python scripts/load_tickets.py --apply          # 写库
"""

from __future__ import annotations

import sys
from pathlib import Path

from app.db import SessionLocal
from app.models import EntryFieldOption
from app.services.import_service import import_file


TICKETS_DIR = Path(__file__).resolve().parents[2] / "tickets"
BRAND_BY_DIRECTORY = {"香香": "香香", "宝贝": "宝贝", "晴牌": "晴牌"}
FILE_BRAND_OVERRIDES = {
    # 确认单 C3：这份文件放在香香目录，但内容是宝贝的单。
    "642结算单（宝贝L005）(1)+清关(2).xlsx": "宝贝",
}
BRANDS = ("香香", "宝贝", "晴牌")


def collect_files() -> list[tuple[Path, str]]:
    """返回按品牌、文件名排序的 (文件, 品牌) 列表。"""

    found: list[tuple[Path, str]] = []
    for directory, brand in BRAND_BY_DIRECTORY.items():
        for path in sorted((TICKETS_DIR / directory).glob("*.xlsx")):
            found.append((path, FILE_BRAND_OVERRIDES.get(path.name, brand)))
    found.sort(key=lambda item: (item[1], item[0].name))
    return found


def ensure_brand_options(db) -> None:
    """把品牌写进录单字段字典（field_key=brand），供导入页「先选品牌」使用。"""

    existing = {
        row.value
        for row in db.query(EntryFieldOption).filter(EntryFieldOption.field_key == "brand").all()
    }
    for order, brand in enumerate(BRANDS):
        if brand not in existing:
            db.add(EntryFieldOption(field_key="brand", value=brand, sort_order=order))
    db.commit()


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    apply = "--apply" in args
    files = collect_files()

    print(f"找到 {len(files)} 个 xlsx：")
    for path, brand in files:
        print(f"  [{brand}] {path.parent.name}/{path.name}")
    for path in sorted(TICKETS_DIR.glob("*/*.xls")):
        print(f"  跳过（老 .xls 格式，本期不支持）：{path.parent.name}/{path.name}")
    for directory in sorted(TICKETS_DIR.iterdir()):
        if directory.is_dir() and directory.name not in BRAND_BY_DIRECTORY:
            print(f"  跳过（本期不做的品牌目录）：{directory.name}/")

    if not apply:
        print("dry-run：加 --apply 写库")
        return 0

    db = SessionLocal()
    try:
        ensure_brand_options(db)
        for path, brand in files:
            result = import_file(db, path, path.name, overwrite=True, brand=brand)
            print(
                f"[{result.status}] {brand} {path.name} -> {result.merchant_no}"
                f" 明细{result.success_count} 警告{result.warning_count} 失败{result.failure_count}"
                + (f" {result.error_summary}" if result.error_summary else "")
            )
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
