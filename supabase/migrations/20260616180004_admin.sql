-- Admin enforcement tables.
--
-- docs/architecture/03-auth.md § Admin app enforcement: presence in
-- admin_users is one of the three required signals (session → admin_users →
-- MFA verified). Membership in admin_users is granted exclusively via service
-- role / DB-side process — never self-service.

create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  notes text
);

create index admin_users_active_idx
  on public.admin_users (user_id)
  where revoked_at is null;

-- Append-only audit log of every admin mutation.
-- docs/architecture/03-auth.md § Admin enforcement: "All admin mutations
-- write to admin_audit_log."
create table public.admin_audit_log (
  admin_audit_log_id uuid primary key default public.uuid_generate_v7(),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null,
  target_kind text,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index admin_audit_log_actor_idx on public.admin_audit_log (actor_user_id);
create index admin_audit_log_action_idx on public.admin_audit_log (action);
create index admin_audit_log_created_at_idx on public.admin_audit_log (created_at desc);

-- No update/delete: the table is append-only. Enforce via REVOKE so even
-- accidental service-role queries fail.
revoke update, delete on public.admin_audit_log from public, anon, authenticated;
