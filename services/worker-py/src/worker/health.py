"""Lightweight ASGI health endpoint.

Railway polls GET /health. We return 200 while accepting jobs, 503 once
SIGTERM has triggered drain — matches the Node worker's contract.
"""

from __future__ import annotations

import asyncio
import contextlib
import uvicorn
from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route


class HealthState:
    healthy: bool = True

    def set_draining(self) -> None:
        self.healthy = False


def _build_app(state: HealthState) -> Starlette:
    async def health(_request):
        if state.healthy:
            return JSONResponse({"ok": True})
        return JSONResponse({"ok": False}, status_code=503)

    return Starlette(routes=[Route("/health", health, methods=["GET"])])


async def serve(state: HealthState, port: int) -> uvicorn.Server:
    config = uvicorn.Config(_build_app(state), host="0.0.0.0", port=port, log_level="warning")
    server = uvicorn.Server(config)
    asyncio.create_task(server.serve())
    return server


@contextlib.asynccontextmanager
async def health_server(state: HealthState, port: int):
    server = await serve(state, port)
    try:
        yield
    finally:
        server.should_exit = True
