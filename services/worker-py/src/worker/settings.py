"""Env validation. Mirrors packages/env/src/worker-py.schema.ts.

The TS schema is the source of truth — keep the field names in sync. CI
will catch drift via the env-drift check that compares the generated
.env.example file.
"""

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    NODE_ENV: str = Field(default="development")
    RELEASE: str | None = Field(default=None)

    SUPABASE_URL: str
    SUPABASE_SERVICE_ROLE_KEY: str
    SENTRY_DSN: str | None = Field(default=None)
    OTEL_EXPORTER_OTLP_ENDPOINT: str | None = Field(default=None)

    WORKER_DATABASE_URL: str
    WORKER_HEALTH_PORT: int = Field(default=8082)
    WORKER_QUEUES: str = Field(default="default")
    SHUTDOWN_GRACE_SECONDS: int = Field(default=30)

    model_config = SettingsConfigDict(env_file=".env.local", env_file_encoding="utf-8", extra="ignore")
