import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Regenerates database.types.ts via the postgres-meta HTTP API (already
// running after `supabase start`) and diffs against the committed file.
// Uses the same HTTP call as scripts/gen-types.ts so both paths stay in sync.
// Avoids `supabase gen types --local` which pulls a separate Docker image
// (different version tag from the running stack → ECR rate-limit risk in CI).

const here = dirname(fileURLToPath(import.meta.url));
const committedPath = resolve(here, '..', 'src', 'types', 'database.types.ts');

const apiUrl =
  process.env.SUPABASE_API_URL ??
  process.env.API_URL ??
  'http://127.0.0.1:54421';

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

const fresh = await res.text();
const committed = readFileSync(committedPath, 'utf8');

if (fresh !== committed) {
  console.error(
    'database.types.ts is out of date with the local schema. Run `pnpm db:types`.',
  );
  // Show what actually differs so failures are diagnosable from the CI log.
  const freshPath = resolve(tmpdir(), 'database.types.fresh.ts');
  writeFileSync(freshPath, fresh);
  try {
    execFileSync('diff', ['-u', committedPath, freshPath], { stdio: 'inherit' });
  } catch {
    // `diff` exits 1 when files differ — expected; the diff is already printed.
  }
  rmSync(freshPath, { force: true });
  process.exit(1);
}

console.warn('database.types.ts in sync');
