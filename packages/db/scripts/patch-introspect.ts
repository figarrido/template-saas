import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// drizzle-kit cannot introspect Supabase's `auth` schema cleanly (some
// functional indexes have null expressions in pg_catalog). We keep
// schemaFilter to `public` and patch the output to define a minimal
// `auth.users` reference so foreign-key declarations resolve.
//
// drizzle-kit also returns tables in Postgres OID order, which differs
// between a fresh container (CI) and a reset container (local dev).
// We normalise by sorting pgTable blocks topologically (deps first) with
// alphabetical tie-breaking, and by sorting relations blocks alphabetically.
// This makes both `db:introspect` and `db:introspect:check` deterministic.

interface ExportBlock {
  name: string;
  text: string;
}

function extractExportBlocks(content: string, funcName: string): ExportBlock[] {
  const pattern = new RegExp(`^export const (\\w+) = ${funcName}\\(`, 'gm');
  const blocks: ExportBlock[] = [];
  let m: RegExpExecArray | null;

  while ((m = pattern.exec(content)) !== null) {
    const name = m[1]!;
    const start = m.index;
    let depth = 0;
    let i = start;
    for (; i < content.length; i++) {
      if (content[i] === '(') depth++;
      else if (content[i] === ')') {
        depth--;
        if (depth === 0) { i++; break; }
      }
    }
    if (i < content.length && content[i] === ';') i++;
    blocks.push({ name, text: content.slice(start, i) });
  }
  return blocks;
}

function getTableDependencies(blockText: string, tableNames: Set<string>): string[] {
  const deps = new Set<string>();
  const re = /foreignColumns:\s*\[(\w+)\./g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(blockText)) !== null) {
    const dep = m[1]!;
    if (tableNames.has(dep)) deps.add(dep);
  }
  return [...deps];
}

function topoSortBlocks(blocks: ExportBlock[]): ExportBlock[] {
  const names = new Set(blocks.map(b => b.name));
  const map = new Map(blocks.map(b => [b.name, b]));
  const inDeg = new Map<string, number>(blocks.map(b => [b.name, 0]));
  const adj = new Map<string, string[]>(blocks.map(b => [b.name, []]));

  for (const b of blocks) {
    for (const dep of getTableDependencies(b.text, names)) {
      adj.get(dep)!.push(b.name);
      inDeg.set(b.name, (inDeg.get(b.name) ?? 0) + 1);
    }
  }

  const queue = [...inDeg.entries()]
    .filter(([, d]) => d === 0)
    .map(([n]) => n)
    .sort();
  const result: ExportBlock[] = [];

  while (queue.length > 0) {
    const name = queue.shift()!;
    result.push(map.get(name)!);
    for (const neighbor of (adj.get(name) ?? []).sort()) {
      const d = (inDeg.get(neighbor) ?? 1) - 1;
      inDeg.set(neighbor, d);
      if (d === 0) {
        const idx = queue.findIndex(n => n > neighbor);
        queue.splice(idx === -1 ? queue.length : idx, 0, neighbor);
      }
    }
  }

  // Fallback to alphabetical if cycle detected (should not happen in practice)
  if (result.length !== blocks.length) {
    return blocks.slice().sort((a, b) => a.name.localeCompare(b.name));
  }
  return result;
}

function sortSchemaExports(schema: string): string {
  const first = /^export const \w+ = pgTable\(/m.exec(schema);
  if (!first) return schema;
  const header = schema.slice(0, first.index);
  const body = schema.slice(first.index);
  const blocks = extractExportBlocks(body, 'pgTable');
  const sorted = topoSortBlocks(blocks);
  return header + sorted.map(b => b.text).join('\n\n') + '\n';
}

// Sort the top-level properties inside a single relation block alphabetically.
// Each property starts at \n\t<word>: (single tab = top level; nested lines use \t\t).
function sortRelationBlockProps(blockText: string): string {
  const markerIdx = blockText.indexOf('=> ({');
  if (markerIdx === -1) return blockText;
  const afterMarker = markerIdx + '=> ({'.length;
  const closingIdx = blockText.lastIndexOf('\n}));');
  if (closingIdx === -1) return blockText;

  const prefix = blockText.slice(0, afterMarker);
  // propsContent: everything between => ({ and the final \n}));  (no trailing \n)
  const propsContent = blockText.slice(afterMarker, closingIdx);
  const suffix = blockText.slice(closingIdx); // starts with \n

  // Split at each \n\t<word> boundary (top-level property, not nested \t\t lines)
  const chunks = propsContent.split(/(?=\n\t\w)/).filter(c => c.length > 0);
  if (chunks.length <= 1) return blockText;

  const props = chunks.map(chunk => {
    const m = /^\n\t(\w+):/.exec(chunk);
    return { name: m?.[1] ?? '', text: chunk };
  });
  props.sort((a, b) => a.name.localeCompare(b.name));
  return prefix + props.map(p => p.text).join('') + suffix;
}

function sortRelationsExports(content: string): string {
  // Sort the import names from ./schema alphabetically
  const out = content.replace(
    /^(import \{)([^}]+)(\} from "\.\/schema";)/m,
    (_, open, names: string, close) => {
      const sorted = names.split(',').map(n => n.trim()).filter(Boolean).sort();
      return `${open} ${sorted.join(', ')} ${close}`;
    },
  );
  const first = /^export const \w+Relations = relations\(/m.exec(out);
  if (!first) return out;
  const header = out.slice(0, first.index);
  const body = out.slice(first.index);
  const blocks = extractExportBlocks(body, 'relations');
  // Sort within-block properties, then sort blocks alphabetically
  const normalised = blocks.map(b => ({ ...b, text: sortRelationBlockProps(b.text) }));
  normalised.sort((a, b) => a.name.localeCompare(b.name));
  return header + normalised.map(b => b.text).join('\n\n') + '\n';
}

export function patchIntrospectOutput(drizzleDir: string): void {
  const schemaPath = resolve(drizzleDir, 'schema.ts');
  const relationsPath = resolve(drizzleDir, 'relations.ts');

  let schema = readFileSync(schemaPath, 'utf8');

  // 1. Add `pgSchema` to the drizzle-orm/pg-core import list (sorted).
  schema = schema.replace(
    /import\s*\{([^}]+)\}\s*from\s*"drizzle-orm\/pg-core"\s*;?/,
    (_match, names: string) => {
      const items = new Set(names.split(',').map(n => n.trim()).filter(Boolean));
      items.add('pgSchema');
      return `import { ${[...items].sort().join(', ')} } from "drizzle-orm/pg-core";`;
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

  // 4. Sort pgTable blocks (topological + alphabetical) for determinism.
  schema = sortSchemaExports(schema);

  writeFileSync(schemaPath, schema, 'utf8');

  // 5. relations.ts: rewrite usersInAuth → authUsers, sort imports + blocks.
  let relations = readFileSync(relationsPath, 'utf8');
  relations = relations.replace(/\busersInAuth\b/g, 'authUsers');
  relations = sortRelationsExports(relations);
  writeFileSync(relationsPath, relations, 'utf8');
}
