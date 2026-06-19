-- Grant table-level DML to authenticated; RLS policies control row visibility.
--
-- Without this, Postgres never reaches RLS evaluation — clients see
-- "permission denied" instead of the expected 0-row or filtered result.
-- The authenticated role needs the base privilege; RLS then restricts which
-- rows it can actually read or write.
--
-- anon gets SELECT on plans only (public pricing pages pre-login).

grant usage on schema public to authenticated, anon;

grant select, insert, update, delete
  on table
    public.organizations,
    public.profiles,
    public.memberships,
    public.invitations,
    public.plans,
    public.entitlements,
    public.billing_accounts,
    public.invoices,
    public.tax_documents,
    public.flag_overrides,
    public.admin_users,
    public.admin_audit_log
  to authenticated;

grant select on public.plans to anon;

-- Ensure future tables created in this schema inherit the same grants.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
