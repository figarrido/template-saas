// Next.js calls this on cold-start in every runtime.
// @sentry/nextjs handles the runtime split internally; @template/observability's
// OTel SDK ships only to workers (services/*) where gRPC dependencies are
// available. Apps lean on @sentry/nextjs for trace + error.

import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NODE_ENV !== 'production' || !process.env.SENTRY_DSN) return;
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    release: process.env.RELEASE,
    tracesSampleRate: 0,
  });
}
