import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Generates database.types.ts by calling the already-running postgres-meta
// HTTP API through Kong, avoiding a Docker pull on every invocation.
// Replaces `supabase gen types typescript --local` which spins up a separate
// postgres-meta container (different version tag → ECR rate-limit risk in CI).

const here = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(here, '..', 'src', 'types', 'database.types.ts');

const apiUrl =
  process.env.SUPABASE_API_URL ??
  process.env.API_URL ??
  'http://127.0.0.1:54421';

// Standard Supabase local-dev service-role key — not a secret, same on every
// local project. Override via SUPABASE_SERVICE_ROLE_KEY if needed.
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const res = await fetch(
  `${apiUrl}/pg/generators/typescript?included_schemas=public`,
  { headers: { Authorization: `Bearer ${serviceRoleKey}` } },
);

if (!res.ok) {
  console.error(`postgres-meta returned ${res.status} ${res.statusText}`);
  console.error('Is `pnpm exec supabase start` running?');
  process.exit(1);
}

const types = await res.text();
writeFileSync(outputPath, types, 'utf8');
console.warn('database.types.ts generated');
