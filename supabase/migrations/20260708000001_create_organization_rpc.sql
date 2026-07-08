-- Org creation write-door. docs/architecture/03-auth.md § Onboarding.
-- SECURITY DEFINER so it can create the Organization (whose RLS blocks all
-- client inserts) and the creator's owner Membership atomically. Slug logic
-- lives wholly here so it has exactly one home. Callers reach it via the RLS
-- user client (supabase.rpc); the org insert bypasses RLS because the function
-- runs as its (superuser) owner, not the calling authenticated role.
create or replace function public.create_organization(org_name text)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_trimmed text := btrim(org_name);
  v_base    text;
  v_slug    text;
  v_suffix  int := 0;
  v_org     public.organizations;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Name bounds enforced on the trimmed name (mirrors createOrganizationSchema).
  if length(v_trimmed) < 2 or length(v_trimmed) > 50 then
    raise exception 'organization name must be between 2 and 50 characters'
      using errcode = 'check_violation';
  end if;

  -- Base slug: lowercase, every run of non-[a-z0-9] -> single hyphen, trim hyphens.
  v_base := btrim(regexp_replace(lower(v_trimmed), '[^a-z0-9]+', '-', 'g'), '-');
  if v_base = '' then
    v_base := 'org';               -- name was all punctuation/emoji
  end if;
  v_base := left(v_base, 50);      -- keep base within the column/route budget

  -- Reserved app path segments never become a bare slug: start suffixed.
  if v_base = any (array[
    'orgs','onboarding','account','api','auth','design-system',
    'login','signup','logout','forgot-password','reset-password',
    'check-email','admin','dashboard','settings','new'
  ]) then
    v_suffix := 2;
  end if;

  -- Collision resolution, atomic with the unique(slug) constraint: try the
  -- candidate, and on unique_violation bump the suffix and retry. Concurrent
  -- creates of the same name can never both win the same slug.
  loop
    v_slug := case when v_suffix = 0 then v_base else v_base || '-' || v_suffix end;
    begin
      insert into public.organizations (name, slug)
      values (v_trimmed, v_slug)
      returning * into v_org;
      exit;
    exception when unique_violation then
      v_suffix := v_suffix + 1;
    end;
  end loop;

  insert into public.memberships (user_id, organization_id, role)
  values (v_user_id, v_org.organization_id, 'owner');

  return v_org;
end;
$$;

-- authenticated-only, matching the is_member_of / is_org_admin hardening.
revoke execute on function public.create_organization(text) from public;
revoke execute on function public.create_organization(text) from anon;
grant  execute on function public.create_organization(text) to authenticated;
