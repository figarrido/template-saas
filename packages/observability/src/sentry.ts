import * as Sentry from '@sentry/node';

export type InitSentryOptions = {
  service: string;
  dsn?: string;
  env?: string;
  release?: string;
  /** Sample rate for performance traces. 0 = disabled. */
  tracesSampleRate?: number;
};

/**
 * Initialize Sentry. Guarded by NODE_ENV === 'production' per
 * docs/architecture/06-observability.md — local + CI runs do not ship
 * errors anywhere. Also no-ops if no DSN is configured.
 *
 * Sentry consumes OTel spans (skipPerformanceInstrumentation flag below) so
 * the SDK is not duplicating tracing work.
 */
export function initSentry({
  service,
  dsn = process.env.SENTRY_DSN,
  env = process.env.NODE_ENV ?? 'development',
  release = process.env.RELEASE,
  tracesSampleRate = 0,
}: InitSentryOptions): void {
  if (env !== 'production' || !dsn) return;

  Sentry.init({
    dsn,
    environment: env,
    release,
    serverName: service,
    tracesSampleRate,
    // Tracing happens via OpenTelemetry (initOtel); let Sentry consume those
    // spans rather than spinning up its own instrumentation surface.
    skipOpenTelemetrySetup: true,
  });
}

export { Sentry };
