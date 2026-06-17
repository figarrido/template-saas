import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { patchIntrospectOutput } from './patch-introspect.js';

const here = dirname(fileURLToPath(import.meta.url));
patchIntrospectOutput(resolve(here, '..', 'src', 'drizzle'));
console.warn('post-introspect: patched auth.users reference + relations');
