# Template SaaS

A multi-tenant SaaS template built on Next.js, Supabase, and Stripe. Provides the bones — auth, billing, jobs, observability, feature flags — that every derived SaaS product needs, without baking in product-specific logic.

## Language

### Identity

**User**:
A person who has authenticated with the system. Encompasses both the authentication identity (`auth.users`) and the display identity (`profiles`) — the two are always created together and are never spoken of separately.
_Avoid_: Profile, Account, Principal

**Member**:
A User's association with an Organization, carrying an org-scoped role (`owner`, `manager`, or `member`). A User with no Memberships exists (e.g., just signed up, no org yet) but cannot access any org's data.
_Avoid_: User (when referring to an org-scoped person)

**Operator**:
A User who has access to the internal backoffice (`apps/admin`). Tracked separately from org Memberships via the `admin_users` table. An Operator may or may not hold a Membership in any Organization.
_Avoid_: Admin User, Staff, Super Admin

**Invitation**:
A pending offer for a person (possibly not yet a User) to become a Member of an Organization. Has a signed token, expiry, and target role. Progresses to a Membership on acceptance.

### Organization & roles

**Organization**:
The top-level unit of multi-tenancy. Every piece of org-scoped data belongs to exactly one Organization. Use "cross-org" for queries or operations that span multiple Organizations. Reserve "tenant" exclusively for hosting-model discussions (e.g., subdomain-per-org, DB-per-org isolation) — it is not a synonym for Organization in everyday usage.
_Avoid_: Workspace, Account, Tenant (as a synonym for Organization)

**Role**:
The permission level a Member holds within an Organization. Enum: `owner`, `manager`, `member`.
_Avoid_: Admin (as a role name — use `manager` instead)

### Billing

**Charge**:
The internal billing record for a completed billing period or payment event. Carries amount, date, status, and a link to the Organization and Subscription. Not a legal document.
_Avoid_: Invoice (when referring to the internal billing record)

**Invoice**:
The legal tax document issued to a customer (boleta, factura, NF-e, etc.). Emitted after a Charge is paid. Jurisdiction-specific; emission is handled by an `EmitterProvider` in derived projects.
_Avoid_: TaxDocument, Receipt, Bill (when referring to the legal document)

**Billing Account**:
The link between an Organization and one billing provider, holding that provider's customer identifier (e.g., Stripe's `cus_xxx`). An Organization can hold several active Billing Accounts simultaneously (one per provider) and the router selects which one a given Charge flows through. Status is `active` or `inactive`; inactive Billing Accounts are retired but kept so historical Charges and Invoices stay referentially intact.
_Avoid_: Customer (at the domain level — see below)

**Customer**:
Provider/adapter-internal vocabulary only. "Customer" is the billing provider's name (notably Stripe's) for what a Billing Account points at. It is not a domain entity — the domain entity being billed is the Organization. Keep the word "Customer" inside `providers/*` adapter code; never use it in domain language.

**Subscription**:
An Organization's ongoing commitment to a Plan, managed by a `BillingProvider`. Has a lifecycle: active, past_due, canceled, etc.

**Plan**:
A tier of access defined in the DB (e.g., Free, Pro, Enterprise). Provider price IDs map to a Plan, not the reverse. One Plan can have price mappings across multiple billing providers.

**Entitlement**:
A granted right to access a specific feature, derived from an Organization's active Subscription and Plan. Authoritative; a mistoggled Entitlement is a legal or contractual issue.
_Avoid_: Feature flag, permission (when referring to billing-derived access)

### Adapters

**Provider**:
An adapter role behind a swappable interface. Never use the word bare — always qualify it, because three unrelated provider roles exist: **billing provider** (`BillingProvider` — charges money, e.g. Stripe), **emitter provider** (`EmitterProvider` — emits legal Invoices, e.g. Openfactura), and **flag provider** (the OpenFeature provider — serves feature flags, e.g. PostHog). "Configure the provider" with no qualifier is always ambiguous.
