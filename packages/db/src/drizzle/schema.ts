import { bigint, boolean, check, foreignKey, index, jsonb, pgEnum, pgPolicy, pgSchema, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";import { sql } from "drizzle-orm"
// Minimal reference to Supabase's auth.users so FK columns resolve.
// Owned by Supabase Auth — never migrate from this codebase.
const authSchema = pgSchema("auth");
export const authUsers = authSchema.table("users", {
  id: uuid().primaryKey().notNull(),
});


export const invitation_status = pgEnum("invitation_status", ['pending', 'accepted', 'revoked', 'expired'])
export const invoice_status = pgEnum("invoice_status", ['draft', 'open', 'paid', 'void', 'uncollectible'])
export const membership_role = pgEnum("membership_role", ['owner', 'manager', 'member'])
export const tax_document_status = pgEnum("tax_document_status", ['pending', 'emitted', 'voided', 'failed'])


export const admin_audit_log = pgTable("admin_audit_log", {
	admin_audit_log_id: uuid().default(sql`uuid_generate_v7()`).primaryKey().notNull(),
	actor_user_id: uuid().notNull(),
	action: text().notNull(),
	target_kind: text(),
	target_id: uuid(),
	metadata: jsonb().default({}).notNull(),
	created_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => {
	return {
		action_idx: index("admin_audit_log_action_idx").using("btree", table.action.asc().nullsLast().op("text_ops")),
		actor_idx: index("admin_audit_log_actor_idx").using("btree", table.actor_user_id.asc().nullsLast().op("uuid_ops")),
		admin_audit_log_actor_user_id_fkey: foreignKey({
			columns: [table.actor_user_id],
			foreignColumns: [authUsers.id],
			name: "admin_audit_log_actor_user_id_fkey"
		}).onDelete("restrict"),
		created_at_idx: index("admin_audit_log_created_at_idx").using("btree", table.created_at.desc().nullsFirst().op("timestamptz_ops")),
	}
});

export const admin_users = pgTable("admin_users", {
	user_id: uuid().primaryKey().notNull(),
	granted_by: uuid(),
	granted_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	revoked_at: timestamp({ withTimezone: true, mode: 'string' }),
	notes: text(),
}, (table) => {
	return {
		active_idx: index("admin_users_active_idx").using("btree", table.user_id.asc().nullsLast().op("uuid_ops")).where(sql`(revoked_at IS NULL)`),
		admin_users_granted_by_fkey: foreignKey({
			columns: [table.granted_by],
			foreignColumns: [authUsers.id],
			name: "admin_users_granted_by_fkey"
		}).onDelete("set null"),
		admin_users_user_id_fkey: foreignKey({
			columns: [table.user_id],
			foreignColumns: [authUsers.id],
			name: "admin_users_user_id_fkey"
		}).onDelete("cascade"),
	}
});

export const organizations = pgTable("organizations", {
	organization_id: uuid().default(sql`uuid_generate_v7()`).primaryKey().notNull(),
	name: text().notNull(),
	slug: text().notNull(),
	created_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updated_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => {
	return {
		organizations_no_client_insert: pgPolicy("organizations_no_client_insert", { as: "permissive", for: "insert", to: ["authenticated"] }),
		organizations_select: pgPolicy("organizations_select", { as: "permissive", for: "select", to: ["authenticated"], using: sql`is_member_of(organization_id)` }),
		organizations_slug_key: unique("organizations_slug_key").on(table.slug),
		organizations_update: pgPolicy("organizations_update", { as: "permissive", for: "update", to: ["authenticated"] }),
	}
});

export const billing_accounts = pgTable("billing_accounts", {
	billing_account_id: uuid().default(sql`uuid_generate_v7()`).primaryKey().notNull(),
	organization_id: uuid().notNull(),
	provider: text().notNull(),
	external_customer_id: text().notNull(),
	external_subscription_id: text(),
	status: text().default('inactive').notNull(),
	provider_metadata: jsonb().default({}).notNull(),
	created_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updated_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => {
	return {
		billing_accounts_organization_id_fkey: foreignKey({
			columns: [table.organization_id],
			foreignColumns: [organizations.organization_id],
			name: "billing_accounts_organization_id_fkey"
		}).onDelete("cascade"),
		billing_accounts_organization_id_provider_key: unique("billing_accounts_organization_id_provider_key").on(table.organization_id, table.provider),
		billing_accounts_select: pgPolicy("billing_accounts_select", { as: "permissive", for: "select", to: ["authenticated"], using: sql`is_org_admin(organization_id)` }),
		provider_customer_idx: index("billing_accounts_provider_customer_idx").using("btree", table.provider.asc().nullsLast().op("text_ops"), table.external_customer_id.asc().nullsLast().op("text_ops")),
	}
});

export const invoices = pgTable("invoices", {
	invoice_id: uuid().default(sql`uuid_generate_v7()`).primaryKey().notNull(),
	organization_id: uuid().notNull(),
	billing_account_id: uuid(),
	provider: text().notNull(),
	external_invoice_id: text().notNull(),
	status: invoice_status().default('draft').notNull(),
	currency: text().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	amount_total: bigint({ mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	amount_paid: bigint({ mode: "number" }).default(0).notNull(),
	invoiced_at: timestamp({ withTimezone: true, mode: 'string' }),
	paid_at: timestamp({ withTimezone: true, mode: 'string' }),
	provider_metadata: jsonb().default({}).notNull(),
	created_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updated_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => {
	return {
		invoices_billing_account_id_fkey: foreignKey({
			columns: [table.billing_account_id],
			foreignColumns: [billing_accounts.billing_account_id],
			name: "invoices_billing_account_id_fkey"
		}).onDelete("set null"),
		invoices_organization_id_fkey: foreignKey({
			columns: [table.organization_id],
			foreignColumns: [organizations.organization_id],
			name: "invoices_organization_id_fkey"
		}).onDelete("cascade"),
		invoices_provider_external_invoice_id_key: unique("invoices_provider_external_invoice_id_key").on(table.provider, table.external_invoice_id),
		invoices_select: pgPolicy("invoices_select", { as: "permissive", for: "select", to: ["authenticated"], using: sql`is_org_admin(organization_id)` }),
		organization_id_idx: index("invoices_organization_id_idx").using("btree", table.organization_id.asc().nullsLast().op("uuid_ops")),
		status_idx: index("invoices_status_idx").using("btree", table.status.asc().nullsLast().op("enum_ops")),
	}
});

export const plans = pgTable("plans", {
	plan_id: uuid().default(sql`uuid_generate_v7()`).primaryKey().notNull(),
	slug: text().notNull(),
	name: text().notNull(),
	description: text(),
	is_active: boolean().default(true).notNull(),
	created_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updated_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => {
	return {
		plans_select: pgPolicy("plans_select", { as: "permissive", for: "select", to: ["authenticated"], using: sql`is_active` }),
		plans_slug_key: unique("plans_slug_key").on(table.slug),
	}
});

export const entitlements = pgTable("entitlements", {
	entitlement_id: uuid().default(sql`uuid_generate_v7()`).primaryKey().notNull(),
	organization_id: uuid().notNull(),
	plan_id: uuid(),
	key: text().notNull(),
	value: jsonb().default(true).notNull(),
	granted_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	expires_at: timestamp({ withTimezone: true, mode: 'string' }),
	source: text().default('billing').notNull(),
	created_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updated_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => {
	return {
		entitlements_organization_id_fkey: foreignKey({
			columns: [table.organization_id],
			foreignColumns: [organizations.organization_id],
			name: "entitlements_organization_id_fkey"
		}).onDelete("cascade"),
		entitlements_organization_id_key_key: unique("entitlements_organization_id_key_key").on(table.organization_id, table.key),
		entitlements_plan_id_fkey: foreignKey({
			columns: [table.plan_id],
			foreignColumns: [plans.plan_id],
			name: "entitlements_plan_id_fkey"
		}).onDelete("set null"),
		entitlements_select: pgPolicy("entitlements_select", { as: "permissive", for: "select", to: ["authenticated"], using: sql`is_member_of(organization_id)` }),
		organization_id_idx: index("entitlements_organization_id_idx").using("btree", table.organization_id.asc().nullsLast().op("uuid_ops")),
	}
});

export const profiles = pgTable("profiles", {
	user_id: uuid().primaryKey().notNull(),
	display_name: text(),
	avatar_url: text(),
	created_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updated_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => {
	return {
		profiles_select: pgPolicy("profiles_select", { as: "permissive", for: "select", to: ["authenticated"] }),
		profiles_update_self: pgPolicy("profiles_update_self", { as: "permissive", for: "update", to: ["authenticated"], using: sql`(user_id = ( SELECT auth.uid() AS uid))`, withCheck: sql`(user_id = ( SELECT auth.uid() AS uid))`  }),
		profiles_user_id_fkey: foreignKey({
			columns: [table.user_id],
			foreignColumns: [authUsers.id],
			name: "profiles_user_id_fkey"
		}).onDelete("cascade"),
	}
});

export const flag_overrides = pgTable("flag_overrides", {
	flag_override_id: uuid().default(sql`uuid_generate_v7()`).primaryKey().notNull(),
	flag_key: text().notNull(),
	organization_id: uuid(),
	user_id: uuid(),
	value: jsonb().notNull(),
	reason: text(),
	set_by: uuid(),
	expires_at: timestamp({ withTimezone: true, mode: 'string' }),
	created_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updated_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => {
	return {
		flag_key_idx: index("flag_overrides_flag_key_idx").using("btree", table.flag_key.asc().nullsLast().op("text_ops")),
		flag_overrides_admin_only: pgPolicy("flag_overrides_admin_only", { as: "permissive", for: "select", to: ["authenticated"], using: sql`(EXISTS ( SELECT 1
   FROM admin_users
  WHERE ((admin_users.user_id = ( SELECT auth.uid() AS uid)) AND (admin_users.revoked_at IS NULL))))` }),
		flag_overrides_check: check("flag_overrides_check", sql`((organization_id IS NULL) AND (user_id IS NULL)) OR ((organization_id IS NOT NULL) AND (user_id IS NULL)) OR ((organization_id IS NULL) AND (user_id IS NOT NULL))`),
		flag_overrides_organization_id_fkey: foreignKey({
			columns: [table.organization_id],
			foreignColumns: [organizations.organization_id],
			name: "flag_overrides_organization_id_fkey"
		}).onDelete("cascade"),
		flag_overrides_set_by_fkey: foreignKey({
			columns: [table.set_by],
			foreignColumns: [authUsers.id],
			name: "flag_overrides_set_by_fkey"
		}).onDelete("set null"),
		flag_overrides_user_id_fkey: foreignKey({
			columns: [table.user_id],
			foreignColumns: [profiles.user_id],
			name: "flag_overrides_user_id_fkey"
		}).onDelete("cascade"),
		global_unique: uniqueIndex("flag_overrides_global_unique").using("btree", table.flag_key.asc().nullsLast().op("text_ops")).where(sql`((organization_id IS NULL) AND (user_id IS NULL))`),
		org_unique: uniqueIndex("flag_overrides_org_unique").using("btree", table.flag_key.asc().nullsLast().op("text_ops"), table.organization_id.asc().nullsLast().op("uuid_ops")).where(sql`(organization_id IS NOT NULL)`),
		user_unique: uniqueIndex("flag_overrides_user_unique").using("btree", table.flag_key.asc().nullsLast().op("text_ops"), table.user_id.asc().nullsLast().op("text_ops")).where(sql`(user_id IS NOT NULL)`),
	}
});

export const invitations = pgTable("invitations", {
	invitation_id: uuid().default(sql`uuid_generate_v7()`).primaryKey().notNull(),
	organization_id: uuid().notNull(),
	email: text().notNull(),
	role: membership_role().default('member').notNull(),
	status: invitation_status().default('pending').notNull(),
	invited_by: uuid(),
	token: text().notNull(),
	expires_at: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
	accepted_at: timestamp({ withTimezone: true, mode: 'string' }),
	created_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updated_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => {
	return {
		email_idx: index("invitations_email_idx").using("btree", sql`lower(email)`),
		invitations_delete: pgPolicy("invitations_delete", { as: "permissive", for: "delete", to: ["authenticated"] }),
		invitations_insert: pgPolicy("invitations_insert", { as: "permissive", for: "insert", to: ["authenticated"] }),
		invitations_invited_by_fkey: foreignKey({
			columns: [table.invited_by],
			foreignColumns: [profiles.user_id],
			name: "invitations_invited_by_fkey"
		}).onDelete("set null"),
		invitations_organization_id_email_status_key: unique("invitations_organization_id_email_status_key").on(table.organization_id, table.email, table.status),
		invitations_organization_id_fkey: foreignKey({
			columns: [table.organization_id],
			foreignColumns: [organizations.organization_id],
			name: "invitations_organization_id_fkey"
		}).onDelete("cascade"),
		invitations_select: pgPolicy("invitations_select", { as: "permissive", for: "select", to: ["authenticated"], using: sql`is_org_admin(organization_id)` }),
		invitations_token_key: unique("invitations_token_key").on(table.token),
		invitations_update: pgPolicy("invitations_update", { as: "permissive", for: "update", to: ["authenticated"] }),
		organization_id_idx: index("invitations_organization_id_idx").using("btree", table.organization_id.asc().nullsLast().op("uuid_ops")),
	}
});

export const memberships = pgTable("memberships", {
	membership_id: uuid().default(sql`uuid_generate_v7()`).primaryKey().notNull(),
	user_id: uuid().notNull(),
	organization_id: uuid().notNull(),
	role: membership_role().default('member').notNull(),
	created_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updated_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => {
	return {
		memberships_delete: pgPolicy("memberships_delete", { as: "permissive", for: "delete", to: ["authenticated"] }),
		memberships_insert: pgPolicy("memberships_insert", { as: "permissive", for: "insert", to: ["authenticated"] }),
		memberships_organization_id_fkey: foreignKey({
			columns: [table.organization_id],
			foreignColumns: [organizations.organization_id],
			name: "memberships_organization_id_fkey"
		}).onDelete("cascade"),
		memberships_select: pgPolicy("memberships_select", { as: "permissive", for: "select", to: ["authenticated"], using: sql`is_member_of(organization_id)` }),
		memberships_update: pgPolicy("memberships_update", { as: "permissive", for: "update", to: ["authenticated"] }),
		memberships_user_id_fkey: foreignKey({
			columns: [table.user_id],
			foreignColumns: [profiles.user_id],
			name: "memberships_user_id_fkey"
		}).onDelete("cascade"),
		memberships_user_id_organization_id_key: unique("memberships_user_id_organization_id_key").on(table.user_id, table.organization_id),
		organization_id_idx: index("memberships_organization_id_idx").using("btree", table.organization_id.asc().nullsLast().op("uuid_ops")),
		user_id_idx: index("memberships_user_id_idx").using("btree", table.user_id.asc().nullsLast().op("uuid_ops")),
	}
});

export const tax_documents = pgTable("tax_documents", {
	tax_document_id: uuid().default(sql`uuid_generate_v7()`).primaryKey().notNull(),
	invoice_id: uuid().notNull(),
	organization_id: uuid().notNull(),
	emitter: text().notNull(),
	external_document_id: text(),
	document_kind: text().notNull(),
	status: tax_document_status().default('pending').notNull(),
	emitted_at: timestamp({ withTimezone: true, mode: 'string' }),
	failure_reason: text(),
	metadata: jsonb().default({}).notNull(),
	created_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updated_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => {
	return {
		invoice_id_idx: index("tax_documents_invoice_id_idx").using("btree", table.invoice_id.asc().nullsLast().op("uuid_ops")),
		organization_id_idx: index("tax_documents_organization_id_idx").using("btree", table.organization_id.asc().nullsLast().op("uuid_ops")),
		tax_documents_emitter_external_document_id_key: unique("tax_documents_emitter_external_document_id_key").on(table.emitter, table.external_document_id),
		tax_documents_invoice_id_fkey: foreignKey({
			columns: [table.invoice_id],
			foreignColumns: [invoices.invoice_id],
			name: "tax_documents_invoice_id_fkey"
		}).onDelete("restrict"),
		tax_documents_organization_id_fkey: foreignKey({
			columns: [table.organization_id],
			foreignColumns: [organizations.organization_id],
			name: "tax_documents_organization_id_fkey"
		}).onDelete("cascade"),
		tax_documents_select: pgPolicy("tax_documents_select", { as: "permissive", for: "select", to: ["authenticated"], using: sql`is_org_admin(organization_id)` }),
	}
});
