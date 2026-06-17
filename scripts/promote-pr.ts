#!/usr/bin/env -S tsx
import { execFileSync } from 'node:child_process';

// docs/architecture/08-platform.md § Environments topology:
// "Manual promote path: pnpm supabase:promote-pr applies a PR's migration
// set to dev-shared for authors who need it live before merge. Coordinated;
// documented."
//
// Requires SUPABASE_DB_PASSWORD and SUPABASE_PROJECT_REF env vars to point
// at the dev-shared project. Refuses to run against a prod-shaped ref.

const ref = process.env.SUPABASE_PROJECT_REF;
const password = process.env.SUPABASE_DB_PASSWORD;
if (!ref) throw new Error('SUPABASE_PROJECT_REF must point at the dev-shared Supabase project');
if (!password) throw new Error('SUPABASE_DB_PASSWORD is required');
if (ref.includes('prod') || ref.includes('production')) {
  throw new Error('Refusing to promote against a prod-shaped project ref');
}

console.warn(`▸ pushing migrations to dev-shared (${ref})`);
execFileSync(
  'pnpm',
  [
    'exec',
    'supabase',
    'db',
    'push',
    '--project-ref',
    ref,
    '--password',
    password,
  ],
  { stdio: 'inherit' },
);
console.warn('✔ migrations applied to dev-shared');
