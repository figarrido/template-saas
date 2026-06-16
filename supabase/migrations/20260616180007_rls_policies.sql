-- Row-Level Security policies.
--
-- docs/architecture/02-data.md § Multi-tenancy: "RLS enforced at the DB layer —
-- a buggy API route can't leak across tenants." This file is the load-bearing
-- safety net. The RLS test suite (packages/db/test/rls/) re-runs every policy
-- here and fails CI on regression.
--
-- Service-role connections (apps/admin, services/*) bypass RLS by design.
-- apps/web uses supabase-js with the user's JWT and is bound by these
-- policies.

-- Helper: is the current user a member of <org>?
-- Marked security definer so it can read memberships without recursion via
-- the calling user's policies.
create or replace function public.is_member_of(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships
    where user_id = auth.uid()
      and organization_id = target_org
  );
$$;

create or replace function public.is_org_admin(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships
    where user_id = auth.uid()
      and organization_id = target_org
      and role in ('owner', 'admin')
  );
$$;

-- organizations
alter table public.organizations enable row level security;

create policy organizations_select on public.organizations
  for select to authenticated
  using (public.is_member_of(organization_id));

create policy organizations_update on public.organizations
  for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- Org creation goes through a service-role RPC (so we can atomically create
-- the owner membership). Block direct inserts from the client.
create policy organizations_no_client_insert on public.organizations
  for insert to authenticated with check (false);

-- profiles
alter table public.profiles enable row level security;

create policy profiles_select_self on public.profiles
  for select to authenticated
  using (user_id = auth.uid());

-- Members of a shared org can see each other's profile (for member lists).
create policy profiles_select_shared_org on public.profiles
  for select to authenticated
  using (
    exists (
      select 1
      from public.memberships m1
      join public.memberships m2 using (organization_id)
      where m1.user_id = auth.uid()
        and m2.user_id = profiles.user_id
    )
  );

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- memberships
alter table public.memberships enable row level security;

create policy memberships_select on public.memberships
  for select to authenticated
  using (public.is_member_of(organization_id));

create policy memberships_modify on public.memberships
  for all to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- invitations
alter table public.invitations enable row level security;

create policy invitations_select on public.invitations
  for select to authenticated
  using (public.is_org_admin(organization_id));

create policy invitations_modify on public.invitations
  for all to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- plans (read-only to all authenticated users — needed for upgrade UIs)
alter table public.plans enable row level security;

create policy plans_select on public.plans
  for select to authenticated using (is_active);

-- entitlements
alter table public.entitlements enable row level security;

create policy entitlements_select on public.entitlements
  for select to authenticated
  using (public.is_member_of(organization_id));

-- billing_accounts (admins of the org can see)
alter table public.billing_accounts enable row level security;

create policy billing_accounts_select on public.billing_accounts
  for select to authenticated
  using (public.is_org_admin(organization_id));

-- invoices
alter table public.invoices enable row level security;

create policy invoices_select on public.invoices
  for select to authenticated
  using (public.is_org_admin(organization_id));

-- tax_documents
alter table public.tax_documents enable row level security;

create policy tax_documents_select on public.tax_documents
  for select to authenticated
  using (public.is_org_admin(organization_id));

-- flag_overrides — admin-only access. Client app reads via RPC, not directly.
alter table public.flag_overrides enable row level security;

create policy flag_overrides_admin_only on public.flag_overrides
  for select to authenticated
  using (
    exists (
      select 1 from public.admin_users
      where user_id = auth.uid() and revoked_at is null
    )
  );

-- admin_users + admin_audit_log: no client access. Service role only.
alter table public.admin_users enable row level security;
alter table public.admin_audit_log enable row level security;
-- No policies defined → no rows visible to client. apps/admin reaches these
-- through the service-role connection.
