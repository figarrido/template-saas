# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase. **This repo is multi-context.**

## Before exploring, read these

- **`CONTEXT-MAP.md`** at the repo root — it declares the repo multi-context and lists each resolved context plus where its `CONTEXT.md` lives. Read the context(s) relevant to the topic you're working on.
- **`CONTEXT.md`** for each relevant context. Today the only resolved context is **Platform (shared)** at the repo root `CONTEXT.md`; per-surface contexts are added lazily and registered in the map.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in. Start with the root `docs/adr/` (system-wide decisions); when a context has its own `CONTEXT.md`, also check the `docs/adr/` beside it (e.g. `apps/web/docs/adr/`).

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

This is a pnpm monorepo (`apps/`, `services/`, `packages/`), not a `src/<context>/` layout. The multi-context machinery maps onto it like so:

```
/
├── CONTEXT-MAP.md                      ← declares multi-context; lists contexts
├── CONTEXT.md                          ← Platform (shared) glossary — the one resolved context today
├── docs/adr/                           ← system-wide decisions (0001–0005)
├── apps/
│   ├── web/      [CONTEXT.md + docs/adr/ added lazily if web vocab diverges]
│   └── admin/    [CONTEXT.md + docs/adr/ added lazily if admin vocab diverges]
├── services/
│   ├── worker-node/   [lazy]
│   └── worker-py/     [lazy]
└── packages/          [lazy, per library]
```

A candidate context (see `CONTEXT-MAP.md`) becomes real only once it has its own `CONTEXT.md`. Until then, its vocabulary lives in the shared root glossary.

## Use the glossary's vocabulary

When your output names a domain concept (an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in the relevant `CONTEXT.md`. Don't drift to synonyms the glossary explicitly lists under `_Avoid_`.

If the concept you need isn't in any glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0004 (auto-link identities on verified email) — but worth reopening because…_
