-- Canonical seed fixture for local dev.
--
-- docs/architecture/12-local-dev.md § Seed data:
--   * 1 admin user (with admin_users row).
--   * 1 regular user.
--   * 1 org with both as members.
--   * 1 plan + entitlement.
--   * 1 queued job (so workers visibly process something on first `pnpm dev`).
--
-- Deliberately small. Add factories in derived projects if richer fixtures
-- are needed for tests.

-- Insert auth users directly. The on_auth_user_created trigger mirrors them
-- into public.profiles, so we don't insert into profiles here.
-- Password for both is "password" (test only). Generated via:
--   select crypt('password', gen_salt('bf'));
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-1111-1111-111111111111',
    'authenticated',
    'authenticated',
    'admin@template.test',
    crypt('password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Template Admin"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '22222222-2222-2222-2222-222222222222',
    'authenticated',
    'authenticated',
    'user@template.test',
    crypt('password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Template User"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  )
on conflict (id) do nothing;

-- Grant admin status to the admin user.
insert into public.admin_users (user_id, granted_by, notes)
values (
  '11111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  'Seeded admin'
)
on conflict (user_id) do nothing;

-- One organization with both users as members.
insert into public.organizations (organization_id, name, slug) values (
  '33333333-3333-3333-3333-333333333333',
  'Template Org',
  'template-org'
)
on conflict (organization_id) do nothing;

insert into public.memberships (user_id, organization_id, role) values
  ('11111111-1111-1111-1111-111111111111',
   '33333333-3333-3333-3333-333333333333', 'owner'),
  ('22222222-2222-2222-2222-222222222222',
   '33333333-3333-3333-3333-333333333333', 'member')
on conflict (user_id, organization_id) do nothing;

-- One plan + entitlement so packages/billing.entitlements.has() returns true.
insert into public.plans (plan_id, slug, name, description) values (
  '44444444-4444-4444-4444-444444444444',
  'pro',
  'Pro',
  'Reference paid tier wired through the Stripe adapter.'
)
on conflict (plan_id) do nothing;

insert into public.entitlements (
  entitlement_id, organization_id, plan_id, key, value, source
) values (
  '55555555-5555-5555-5555-555555555555',
  '33333333-3333-3333-3333-333333333333',
  '44444444-4444-4444-4444-444444444444',
  'pro',
  'true'::jsonb,
  'seed'
)
on conflict (organization_id, key) do nothing;

-- One queued job. The Node worker picks this up on first `pnpm dev` so you
-- can confirm the queue + worker plumbing end-to-end.
-- Envelope shape matches packages/jobs/src/envelope.ts (camelCase fields).
select pgmq.send(
  'default',
  jsonb_build_object(
    'name', 'seed.hello',
    'payload', jsonb_build_object(
      'message', 'first job from supabase/seed.sql'
    ),
    'attempt', 0,
    'enqueuedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  )
);
