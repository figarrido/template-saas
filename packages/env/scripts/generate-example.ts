import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderEnvExample } from '../src/describe.js';
import { targets } from './targets.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');

for (const target of targets) {
  const out = resolve(repoRoot, target.outputPath);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, renderEnvExample(target.schema), 'utf8');
  console.warn(`wrote ${target.outputPath}`);
}
