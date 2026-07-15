# Recipe: secret rotation

Manual rotation runbook for the template's high-value secrets. This is the
default posture from [architecture/08-platform.md](../architecture/08-platform.md)
§ Env & secrets management: **native platform envs (Vercel + Railway + GitHub
Actions) are the source of truth**, and rotation is a checklist, not an
automated pipeline.

**When to graduate off this runbook:** the constraint in
[constraints/team.md](../constraints/team.md) and
[constraints/budget.md](../constraints/budget.md) sets the revisit threshold at
**3+ contributors _or_ a monthly rotation cadence**. At that point adopt a
centralized secrets manager — automated rotation rides in with it. See
`recipes/secrets-doppler.md`, `recipes/secrets-infisical.md`,
`recipes/secrets-1password.md`.

---

## High-value secrets and where they live

| Secret | Lives in | Rotated at (source) |
| --- | --- | --- |
| **`app_service` DB password** | `ADMIN_DATABASE_URL` (Vercel · admin), `WORKER_DATABASE_URL` (Railway · both workers), GitHub Actions secret (CI, if pointed at a shared DB) | Postgres (`ALTER ROLE`) |
| Supabase service-role key (`SUPABASE_SERVICE_ROLE_KEY`) | Vercel (web/admin), Railway | Supabase dashboard → API keys |
| Stripe webhook secret (`STRIPE_WEBHOOK_SECRET`) | Vercel, Railway | Stripe dashboard → Webhooks |
| Stripe secret key (`STRIPE_SECRET_KEY`) | Vercel, Railway | Stripe dashboard → API keys (roll) |
| Resend API key (`RESEND_API_KEY`) | Vercel, Railway | Resend dashboard → API keys |

> **Never log a DSN.** The `app_service` password is embedded in
> `ADMIN_DATABASE_URL` / `WORKER_DATABASE_URL`, so a connection string printed
> into an error or a log line leaks it. Keep Pino/structlog config from serializing
> connection strings, and prefer the pooler host. `.env.local` files are
> gitignored; keep it that way.

---

## The `app_service` DB password

`app_service` is the scoped Postgres role Drizzle connects as from `apps/admin`
and `services/*` (see [architecture/02-data.md](../architecture/02-data.md)
§ Query layer). The migration `*_app_service_role.sql` creates it **without a
password** — it exists but cannot authenticate until you provision one. Local
dev gets a throwaway password from `supabase/seed.sql`; every other environment
sets its own.

### First-time provisioning (per environment)

1. Generate a strong random password (32+ bytes):

   ```bash
   openssl rand -base64 32
   ```

2. Set it on the role. Run as an owner/admin connection (the Supabase dashboard
   SQL editor, or `psql` with the project's `postgres` connection string):

   ```sql
   alter role app_service with password '<generated>';
   ```

3. Put the password into each platform env, embedded in the DSN. Use the
   Supabase **pooler** host for runtime connections:

   ```
   postgresql://app_service:<generated>@<pooler-host>:6543/postgres
   ```

   - **Vercel** (admin project): set `ADMIN_DATABASE_URL`.
     `vercel env add ADMIN_DATABASE_URL production`
   - **Railway** (both workers): set `WORKER_DATABASE_URL`.
     `railway variables --set WORKER_DATABASE_URL=...`
   - **GitHub Actions** (only if a workflow talks to a shared DB): `gh secret set`.

4. Redeploy the surfaces so they pick up the new env.

`SUPABASE_DB_URL` (the owner connection) is a separate concern — it backs schema
tooling and the auth test harness, not runtime traffic. Rotate it via the
Supabase dashboard (project database password) and update wherever migrations
run from.

### Coordinated single-role rotation (default)

Postgres roles have exactly **one** password — there is no native staged/overlap
window like a managed secret store gives you. So rotation is a short coordinated
sequence, ordered to minimize the failure window:

1. Generate a new password (`openssl rand -base64 32`).
2. `alter role app_service with password '<new>';` (old password dies immediately).
3. Update the DSN in **every** location from the table above — Vercel, Railway,
   GitHub — to the new password.
4. Redeploy all surfaces (admin + both workers).

**The window:** between steps 2 and 4, an instance still running with the old
password gets connection failures on any *new* connection until its redeploy
lands. On free-tier deploys this is seconds-to-minutes and matches the
"rotation is infrequent" assumption in `constraints/team.md`. If that window is
unacceptable, use the A/B procedure below.

### Zero-downtime A/B rotation (upgrade — not implemented by default)

Adopt this only when continuous uptime makes the coordinated window
unacceptable. It trades one moving part (two roles to keep grant-synced) for a
rotation that never fails a live connection.

1. Create a second role identical to `app_service` — same `BYPASSRLS` and the
   same grants (copy the `grant`/`alter default privileges` block from
   `*_app_service_role.sql`):

   ```sql
   create role app_service_b with login bypassrls;
   -- ...repeat every grant app_service has, for app_service_b...
   ```

2. Serve on `app_service` (A). To rotate:
   - Set/rotate **B**'s password.
   - Flip `ADMIN_DATABASE_URL` / `WORKER_DATABASE_URL` to the **B** DSN and redeploy.
     A is still valid, so no connection fails during the cutover.
   - Once traffic is on B, rotate **A**'s password while it's idle.
3. Next rotation flips back to A. Track "which role is live" (an env var or a
   note in your ops doc) so you never rotate the role currently serving traffic.

Keeping A and B grant-synced is the cost: any migration that grants `app_service`
must grant the sibling too. That maintenance burden is exactly why the template
ships only the single-role default.

### Optional: `VALID UNTIL` as a forcing function

To turn silent non-rotation into a scheduled, visible event:

```sql
alter role app_service valid until '2026-12-31';
```

Login **hard-fails** at that timestamp — so only use it paired with a calendar
reminder and the steps above, never as the sole mechanism, or you buy a surprise
outage. Rotating the password resets nothing here; re-set `valid until` as part
of each rotation if you rely on it.

---

## Other secrets (summary)

- **Supabase service-role key / Stripe / Resend keys:** roll at the vendor
  dashboard, then update Vercel + Railway (+ GitHub Actions where used) and
  redeploy. Order updates so a half-applied rotation doesn't strand a running
  service on a dead key: roll the vendor secret, update platforms, redeploy,
  then invalidate the old secret at the vendor if the dashboard kept it live
  during the overlap.
- Boot-time env validation ([architecture/08-platform.md](../architecture/08-platform.md)
  § `packages/env`) will crash a surface that's missing a required secret — a
  visible deploy failure, not a silent 500 — but it can't catch a *partial*
  rotation where one platform updated and another didn't. Work top-to-bottom
  through the table and redeploy each surface.
