import { relations } from "drizzle-orm/relations";
import { authUsers, profiles, memberships, organizations, entitlements, plans, billing_accounts, invoices, admin_audit_log, invitations, tax_documents, flag_overrides, admin_users } from "./schema";

export const profilesRelations = relations(profiles, ({one, many}) => ({
	authUsers: one(authUsers, {
		fields: [profiles.user_id],
		references: [authUsers.id]
	}),
	memberships: many(memberships),
	invitations: many(invitations),
	flag_overrides: many(flag_overrides),
}));

export const usersInAuthRelations = relations(authUsers, ({many}) => ({
	profiles: many(profiles),
	admin_audit_logs: many(admin_audit_log),
	flag_overrides: many(flag_overrides),
	admin_users_user_id: many(admin_users, {
		relationName: "admin_users_user_id_usersInAuth_id"
	}),
	admin_users_granted_by: many(admin_users, {
		relationName: "admin_users_granted_by_usersInAuth_id"
	}),
}));

export const membershipsRelations = relations(memberships, ({one}) => ({
	profile: one(profiles, {
		fields: [memberships.user_id],
		references: [profiles.user_id]
	}),
	organization: one(organizations, {
		fields: [memberships.organization_id],
		references: [organizations.organization_id]
	}),
}));

export const organizationsRelations = relations(organizations, ({many}) => ({
	memberships: many(memberships),
	entitlements: many(entitlements),
	billing_accounts: many(billing_accounts),
	invoices: many(invoices),
	invitations: many(invitations),
	tax_documents: many(tax_documents),
	flag_overrides: many(flag_overrides),
}));

export const entitlementsRelations = relations(entitlements, ({one}) => ({
	organization: one(organizations, {
		fields: [entitlements.organization_id],
		references: [organizations.organization_id]
	}),
	plan: one(plans, {
		fields: [entitlements.plan_id],
		references: [plans.plan_id]
	}),
}));

export const plansRelations = relations(plans, ({many}) => ({
	entitlements: many(entitlements),
}));

export const billing_accountsRelations = relations(billing_accounts, ({one, many}) => ({
	organization: one(organizations, {
		fields: [billing_accounts.organization_id],
		references: [organizations.organization_id]
	}),
	invoices: many(invoices),
}));

export const invoicesRelations = relations(invoices, ({one, many}) => ({
	organization: one(organizations, {
		fields: [invoices.organization_id],
		references: [organizations.organization_id]
	}),
	billing_account: one(billing_accounts, {
		fields: [invoices.billing_account_id],
		references: [billing_accounts.billing_account_id]
	}),
	tax_documents: many(tax_documents),
}));

export const admin_audit_logRelations = relations(admin_audit_log, ({one}) => ({
	authUsers: one(authUsers, {
		fields: [admin_audit_log.actor_user_id],
		references: [authUsers.id]
	}),
}));

export const invitationsRelations = relations(invitations, ({one}) => ({
	organization: one(organizations, {
		fields: [invitations.organization_id],
		references: [organizations.organization_id]
	}),
	profile: one(profiles, {
		fields: [invitations.invited_by],
		references: [profiles.user_id]
	}),
}));

export const tax_documentsRelations = relations(tax_documents, ({one}) => ({
	invoice: one(invoices, {
		fields: [tax_documents.invoice_id],
		references: [invoices.invoice_id]
	}),
	organization: one(organizations, {
		fields: [tax_documents.organization_id],
		references: [organizations.organization_id]
	}),
}));

export const flag_overridesRelations = relations(flag_overrides, ({one}) => ({
	organization: one(organizations, {
		fields: [flag_overrides.organization_id],
		references: [organizations.organization_id]
	}),
	profile: one(profiles, {
		fields: [flag_overrides.user_id],
		references: [profiles.user_id]
	}),
	authUsers: one(authUsers, {
		fields: [flag_overrides.set_by],
		references: [authUsers.id]
	}),
}));

export const admin_usersRelations = relations(admin_users, ({one}) => ({
	usersInAuth_user_id: one(authUsers, {
		fields: [admin_users.user_id],
		references: [authUsers.id],
		relationName: "admin_users_user_id_usersInAuth_id"
	}),
	usersInAuth_granted_by: one(authUsers, {
		fields: [admin_users.granted_by],
		references: [authUsers.id],
		relationName: "admin_users_granted_by_usersInAuth_id"
	}),
}));