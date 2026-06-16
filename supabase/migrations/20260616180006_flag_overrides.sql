-- Feature-flag overrides written from the admin UI.
--
-- docs/architecture/10-feature-flags.md § Override precedence:
-- admin UI > env var > URL param > provider (PostHog) > default.
-- This table is the persistence layer for the admin UI rung. packages/flags
-- reads it via an injected callback — never importing packages/db directly.

create table public.flag_overrides (
  flag_override_id uuid primary key default public.uuid_generate_v7(),
  flag_key text not null,
  organization_id uuid references public.organizations(organization_id) on delete cascade,
  user_id uuid references public.profiles(user_id) on delete cascade,
  value jsonb not null,
  reason text,
  set_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    -- An override targets exactly one scope: global, org, or user.
    (organization_id is null and user_id is null) or
    (organization_id is not null and user_id is null) or
    (organization_id is null and user_id is not null)
  )
);

create unique index flag_overrides_global_unique
  on public.flag_overrides (flag_key)
  where organization_id is null and user_id is null;

create unique index flag_overrides_org_unique
  on public.flag_overrides (flag_key, organization_id)
  where organization_id is not null;

create unique index flag_overrides_user_unique
  on public.flag_overrides (flag_key, user_id)
  where user_id is not null;

create index flag_overrides_flag_key_idx on public.flag_overrides (flag_key);

create trigger flag_overrides_set_updated_at
  before update on public.flag_overrides
  for each row execute function extensions.moddatetime(updated_at);
