"""单号统一命名：系列识别与适配后单号（ADR-015）。"""

from app.services.order_no_naming import (
    UNKNOWN_SERIES,
    normalize_order_no,
    order_no_display,
    series_name,
)


def test_series_name_keeps_chinese_prefix():
    assert series_name("宝贝01") == "宝贝"
    assert series_name(" 香香L004 ") == "香香"
    assert series_name("626") == UNKNOWN_SERIES
    assert series_name(None) == UNKNOWN_SERIES
    assert series_name("") == UNKNOWN_SERIES


def test_normalize_pads_serial_to_three_digits():
    assert normalize_order_no("宝贝003") == "宝贝-003"
    assert normalize_order_no("宝贝01") == "宝贝-001"
    assert normalize_order_no("宝贝1") == "宝贝-001"
    assert normalize_order_no("香香2") == "香香-002"


def test_normalize_keeps_letter_prefix_and_separators_removed():
    assert normalize_order_no("宝贝L004") == "宝贝-L004"
    assert normalize_order_no("宝贝L4") == "宝贝-L004"
    assert normalize_order_no("宝贝-01") == "宝贝-001"
    assert normalize_order_no("宝贝 01") == "宝贝-001"
    assert normalize_order_no("宝贝_01 ") == "宝贝-001"


def test_normalize_handles_full_width_and_empty_values():
    assert normalize_order_no("宝贝００１") == "宝贝-001"
    assert normalize_order_no("宝贝") == "宝贝"
    assert normalize_order_no(None) is None
    assert normalize_order_no("   ") is None


def test_normalize_falls_back_to_raw_when_unrecognized():
    assert normalize_order_no("626") == "626"
    assert normalize_order_no("S-01") == "S-01"
    assert normalize_order_no("宝贝#1") == "宝贝#1"


def test_order_no_display_prefers_stored_value():
    assert order_no_display("宝贝01", "宝贝-001") == "宝贝-001"
    assert order_no_display("宝贝01", None) == "宝贝-001"
    assert order_no_display(None, None) is None
