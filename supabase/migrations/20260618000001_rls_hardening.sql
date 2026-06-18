-- RLS performance and security hardening.
--
-- Two fixes:
--
-- 1. (select auth.uid()) pattern.
--    Wrapping auth.uid() in a subquery ensures Postgres evaluates it once per
--    query plan rather than once per row. This is the Supabase-recommended
--    approach for all RLS policies and helper functions.
--    See: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--
-- 2. Revoke execute on SECURITY DEFINER helpers from anon.
--    is_member_of / is_org_admin are SECURITY DEFINER; Postgres grants EXECUTE
--    to PUBLIC by default for every new function, which includes the anon role.
--    Even though auth.uid() returns NULL for anon callers (so both functions
--    already return false), explicit denial is defense in depth.

-- ── Helper functions ─────────────────────────────────────────────────────────

create or replace function public.is_member_of(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships
    where user_id = (select auth.uid())
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
    where user_id = (select auth.uid())
      and organization_id = target_org
      and role in ('owner', 'admin')
  );
$$;

revoke execute on function public.is_member_of(uuid) from anon;
revoke execute on function public.is_org_admin(uuid) from anon;

-- ── profiles policies ────────────────────────────────────────────────────────

drop policy profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ── flag_overrides policy ────────────────────────────────────────────────────

drop policy flag_overrides_admin_only on public.flag_overrides;
create policy flag_overrides_admin_only on public.flag_overrides
  for select to authenticated
  using (
    exists (
      select 1 from public.admin_users
      where user_id = (select auth.uid()) and revoked_at is null
    )
  );
