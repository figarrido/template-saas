-- ADR 0001: rename the org membership role value 'admin' -> 'manager'.
-- 'admin' collided with apps/admin and the admin_users operator table.
-- Forward-only. RENAME VALUE relabels the enum member in place, so existing
-- memberships/invitations rows require no data update. Transaction-safe.
alter type public.membership_role rename value 'admin' to 'manager';

-- is_org_admin() compared role in ('owner','admin'); the 'admin' label no
-- longer exists, so recreate it against 'manager'. Body is otherwise identical
-- to 20260618000001_rls_hardening.sql — behavior unchanged.
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
      and role in ('owner', 'manager')
  );
$$;

revoke execute on function public.is_org_admin(uuid) from anon;
