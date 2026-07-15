import type { Config } from 'drizzle-kit';

// Drizzle introspection runs against the live local Supabase DB. The
// resulting schema is committed at src/drizzle/schema.ts. CI gate
// (`pnpm db:introspect:check`) regenerates to a temp path and fails on diff.
export default {
  schema: './src/drizzle/schema.ts',
  out: './src/drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    // Schema tooling connects as the OWNER, not the app_service runtime role:
    // introspection must see every object in `public`, and app_service is
    // deliberately scoped to DML on the app's own tables. `SUPABASE_DB_URL` is
    // an optional owner override (e.g. to introspect a remote DB); the default
    // is the local owner connection.
    url:
      process.env.SUPABASE_DB_URL ??
      'postgresql://postgres:postgres@127.0.0.1:54422/postgres',
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
