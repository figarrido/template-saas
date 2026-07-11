---
'@template/auth': patch
'@template/billing': patch
'@template/config': patch
'@template/db': patch
'@template/email': patch
'@template/env': patch
'@template/flags': patch
'@template/jobs': patch
'@template/observability': patch
'@template/ui': patch
---

Dependency upgrade sweep. Take every out-of-range major except TypeScript 7
(blocked by typescript-eslint's `<6.1.0` peer): zod 3→4 (incl. the
Zod→JSON-Schema→Pydantic codegen, now on `z.toJSONSchema`), react-email 3→6,
@sentry/* 8→10, pino 9→10, posthog-node 4→5, otplib 12→13, @supabase/ssr
0.5→0.12, drizzle-kit 0.28→0.31, @hookform/resolvers 3→5, @t3-oss/env 0.11→0.13,
vitest 3→4, the eslint stack →10, React 18→19, Next 15→16, and Tailwind 3→4,
plus in-range minor/patch bumps.

Also: register the `@next/next` eslint plugin in the shared preset (was declared
but never wired, breaking admin lint), wire react-hooks rules into the presets,
and drop 16 unused dependencies across these packages.
