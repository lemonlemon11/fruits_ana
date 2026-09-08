"""数据库初始化命令。"""

from . import models  # noqa: F401  # 确保所有模型注册到 Base.metadata
from .db import Base, init_db


def main() -> None:
    """创建当前版本模型对应的数据库表。"""

    init_db()
    print(", ".join(sorted(Base.metadata.tables)))


if __name__ == "__main__":
    main()
