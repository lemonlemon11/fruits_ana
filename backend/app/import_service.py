"""兼容旧导入路径，业务实现位于 :mod:`app.services.import_service`。"""

from .services.import_service import ImportResult, ImportService, import_file, import_sales_file

__all__ = ["ImportResult", "ImportService", "import_file", "import_sales_file"]
