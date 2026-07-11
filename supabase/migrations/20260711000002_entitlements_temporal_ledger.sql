-- Entitlements temporal ledger — ADR 0007.
-- Converts entitlements from a one-row-per-(org,key) projection into an
-- append-only ledger of validity periods. One forward-only migration.

-- 1. Closed, enum-backed entitlement key set. Template ships only the
--    reference `pro` key; derived projects ADD VALUE in later migrations.
--    (ADR 0007 § "Entitlement keys are a closed, enum-backed set")
create type public.entitlement_key as enum ('pro');

-- 2. Drop the current-state uniqueness so billing + grant periods coexist.
alter table public.entitlements
  drop constraint entitlements_organization_id_key_key;

-- 3. Retype key from free text to the enum (existing rows hold 'pro').
alter table public.entitlements
  alter column key type public.entitlement_key using key::public.entitlement_key;

-- 4. Ledger columns: when the period starts, and (for Comps) who granted it.
alter table public.entitlements
  add column starts_at timestamptz not null default now();
alter table public.entitlements
  add column granted_by uuid references auth.users(id) on delete set null;

-- 5. Index for the temporal read (org + key + expiry window).
create index entitlements_org_key_expires_idx
  on public.entitlements (organization_id, key, expires_at);

-- 6. Plan -> entitlement-keys mapping. Developer-defined in migrations/seed;
--    NOT operator-editable in this build. Surrogate PK + unique natural key
--    (CLAUDE.md § Schema conventions). Same enum type as entitlements.key.
create table public.plan_entitlements (
  plan_entitlement_id uuid primary key default public.uuid_generate_v7(),
  plan_id uuid not null references public.plans(plan_id) on delete cascade,
  key public.entitlement_key not null,
  value jsonb not null default 'true'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, key)
);

create trigger plan_entitlements_set_updated_at
  before update on public.plan_entitlements
  for each row execute function extensions.moddatetime(updated_at);

-- 7. RLS: no client access. Service role (apps/admin, workers) only — same
--    posture as admin_recovery_codes / admin_users. RLS enabled + no policy
--    => authenticated sees 0 rows; anon has no table grant at all.
alter table public.plan_entitlements enable row level security;
