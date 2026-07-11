-- Hand-built single-use recovery codes for Operator TOTP MFA.
-- ADR 0006 recovery ladder rung 1: Supabase does not ship recovery codes for
-- TOTP, so we store a SHA-256 hash of each code and mark it used on redemption.
-- docs/architecture/03-auth.md § Admin enforcement.

create table public.admin_recovery_codes (
  admin_recovery_code_id uuid primary key default public.uuid_generate_v7(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, code_hash)
);

create index admin_recovery_codes_unused_idx
  on public.admin_recovery_codes (user_id)
  where used_at is null;

create trigger admin_recovery_codes_set_updated_at
  before update on public.admin_recovery_codes
  for each row execute function extensions.moddatetime(updated_at);

-- No client access. Service role (apps/admin) only — same posture as
-- admin_users / admin_audit_log (see 20260616180007_rls_policies.sql).
alter table public.admin_recovery_codes enable row level security;
