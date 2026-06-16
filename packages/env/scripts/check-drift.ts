import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderEnvExample } from '../src/describe.js';
import { targets } from './targets.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');

let drift = 0;
for (const target of targets) {
  const path = resolve(repoRoot, target.outputPath);
  const expected = renderEnvExample(target.schema);
  let actual: string;
  try {
    actual = readFileSync(path, 'utf8');
  } catch {
    console.error(`missing ${target.outputPath} — run \`pnpm env:example\``);
    drift++;
    continue;
  }
  if (actual !== expected) {
    console.error(`drift in ${target.outputPath} — run \`pnpm env:example\``);
    drift++;
  }
}

if (drift > 0) process.exit(1);
console.warn('env examples in sync');
