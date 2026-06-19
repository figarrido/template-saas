import { z } from 'zod';
import { sharedClient, sharedDescriptions, sharedExamples, sharedServer } from './shared.js';
import type { SurfaceSchema } from './describe.js';

// `apps/admin` is intentionally stricter than `apps/web`:
//   - No PostHog client (admin is not analytics-instrumented).
//   - Tighter CSP enforced separately in next.config.js.
//   - Cross-tenant Drizzle access only — separate DB connection string.
export const adminServer = {
  ...sharedServer,
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  MAIL_PROVIDER: z.enum(['resend', 'smtp']).default('smtp'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
  ADMIN_DATABASE_URL: z.string().url(),
};

export const adminClient = {
  ...sharedClient,
  NEXT_PUBLIC_SITE_URL: z.string().url(),
};

export const adminSchema: SurfaceSchema = {
  surface: 'admin',
  server: adminServer,
  client: adminClient,
  examples: {
    ...sharedExamples,
    ADMIN_DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54422/postgres',
    MAIL_PROVIDER: 'smtp',
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: '54425',
    NEXT_PUBLIC_SITE_URL: 'http://localhost:3001',
  },
  descriptions: {
    ...sharedDescriptions,
    ADMIN_DATABASE_URL: 'Direct Postgres connection used by Drizzle. Service-role only.',
    MAIL_PROVIDER: '`smtp` in dev, `resend` in prod.',
    NEXT_PUBLIC_SITE_URL: 'Admin origin (separate from web).',
  },
};
