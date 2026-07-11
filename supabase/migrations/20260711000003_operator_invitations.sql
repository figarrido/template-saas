-- Operator invitations: org-independent, invitation-only Operator onboarding.
-- ADR 0006 § Consequences. Distinct from the org-scoped public.invitations
-- table. Raw token is emailed; only its SHA-256 hash is stored (following
-- 03-auth.md's token_hash convention, not the plaintext-token org drift).
create table public.operator_invitations (
  operator_invitation_id uuid primary key default public.uuid_generate_v7(),
  email text not null,
  token_hash text not null unique,
  status public.invitation_status not null default 'pending',
  invited_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one pending invitation per email — re-inviting a pending email
-- UPDATEs this row rather than inserting a duplicate.
create unique index operator_invitations_pending_email_idx
  on public.operator_invitations (lower(email))
  where status = 'pending';

create index operator_invitations_email_idx
  on public.operator_invitations (lower(email));

create trigger operator_invitations_set_updated_at
  before update on public.operator_invitations
  for each row execute function extensions.moddatetime(updated_at);

-- No client access. RLS enabled with zero policies: authenticated reaches the
-- table but every row is denied; service role (apps/admin) bypasses RLS. Same
-- posture as admin_users / admin_recovery_codes. The public-schema default
-- privileges grant (20260619000001_grants.sql) auto-grants DML to authenticated;
-- RLS is what actually restricts access, so no extra grant/revoke is needed.
alter table public.operator_invitations enable row level security;
