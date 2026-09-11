"""商号统一命名：去掉「单」前缀与空白（ADR-016）。"""

from app.services.merchant_no_naming import merchant_no_display, normalize_merchant_no


def test_normalize_strips_single_prefix():
    assert normalize_merchant_no("单637") == "637"
    assert normalize_merchant_no("单624") == "624"
    assert normalize_merchant_no("单单637") == "637"


def test_normalize_keeps_plain_numbers():
    assert normalize_merchant_no("640") == "640"
    assert normalize_merchant_no("626") == "626"


def test_normalize_removes_whitespace_and_full_width():
    assert normalize_merchant_no("单 624") == "624"
    assert normalize_merchant_no(" 单\n637 ") == "637"
    assert normalize_merchant_no("６４０") == "640"


def test_normalize_uppercases_letters():
    assert normalize_merchant_no("sn637") == "SN637"


def test_normalize_falls_back_for_empty_values():
    assert normalize_merchant_no(None) is None
    assert normalize_merchant_no("   ") is None
    assert normalize_merchant_no("单") == "单"


def test_merchant_no_display_prefers_stored_value():
    assert merchant_no_display("单637", "637") == "637"
    assert merchant_no_display("单637", None) == "637"
    assert merchant_no_display(None, None) is None
