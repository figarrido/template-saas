-- Fix multiple permissive policies (advisor: multiple_permissive_policies).
--
-- Postgres evaluates every permissive policy for a given role+action combo and
-- OR-combines them. Two SELECT policies on the same table means Postgres runs
-- both for every row, even when the first already matched. The fix is to either
-- merge or split by operation.
--
-- memberships / invitations: `for all` + a dedicated `for select` overlap on
-- SELECT. Replace `for all` with explicit insert/update/delete policies.
--
-- profiles: two SELECT policies. Merge into one with an OR predicate; Postgres
-- can short-circuit at the cheaper `user_id = (select auth.uid())` branch.
--
-- Also fixes uuid_generate_v7 mutable search_path (advisor:
-- function_search_path_mutable): pin search_path = extensions so gen_random_bytes
-- resolves to the pgcrypto extension, not a potentially malicious shadow.

-- ── memberships ──────────────────────────────────────────────────────────────

drop policy if exists memberships_modify on public.memberships;
drop policy if exists memberships_insert on public.memberships;
drop policy if exists memberships_update on public.memberships;
drop policy if exists memberships_delete on public.memberships;

create policy memberships_insert on public.memberships
  for insert to authenticated
  with check (public.is_org_admin(organization_id));

create policy memberships_update on public.memberships
  for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

create policy memberships_delete on public.memberships
  for delete to authenticated
  using (public.is_org_admin(organization_id));

-- ── invitations ───────────────────────────────────────────────────────────────

drop policy if exists invitations_modify on public.invitations;
drop policy if exists invitations_insert on public.invitations;
drop policy if exists invitations_update on public.invitations;
drop policy if exists invitations_delete on public.invitations;

create policy invitations_insert on public.invitations
  for insert to authenticated
  with check (public.is_org_admin(organization_id));

create policy invitations_update on public.invitations
  for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

create policy invitations_delete on public.invitations
  for delete to authenticated
  using (public.is_org_admin(organization_id));

-- ── profiles ──────────────────────────────────────────────────────────────────

drop policy if exists profiles_select_self on public.profiles;
drop policy if exists profiles_select_shared_org on public.profiles;
drop policy if exists profiles_select on public.profiles;

create policy profiles_select on public.profiles
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.memberships m1
      join public.memberships m2 using (organization_id)
      where m1.user_id = (select auth.uid())
        and m2.user_id = profiles.user_id
    )
  );

-- ── uuid_generate_v7 ─────────────────────────────────────────────────────────

create or replace function public.uuid_generate_v7() returns uuid
language plpgsql
volatile
set search_path = extensions
as $$
declare
  unix_ts_ms bytea;
  uuid_bytes bytea;
begin
  unix_ts_ms := substring(int8send((extract(epoch from clock_timestamp()) * 1000)::bigint) from 3);
  uuid_bytes := unix_ts_ms || gen_random_bytes(10);
  uuid_bytes := set_byte(uuid_bytes, 6, (b'01110000'::bit(8) | get_byte(uuid_bytes, 6)::bit(8))::int);
  uuid_bytes := set_byte(uuid_bytes, 8, (b'10000000'::bit(8) | (get_byte(uuid_bytes, 8) & x'3F'::int)::bit(8))::int);
  return encode(uuid_bytes, 'hex')::uuid;
end
$$;

comment on function public.uuid_generate_v7 is
  'UUID v7 polyfill. Replace with native uuidv7() once Supabase ships PG with native support.';
