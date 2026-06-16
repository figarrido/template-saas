-- Core multi-tenancy tables.
--
-- PK naming follows docs/architecture/02-data.md § Schema conventions:
-- `<table_singular>_id` so `JOIN ... USING (organization_id)` works
-- throughout the tenant-scoped surface.
--
-- RLS policies land in 20260616180007_rls_policies.sql.

create table public.organizations (
  organization_id uuid primary key default public.uuid_generate_v7(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function extensions.moddatetime(updated_at);

-- profiles is 1:1 with auth.users. The user_id column matches auth.users.id
-- so RLS policies can key on auth.uid() without an extra join.
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function extensions.moddatetime(updated_at);

create type public.membership_role as enum ('owner', 'admin', 'member');

-- Surrogate PK + natural-key unique constraint per
-- docs/architecture/02-data.md § Schema conventions.
create table public.memberships (
  membership_id uuid primary key default public.uuid_generate_v7(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  organization_id uuid not null references public.organizations(organization_id) on delete cascade,
  role public.membership_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, organization_id)
);

create index memberships_user_id_idx on public.memberships (user_id);
create index memberships_organization_id_idx on public.memberships (organization_id);

create trigger memberships_set_updated_at
  before update on public.memberships
  for each row execute function extensions.moddatetime(updated_at);

create type public.invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');

create table public.invitations (
  invitation_id uuid primary key default public.uuid_generate_v7(),
  organization_id uuid not null references public.organizations(organization_id) on delete cascade,
  email text not null,
  role public.membership_role not null default 'member',
  status public.invitation_status not null default 'pending',
  invited_by uuid references public.profiles(user_id) on delete set null,
  token text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, email, status)
    deferrable initially deferred
);

create index invitations_organization_id_idx on public.invitations (organization_id);
create index invitations_email_idx on public.invitations (lower(email));

create trigger invitations_set_updated_at
  before update on public.invitations
  for each row execute function extensions.moddatetime(updated_at);
