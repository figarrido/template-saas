"""structlog mirror of packages/observability/src/logger.ts.

Standard fields match the Node side — service, env, request_id, job_id,
org_id, user_id, trace_id, span_id, release — so log queries work
across the whole platform. docs/architecture/06-observability.md.
"""

from __future__ import annotations

import os
import logging
import structlog
from structlog.contextvars import bind_contextvars, clear_contextvars

REDACT_KEYS = {"password", "token", "secret", "authorization", "cookie"}


def _redactor(_logger, _method, event_dict):
    for key in list(event_dict.keys()):
        if key.lower() in REDACT_KEYS:
            event_dict[key] = "[REDACTED]"
    return event_dict


def configure_logger(service: str) -> structlog.stdlib.BoundLogger:
    logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.stdlib.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            _redactor,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )
    logger = structlog.get_logger(service)
    bind_contextvars(
        service=service,
        env=os.environ.get("NODE_ENV", "development"),
        release=os.environ.get("RELEASE"),
    )
    return logger


__all__ = ["configure_logger", "bind_contextvars", "clear_contextvars"]
