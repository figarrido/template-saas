import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { patchIntrospectOutput } from './patch-introspect.js';

// Regenerate the Drizzle schema to a temp dir, run the same post-introspect
// patch the canonical `pnpm db:introspect` runs, then diff against the
// committed schema.ts + relations.ts.

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, '..');
const committedSchema = resolve(pkgRoot, 'src', 'drizzle', 'schema.ts');
const committedRelations = resolve(pkgRoot, 'src', 'drizzle', 'relations.ts');

const tmp = mkdtempSync(resolve(tmpdir(), 'drizzle-drift-'));
const configPath = resolve(tmp, 'drizzle.config.ts');

const dbUrl =
  process.env.WORKER_DATABASE_URL ??
  process.env.ADMIN_DATABASE_URL ??
  'postgresql://postgres:postgres@127.0.0.1:54422/postgres';

writeFileSync(
  configPath,
  `import type { Config } from 'drizzle-kit';
export default {
  schema: '${tmp}/schema.ts',
  out: '${tmp}',
  dialect: 'postgresql',
  dbCredentials: { url: '${dbUrl}' },
  schemaFilter: ['public'],
  introspect: { casing: 'preserve' },
} satisfies Config;
`,
  'utf8',
);

try {
  execFileSync('pnpm', ['exec', 'drizzle-kit', 'introspect', '--config', configPath], {
    cwd: pkgRoot,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
} catch (err) {
  console.error('drizzle-kit introspect failed', err);
  process.exit(1);
}

patchIntrospectOutput(tmp);

const freshSchema = readFileSync(resolve(tmp, 'schema.ts'), 'utf8');
const freshRelations = readFileSync(resolve(tmp, 'relations.ts'), 'utf8');
const committedSchemaContent = readFileSync(committedSchema, 'utf8');
const committedRelationsContent = readFileSync(committedRelations, 'utf8');

// Print a unified diff on drift so failures are diagnosable from the CI log.
const showDiff = (committedPath: string, freshName: string) => {
  try {
    execFileSync('diff', ['-u', committedPath, resolve(tmp, freshName)], { stdio: 'inherit' });
  } catch {
    // `diff` exits 1 when files differ — expected; the diff is already printed.
  }
};

let drift = 0;
if (freshSchema !== committedSchemaContent) {
  console.error('src/drizzle/schema.ts is out of date. Run `pnpm db:introspect`.');
  showDiff(committedSchema, 'schema.ts');
  drift++;
}
if (freshRelations !== committedRelationsContent) {
  console.error('src/drizzle/relations.ts is out of date. Run `pnpm db:introspect`.');
  showDiff(committedRelations, 'relations.ts');
  drift++;
}

rmSync(tmp, { recursive: true, force: true });

if (drift > 0) process.exit(1);
console.warn('drizzle schema in sync');
