-- Billing tables.
--
-- docs/architecture/04-billing.md splits charging from tax-document emission:
--   * billing_accounts: one row per provider per org (e.g. Stripe customer).
--   * plans + entitlements: internal plan IDs; provider price IDs map TO them.
--   * invoices: internal Invoice records; emitted from BillingProvider webhooks.
--   * tax_documents: legal e-invoice records (Boleta, Factura, etc.); emitted
--     by an EmitterProvider after billing.invoice.paid. Template ships the
--     interface only — no concrete emitter adapter.

create table public.plans (
  plan_id uuid primary key default public.uuid_generate_v7(),
  slug text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger plans_set_updated_at
  before update on public.plans
  for each row execute function extensions.moddatetime(updated_at);

-- Entitlements are the read-side projection of "what does this org get?".
-- BillingProvider webhooks update this table; packages/billing's
-- entitlements.has() / entitlements.list() read from it.
create table public.entitlements (
  entitlement_id uuid primary key default public.uuid_generate_v7(),
  organization_id uuid not null references public.organizations(organization_id) on delete cascade,
  plan_id uuid references public.plans(plan_id) on delete set null,
  key text not null,
  value jsonb not null default 'true'::jsonb,
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  source text not null default 'billing',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, key)
);

create index entitlements_organization_id_idx on public.entitlements (organization_id);

create trigger entitlements_set_updated_at
  before update on public.entitlements
  for each row execute function extensions.moddatetime(updated_at);

-- One row per (org, billing provider). Stripe customer id, plus the provider's
-- internal subscription id (or array of them). providerMetadata is the
-- escape hatch from docs/architecture/04-billing.md.
create table public.billing_accounts (
  billing_account_id uuid primary key default public.uuid_generate_v7(),
  organization_id uuid not null references public.organizations(organization_id) on delete cascade,
  provider text not null,
  external_customer_id text not null,
  external_subscription_id text,
  status text not null default 'inactive',
  provider_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider)
);

create index billing_accounts_provider_customer_idx
  on public.billing_accounts (provider, external_customer_id);

create trigger billing_accounts_set_updated_at
  before update on public.billing_accounts
  for each row execute function extensions.moddatetime(updated_at);

create type public.invoice_status as enum (
  'draft', 'open', 'paid', 'void', 'uncollectible'
);

create table public.invoices (
  invoice_id uuid primary key default public.uuid_generate_v7(),
  organization_id uuid not null references public.organizations(organization_id) on delete cascade,
  billing_account_id uuid references public.billing_accounts(billing_account_id) on delete set null,
  provider text not null,
  external_invoice_id text not null,
  status public.invoice_status not null default 'draft',
  currency text not null,
  amount_total bigint not null,
  amount_paid bigint not null default 0,
  invoiced_at timestamptz,
  paid_at timestamptz,
  provider_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_invoice_id)
);

create index invoices_organization_id_idx on public.invoices (organization_id);
create index invoices_status_idx on public.invoices (status);

create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function extensions.moddatetime(updated_at);

create type public.tax_document_status as enum (
  'pending', 'emitted', 'voided', 'failed'
);

create table public.tax_documents (
  tax_document_id uuid primary key default public.uuid_generate_v7(),
  invoice_id uuid not null references public.invoices(invoice_id) on delete restrict,
  organization_id uuid not null references public.organizations(organization_id) on delete cascade,
  emitter text not null,
  external_document_id text,
  document_kind text not null,
  status public.tax_document_status not null default 'pending',
  emitted_at timestamptz,
  failure_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (emitter, external_document_id)
);

create index tax_documents_invoice_id_idx on public.tax_documents (invoice_id);
create index tax_documents_organization_id_idx on public.tax_documents (organization_id);

create trigger tax_documents_set_updated_at
  before update on public.tax_documents
  for each row execute function extensions.moddatetime(updated_at);
