import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// drizzle-kit cannot introspect Supabase's `auth` schema cleanly (some
// functional indexes have null expressions in pg_catalog). We keep
// schemaFilter to `public` and patch the output to define a minimal
// `auth.users` reference so foreign-key declarations resolve.

export function patchIntrospectOutput(drizzleDir: string): void {
  const schemaPath = resolve(drizzleDir, 'schema.ts');
  const relationsPath = resolve(drizzleDir, 'relations.ts');

  let schema = readFileSync(schemaPath, 'utf8');

  // 1. Add `pgSchema` to the drizzle-orm/pg-core import list (idempotent).
  schema = schema.replace(
    /import\s*\{([^}]+)\}\s*from\s*"drizzle-orm\/pg-core"\s*;?/,
    (_match, names) => {
      const set = new Set(
        names
          .split(',')
          .map((n: string) => n.trim())
          .filter(Boolean),
      );
      set.add('pgSchema');
      return `import { ${Array.from(set).join(', ')} } from "drizzle-orm/pg-core";`;
    },
  );

  // 2. Inject the auth.users reference once, right after the import block.
  const authBlock = `
// Minimal reference to Supabase's auth.users so FK columns resolve.
// Owned by Supabase Auth — never migrate from this codebase.
const authSchema = pgSchema("auth");
export const authUsers = authSchema.table("users", {
  id: uuid().primaryKey().notNull(),
});
`;
  if (!schema.includes('authUsers = authSchema.table')) {
    const importBlockEnd = schema.search(/\n\n(?!import)/);
    const insertAt = importBlockEnd > 0 ? importBlockEnd : 0;
    schema = schema.slice(0, insertAt) + authBlock + schema.slice(insertAt);
  }

  // 3. Rewrite `users.id` (FK targets) → `authUsers.id`.
  schema = schema.replace(
    /\bforeignColumns:\s*\[\s*users\.id\s*\]/g,
    'foreignColumns: [authUsers.id]',
  );

  writeFileSync(schemaPath, schema, 'utf8');

  // 4. relations.ts references `usersInAuth` — rewrite to `authUsers`.
  let relations = readFileSync(relationsPath, 'utf8');
  relations = relations.replace(/\busersInAuth\b/g, 'authUsers');
  writeFileSync(relationsPath, relations, 'utf8');
}
