# Template SaaS

A multi-tenant SaaS template built on Next.js, Supabase, and Stripe. Provides the bones — auth, billing, jobs, observability, feature flags — that every derived SaaS product needs, without baking in product-specific logic.

## Language

### Identity

**User**:
A person who has authenticated with the system. Encompasses both the account record (`auth.users`) and the display record (`profiles`) — the two are always created together and are never spoken of separately. *How* the person proves they are this User is an Identity (see below).
_Avoid_: Profile, Account, Principal

**Identity**:
A single authentication method bound to a User — email/password, or an OAuth provider (Google, GitHub, etc.). One User can hold several Identities (Supabase `auth.identities`); Identities that share a provider-verified email are auto-linked onto the same User. The distinction from User is the point: the User is the person, an Identity is one way they prove it.
_Avoid_: Credential, Login, Account; do not conflate with Provider (an Identity is served *by* an OAuth provider, it is not one)

**Member**:
A User's association with an Organization, carrying an org-scoped role (`owner`, `manager`, or `member`). A User with no Memberships exists (e.g., just signed up, no org yet) but cannot access any org's data.
_Avoid_: User (when referring to an org-scoped person)

**Operator**:
A User who has access to the internal backoffice (`apps/admin`). Tracked separately from org Memberships via the `admin_users` table. An Operator may or may not hold a Membership in any Organization.
_Avoid_: Admin User, Staff, Super Admin

**Invitation**:
A pending offer for a person (possibly not yet a User) to become a Member of an Organization. Has a signed token, expiry, and target role. Progresses to a Membership on acceptance.

**Session**:
A User's authenticated state on one device, backed by a short-lived Supabase access token plus a rotating refresh token, stored in cookies. Sign-out is per-device by default; a password reset revokes the User's Sessions on all *other* devices.
_Avoid_: Login (as a noun for this state), Token

**Re-authentication**:
Re-proving identity by re-entering the current password immediately before a sensitive change (changing password or email). Distinct from sign-in: the User already holds a Session — re-authentication guards the specific action, not access to the app.
_Avoid_: Confirm-password, Step-up (reserve "step-up" for MFA)

**Flow Error Contract**:
The single set of rules governing what an auth flow reveals when it fails. Every failure surfaces through one of three named policies — **generic error** (reveal only that the attempt failed), **first-issue error** (reveal what was wrong with the input, where that cannot aid enumeration), or **silent success** (reveal nothing; indistinguishable from the happy path) — and which policy a flow uses is that flow's decision, implementing the account-enumeration posture (see `docs/adr/0002`).
_Avoid_: error handling, error mapping (implementation vocabulary — the contract is about what is revealed, not how)

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
An adapter role behind a swappable interface. Never use the word bare — always qualify it, because four unrelated provider roles exist: **billing provider** (`BillingProvider` — charges money, e.g. Stripe), **emitter provider** (`EmitterProvider` — emits legal Invoices, e.g. Openfactura), **flag provider** (the OpenFeature provider — serves feature flags, e.g. PostHog), and **OAuth provider** (a.k.a. identity provider — serves sign-in via Supabase Auth, e.g. Google/GitHub; the thing behind an Identity). "Configure the provider" with no qualifier is always ambiguous.
