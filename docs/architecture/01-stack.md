# Stack

## Baseline

**Decision:** Next.js (App Router) + Supabase + Tailwind + Vercel, as a TypeScript monorepo.

**Why:**
- Already-shipping stack for the template's owner; minimizes ramp-up and matches Vercel's deploy story.
- Supabase covers Postgres + Auth + Storage + Edge Functions in one product, removing glue.
- App Router is the right long-term bet despite rougher edges than Pages Router for some patterns (auth, streaming, error boundaries).

**Tradeoffs:**
- Vendor concentration on Supabase (auth, DB, storage). Migrations off are doable (it's Postgres underneath) but Auth and RLS policies are the stickiest pieces.
- Vercel pricing curves steeply at scale (image optimization, function invocations). Acceptable; revisit if a derived product hits scale.
- Eating App Router's rough edges now avoids a Pages Router migration later.

**Related:** [02-data](./02-data.md), [03-auth](./03-auth.md), [08-platform](./08-platform.md)

---

## Admin vs. client app

**Decision:** Two separate Next.js apps (`apps/web`, `apps/admin`), each deployed as its own Vercel project, sharing `packages/*`.

**Why:**
- Clean isolation of attack surface. Admin enforces stricter app-layer access (see [03-auth](./03-auth.md)) and there's no risk of leaking admin code into the client bundle.
- Edge-layer controls (Cloudflare Access, Vercel Deployment Protection, IP allowlist) ship as recipes ([recipes/admin-edge-access.md](../recipes/admin-edge-access.md)), not template code.
- Shared `packages/ui` and `packages/db` keep feature parity cheap.

**Tradeoffs:**
- Two Vercel projects = two sets of env vars and two deploys. Acceptable; Turborepo handles incremental builds.
- Admin gets a dedicated subdomain (e.g., `admin.example.com`) — needs DNS planning from day one.
- Admin auth surface is separate; see [03-auth](./03-auth.md).

**Related:** [03-auth](./03-auth.md), [08-platform](./08-platform.md)
