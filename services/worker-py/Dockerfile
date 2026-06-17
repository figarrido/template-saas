FROM python:3.12-bookworm-slim AS base
COPY --from=ghcr.io/astral-sh/uv:0.5.7 /uv /usr/local/bin/uv

FROM base AS deps
WORKDIR /app
COPY services/worker-py/pyproject.toml services/worker-py/uv.lock* ./
RUN uv sync --frozen --no-install-project

FROM base AS runtime
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PATH="/app/.venv/bin:${PATH}"
COPY --from=deps /app/.venv /app/.venv
COPY services/worker-py/src ./src
COPY services/worker-py/jobs_schemas ./jobs_schemas
EXPOSE 8082
CMD ["python", "-m", "worker.main"]
