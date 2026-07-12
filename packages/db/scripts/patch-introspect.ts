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

// Sort the members inside a single pgTable block's `(table) => { return { … } }`
// object alphabetically by key. drizzle-kit emits constraints/indexes/policies
// in Postgres OID order, which differs between a fresh container (CI) and a
// reset one (local) — most visibly the RLS pgPolicy entries. Sorting here makes
// the output deterministic regardless of row order. Multi-line members (e.g.
// foreignKey({ … })) stay intact: we only split at top-level `\n\t\t<key>:`
// boundaries (nested lines are indented deeper) and every member carries a
// trailing comma, so reordering is safe.
function sortTableBlockMembers(blockText: string): string {
  const marker = blockText.indexOf('=> {');
  if (marker === -1) return blockText;
  const retIdx = blockText.indexOf('return {', marker);
  if (retIdx === -1) return blockText;
  const objStart = retIdx + 'return {'.length;
  const closeIdx = blockText.indexOf('\n\t}', objStart);
  if (closeIdx === -1) return blockText;

  const prefix = blockText.slice(0, objStart);
  const membersContent = blockText.slice(objStart, closeIdx);
  const suffix = blockText.slice(closeIdx);

  const chunks = membersContent.split(/(?=\n\t\t\w)/).filter(c => c.length > 0);
  if (chunks.length <= 1) return blockText;

  const members = chunks.map(chunk => {
    const m = /^\n\t\t(\w+):/.exec(chunk);
    return { name: m?.[1] ?? '', text: chunk };
  });
  members.sort((a, b) => a.name.localeCompare(b.name));
  return prefix + members.map(m => m.text).join('') + suffix;
}

// Canonicalise every `pgPolicy(...)` to a minimal, stable shape:
//   pgPolicy("name", { as: …, for: …, to: [ … ] })
// dropping the `using` / `withCheck` SQL predicates. drizzle-kit 0.31's policy
// introspection is non-deterministic about those expressions — it races its
// parallel catalog fetches and sometimes emits them, sometimes not (and with
// varying trailing whitespace), which made `db:introspect:check` flap between
// pass and false drift for identical inputs. The predicates are descriptive
// only here — RLS is defined in raw-SQL migrations, not drizzle-kit migrations
// — and their real behaviour is covered by the RLS suite (`test:rls`).
// Comparing structure (command + roles), not the volatile expression text,
// makes the drift check deterministic.
function canonicalizePolicies(schema: string): string {
  return schema.replace(
    /pgPolicy\(\s*"([^"]+)"\s*,\s*\{([\s\S]*?)\}\s*\)/g,
    (_full, name: string, body: string) => {
      const pick = (re: RegExp) => re.exec(body)?.[1];
      const asVal = pick(/\bas:\s*"([^"]+)"/);
      const forVal = pick(/\bfor:\s*"([^"]+)"/);
      const toVal = pick(/\bto:\s*(\[[^\]]*\])/);
      const parts: string[] = [];
      if (asVal) parts.push(`as: "${asVal}"`);
      if (forVal) parts.push(`for: "${forVal}"`);
      if (toVal) parts.push(`to: ${toVal}`);
      return `pgPolicy("${name}", { ${parts.join(', ')} })`;
    },
  );
}

// Sort the members of an array-form table config `(table) => [ … ]`. drizzle-kit
// 0.31 switched from the `return { … }` object form (handled by
// sortTableBlockMembers) to this array form, and emits it in Postgres OID order
// — which differs between a fresh container (CI) and a reset one (local), so
// index / foreignKey / pgPolicy entries flap position. Sort by (name, text) for
// determinism. Returns null when the block is not array form so the caller can
// fall back to the legacy object-form sort.
function sortTableArrayMembers(blockText: string): string | null {
  const openTok = '(table) => [';
  const openIdx = blockText.indexOf(openTok);
  if (openIdx === -1) return null;
  const contentStart = openIdx + openTok.length;
  const closeIdx = blockText.lastIndexOf('\n]);');
  if (closeIdx <= contentStart) return null;

  const prefix = blockText.slice(0, contentStart);
  const content = blockText.slice(contentStart, closeIdx);
  const suffix = blockText.slice(closeIdx);

  // Elements are indented one tab; their nested lines use more tabs, so split
  // only at `\n\t` boundaries NOT followed by another tab.
  const chunks = content.split(/(?=\n\t(?!\t))/).filter(c => c.trim().length > 0);
  if (chunks.length <= 1) return blockText;

  const keyOf = (t: string) => `${/"([^"]+)"/.exec(t)?.[1] ?? ''} ${t}`;
  chunks.sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
  return prefix + chunks.join('') + suffix;
}

function sortSchemaExports(schema: string): string {
  const first = /^export const \w+ = pgTable\(/m.exec(schema);
  if (!first) return schema;
  const header = schema.slice(0, first.index);
  const body = schema.slice(first.index);
  const blocks = extractExportBlocks(body, 'pgTable');
  const normalised = blocks.map(b => ({
    ...b,
    text: sortTableArrayMembers(b.text) ?? sortTableBlockMembers(b.text),
  }));
  const sorted = topoSortBlocks(normalised);
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

  // 3b. Canonicalise pgPolicy(...) — drop the volatile using/withCheck
  //     predicates drizzle-kit 0.31 introspects non-deterministically.
  schema = canonicalizePolicies(schema);

  // 4. Sort pgTable blocks (topological + alphabetical) for determinism.
  schema = sortSchemaExports(schema);

  writeFileSync(schemaPath, schema, 'utf8');

  // 5. relations.ts: rewrite usersInAuth → authUsers, sort imports + blocks.
  let relations = readFileSync(relationsPath, 'utf8');
  relations = relations.replace(/\busersInAuth\b/g, 'authUsers');
  relations = sortRelationsExports(relations);
  writeFileSync(relationsPath, relations, 'utf8');
}
