# Config

## `packages/config` content

**Decision:** `packages/config` ships four subdirectories, each exposing presets that surfaces extend.

**Layout:**

```
packages/config/
  tsconfig/
    tsconfig.base.json
    tsconfig.next.json
    tsconfig.node.json
    tsconfig.react.json
  eslint/
    base.js
    next.js
    node.js
    react.js
  prettier/
    prettier.config.js
  tailwind/
    preset.ts
```

**Specifics:**

- **tsconfig** — base sets strictness per [TypeScript strictness](#typescript-strictness) below. Surface-specific configs add `jsx`, `lib`, `moduleResolution`, etc.
- **eslint** — flat config (eslint 9+). Includes the `getServiceClient` import-ban rule in the `next.js` preset (applied to `apps/web/**`); see [02-data](./02-data.md#query-layer).
- **prettier** — single shared config: 100-char line width, semi, single quotes, trailing commas.
- **tailwind** — base preset (colors, spacing, typography scale, breakpoints). `apps/web`, `apps/admin`, and `packages/ui` extend it.

**Tradeoffs:**
- Updating a shared config requires bumping every consumer. Mitigated by `workspace:*` deps so the bump is automatic on `pnpm install`.

**Related:** [02-data](./02-data.md), [07-frontend](./07-frontend.md), [08-platform](./08-platform.md)

---

## TypeScript strictness

**Decision:** `strict: true` + `noUncheckedIndexedAccess: true` + `noImplicitOverride: true`. **Skip `exactOptionalPropertyTypes`.**

**Why:**
- `strict: true` — non-negotiable.
- `noUncheckedIndexedAccess` catches `arr[0]` being potentially undefined, which is a real source of runtime bugs in App Router code where Server Components freely index untyped JSON.
- `noImplicitOverride` is cheap; surfaces accidental overrides in class hierarchies (Drizzle schemas, etc.).
- `exactOptionalPropertyTypes` interacts badly with too many libs (React props, Zod inference); ergonomic cost exceeds the safety added.

**Tradeoffs:**
- `noUncheckedIndexedAccess` adds friction in test fixtures and quick-and-dirty code. Worth it; the workaround (`arr[0]!`) is explicit, which is the point.

**Related:** [02-data](./02-data.md)
