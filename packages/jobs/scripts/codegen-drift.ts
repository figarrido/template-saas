import { execSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate } from './generate-python-schemas.js';

// Regenerate into a temp dir; diff against services/worker-py/jobs_schemas/.

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const committed = resolve(repoRoot, 'services', 'worker-py', 'jobs_schemas');

const tmp = mkdtempSync(resolve(tmpdir(), 'jobs-drift-'));
try {
  await generate(tmp);
  let drift = 0;
  let committedFiles: string[] = [];
  try {
    committedFiles = readdirSync(committed);
  } catch {
    // First run before services/worker-py exists — accept that case.
  }
  const freshFiles = readdirSync(tmp);
  const all = new Set([...committedFiles, ...freshFiles]);
  for (const file of all) {
    if (!file.endsWith('.py')) continue;
    const a = read(resolve(committed, file));
    const b = read(resolve(tmp, file));
    if (a !== b) {
      console.error(`drift in jobs_schemas/${file} — run \`pnpm jobs:codegen\``);
      drift++;
    }
  }
  if (drift > 0) process.exit(1);
  console.warn('jobs python schemas in sync');
} finally {
  rmSync(tmp, { recursive: true, force: true });
  void execSync; // keep import-only if execSync goes unused after edits
}

function read(p: string): string | null {
  try {
    return readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}
