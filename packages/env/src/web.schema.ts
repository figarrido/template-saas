import { z } from 'zod';
import { sharedClient, sharedDescriptions, sharedExamples, sharedServer } from './shared.js';
import type { SurfaceSchema } from './describe.js';

export const webServer = {
  ...sharedServer,
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  RESEND_API_KEY: z.string().min(1).optional(),
  MAIL_PROVIDER: z.enum(['resend', 'smtp']).default('smtp'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
  POSTHOG_PROJECT_API_KEY: z.string().optional(),
};

export const webClient = {
  ...sharedClient,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_HOST: z.string().url().optional(),
  NEXT_PUBLIC_SITE_URL: z.string().url(),
};

export const webSchema: SurfaceSchema = {
  surface: 'web',
  server: webServer,
  client: webClient,
  examples: {
    ...sharedExamples,
    STRIPE_SECRET_KEY: 'sk_test_replace_me',
    STRIPE_WEBHOOK_SECRET: 'whsec_replace_me',
    MAIL_PROVIDER: 'smtp',
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: '54325',
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_replace_me',
    NEXT_PUBLIC_POSTHOG_KEY: 'phc_replace_me',
    NEXT_PUBLIC_POSTHOG_HOST: 'https://us.i.posthog.com',
    NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
  },
  descriptions: {
    ...sharedDescriptions,
    STRIPE_SECRET_KEY: 'Stripe API secret key (test in dev).',
    STRIPE_WEBHOOK_SECRET: 'Stripe webhook signing secret. From `stripe listen` in dev.',
    RESEND_API_KEY: 'Resend API key. Absent in dev — SmtpProvider routes to InBucket.',
    MAIL_PROVIDER: '`smtp` in dev (InBucket), `resend` in prod.',
    SMTP_HOST: 'InBucket host. Written by `pnpm setup` from `supabase status`.',
    SMTP_PORT: 'InBucket port. Written by `pnpm setup` from `supabase status`.',
    UPSTASH_REDIS_REST_URL: 'Upstash Redis REST URL. Absent = rate-limit no-ops.',
    UPSTASH_REDIS_REST_TOKEN: 'Upstash Redis REST token.',
    POSTHOG_PROJECT_API_KEY: 'PostHog server-side project key (for OpenFeature provider).',
    NEXT_PUBLIC_SITE_URL: 'Public origin used for OAuth callbacks, emails, etc.',
  },
};
