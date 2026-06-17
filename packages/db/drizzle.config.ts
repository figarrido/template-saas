import type { Config } from 'drizzle-kit';

// Drizzle introspection runs against the live local Supabase DB. The
// resulting schema is committed at src/drizzle/schema.ts. CI gate
// (`pnpm db:introspect:check`) regenerates to a temp path and fails on diff.
export default {
  schema: './src/drizzle/schema.ts',
  out: './src/drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.WORKER_DATABASE_URL ??
      process.env.ADMIN_DATABASE_URL ??
      'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  },
  // Public schema only. drizzle-kit chokes on some Supabase-internal auth
  // indexes; the `pnpm db:introspect` script post-processes the output to
  // inject a minimal `authUsers` reference for FK resolution. See
  // scripts/post-introspect.ts.
  schemaFilter: ['public'],
  introspect: {
    casing: 'preserve',
  },
} satisfies Config;
