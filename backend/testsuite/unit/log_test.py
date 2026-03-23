import logging

from logging_utils import JsonFormatter, get_request_id, reset_request_id, set_request_id


def test_request_id_context_round_trip():
    token = set_request_id("req-123")
    assert get_request_id() == "req-123"
    reset_request_id(token)
    assert get_request_id() == "-"


def test_json_formatter_includes_extra_fields():
    token = set_request_id("req-999")
    try:
        formatter = JsonFormatter()
        record = logging.LogRecord(
            name="ai-orchestrator",
            level=logging.INFO,
            pathname=__file__,
            lineno=10,
            msg="hello",
            args=(),
            exc_info=None,
        )
        record.user_email = "user@example.com"
        text = formatter.format(record)
        assert '"request_id": "req-999"' in text
        assert '"user_email": "user@example.com"' in text
        assert '"message": "hello"' in text
    finally:
        reset_request_id(token)
