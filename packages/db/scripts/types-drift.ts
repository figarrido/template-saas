import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Regenerates database.types.ts to memory and diffs against the committed
// file. Wired to CI via `pnpm db:types:check`.

const here = dirname(fileURLToPath(import.meta.url));
const committedPath = resolve(here, '..', 'src', 'types', 'database.types.ts');

const fresh = execFileSync(
  'supabase',
  ['gen', 'types', 'typescript', '--local', '--schema', 'public'],
  { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
);

const committed = readFileSync(committedPath, 'utf8');

if (fresh !== committed) {
  console.error(
    'database.types.ts is out of date with the local schema. Run `pnpm db:types`.',
  );
  process.exit(1);
}

console.warn('database.types.ts in sync');
