import pytest
from worker.logger import REDACT_KEYS, _redactor


@pytest.mark.parametrize("key", list(REDACT_KEYS))
def test_redacts_sensitive_keys(key):
    event = {key: "super-secret", "message": "hello"}
    result = _redactor(None, None, event)
    assert result[key] == "[REDACTED]"
    assert result["message"] == "hello"


def test_non_sensitive_keys_pass_through():
    event = {"user_id": "abc", "org_id": "xyz"}
    result = _redactor(None, None, event)
    assert result == {"user_id": "abc", "org_id": "xyz"}


def test_redaction_is_case_insensitive():
    event = {"Password": "s3cr3t"}
    result = _redactor(None, None, event)
    assert result["Password"] == "[REDACTED]"
