import { z } from 'zod';

// Env fragments shared across every surface (web, admin, worker-node, worker-py).
// Surface schemas compose these via spread; do NOT mutate.
export const sharedServer = {
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  RELEASE: z.string().optional(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SENTRY_DSN: z.string().url().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
};

export const sharedClient = {
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
};

export const sharedDescriptions: Record<string, string> = {
  NODE_ENV: 'Runtime mode. Sentry init is guarded by `production`.',
  RELEASE: 'Release tag surfaced in logs / Sentry / OTel resource attrs.',
  SUPABASE_URL: 'Supabase project URL (server-only). Local: from `supabase status`.',
  SUPABASE_SERVICE_ROLE_KEY: 'Service-role key. Server/admin/workers only — NEVER ship to a client.',
  SENTRY_DSN: 'Sentry DSN. Absent = no-op in any environment.',
  OTEL_EXPORTER_OTLP_ENDPOINT: 'OTel collector endpoint. Absent = stdout / no-op.',
  NEXT_PUBLIC_SUPABASE_URL: 'Supabase URL exposed to the browser.',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'Supabase anon key exposed to the browser (RLS-bound).',
};

export const sharedExamples: Record<string, string> = {
  NODE_ENV: 'development',
  SUPABASE_URL: 'http://127.0.0.1:54421',
  SUPABASE_SERVICE_ROLE_KEY: 'eyJ...replace-me',
  SENTRY_DSN: 'https://examplePublicKey@o0.ingest.sentry.io/0',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54421',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'eyJ...replace-me',
};
