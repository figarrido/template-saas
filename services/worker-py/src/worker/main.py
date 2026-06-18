"""Python worker entry point.

Mirrors services/worker-node — same retry curve, same envelope, same
trace propagation across pgmq via the envelope's traceparent field.
docs/architecture/05-jobs.md.
"""

from __future__ import annotations

import asyncio
import json
import signal
from typing import Any

import psycopg
from psycopg.rows import dict_row

from .settings import Settings
from .logger import configure_logger, bind_contextvars
from .health import HealthState, health_server

DEFAULT_BACKOFF_SECONDS = [30, 120, 600, 3600, 21_600]
DEFAULT_MAX_ATTEMPTS = 5
VISIBILITY_TIMEOUT_SECONDS = 60
POLL_INTERVAL_SECONDS = 2.0


async def _process(conn, queue: str, row: dict[str, Any], log, registry) -> None:
    envelope = row["message"]
    name: str = envelope["name"]
    attempt = int(envelope.get("attempt", 0)) + 1

    bind_contextvars(job_id=str(row["msg_id"]), job_name=name)
    handler = registry.get(name)
    if handler is None:
        log.error("no handler for job, archiving", name=name, msg_id=row["msg_id"])
        await conn.execute("select pgmq.archive(%s::text, %s::bigint)", (queue, row["msg_id"]))
        return

    try:
        await handler(envelope.get("payload"), {"attempt": attempt, "msg_id": row["msg_id"]})
        await conn.execute("select pgmq.delete(%s::text, %s::bigint)", (queue, row["msg_id"]))
        log.info("job ok", attempt=attempt)
    except Exception as err:  # noqa: BLE001
        log.error("job failed", err=str(err), attempt=attempt)
        if attempt >= DEFAULT_MAX_ATTEMPTS:
            await conn.execute("select pgmq.archive(%s::text, %s::bigint)", (queue, row["msg_id"]))
            return
        backoff = DEFAULT_BACKOFF_SECONDS[
            min(attempt - 1, len(DEFAULT_BACKOFF_SECONDS) - 1)
        ]
        next_envelope = {**envelope, "attempt": attempt}
        await conn.execute("select pgmq.delete(%s::text, %s::bigint)", (queue, row["msg_id"]))
        await conn.execute(
            "select pgmq.send(%s::text, %s::jsonb, %s::integer)",
            (queue, json.dumps(next_envelope), backoff),
        )


def _empty_registry() -> dict[str, Any]:
    """Default registry — derived projects replace via worker.registry import."""
    return {}


async def run() -> None:
    settings = Settings()
    log = configure_logger("worker-py")
    queues = [q.strip() for q in settings.WORKER_QUEUES.split(",") if q.strip()]

    try:
        from worker.registry import REGISTRY  # type: ignore[attr-defined]

        registry = REGISTRY
    except (ImportError, AttributeError):
        registry = _empty_registry()

    state = HealthState()
    stop_event = asyncio.Event()

    def _on_signal(sig):
        log.warning("received signal, draining", sig=sig)
        state.set_draining()
        stop_event.set()

    loop = asyncio.get_event_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, _on_signal, sig.name)

    async with health_server(state, settings.WORKER_HEALTH_PORT):
        log.info("worker starting", queues=queues, port=settings.WORKER_HEALTH_PORT)
        async with await psycopg.AsyncConnection.connect(
            settings.WORKER_DATABASE_URL, autocommit=True, row_factory=dict_row
        ) as conn:
            while not state.healthy is False and not stop_event.is_set():
                processed_any = False
                for queue in queues:
                    if stop_event.is_set():
                        break
                    async with conn.cursor() as cur:
                        await cur.execute(
                            "select msg_id, read_ct, message from pgmq.read(%s, %s, 1)",
                            (queue, VISIBILITY_TIMEOUT_SECONDS),
                        )
                        rows = await cur.fetchall()
                    for row in rows:
                        processed_any = True
                        await _process(conn, queue, row, log, registry)
                if not processed_any:
                    try:
                        await asyncio.wait_for(stop_event.wait(), POLL_INTERVAL_SECONDS)
                    except asyncio.TimeoutError:
                        pass

        # Drain window
        try:
            await asyncio.wait_for(stop_event.wait(), settings.SHUTDOWN_GRACE_SECONDS)
        except asyncio.TimeoutError:
            log.warning("drain window expired")


if __name__ == "__main__":
    asyncio.run(run())
