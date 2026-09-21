import logging

from app.logging_config import RequestIdFilter, configure_logging, get_logger, request_id_var


def test_configure_logging_is_idempotent():
    logger = get_logger()
    configure_logging()
    before = list(logger.handlers)

    configure_logging()

    assert list(logger.handlers) == before
    assert logger.level != logging.NOTSET
    assert any(type(handler).__name__ == "StreamHandler" for handler in before)
    assert any(type(handler).__name__ == "RotatingFileHandler" for handler in before)


def test_request_id_filter_injects_current_request_id():
    token = request_id_var.set("req-123")
    record = logging.LogRecord(
        name="fruits_ana",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="hello",
        args=(),
        exc_info=None,
    )
    try:
        assert RequestIdFilter().filter(record) is True
        assert record.request_id == "req-123"
    finally:
        request_id_var.reset(token)

