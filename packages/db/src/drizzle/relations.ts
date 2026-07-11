import { relations } from "drizzle-orm/relations";
import { admin_audit_log, admin_users, authUsers, billing_accounts, entitlements, flag_overrides, invitations, invoices, memberships, organizations, plan_entitlements, plans, profiles, tax_documents } from "./schema";

export const admin_audit_logRelations = relations(admin_audit_log, ({one}) => ({
	authUsers: one(authUsers, {
		fields: [admin_audit_log.actor_user_id],
		references: [authUsers.id]
	}),
}));

export const admin_usersRelations = relations(admin_users, ({one}) => ({
	usersInAuth_granted_by: one(authUsers, {
		fields: [admin_users.granted_by],
		references: [authUsers.id],
		relationName: "admin_users_granted_by_usersInAuth_id"
	}),
	usersInAuth_user_id: one(authUsers, {
		fields: [admin_users.user_id],
		references: [authUsers.id],
		relationName: "admin_users_user_id_usersInAuth_id"
	}),
}));

export const billing_accountsRelations = relations(billing_accounts, ({one, many}) => ({
	invoices: many(invoices),
	organization: one(organizations, {
		fields: [billing_accounts.organization_id],
		references: [organizations.organization_id]
	}),
}));

export const entitlementsRelations = relations(entitlements, ({one}) => ({
	authUsers: one(authUsers, {
		fields: [entitlements.granted_by],
		references: [authUsers.id]
	}),
	organization: one(organizations, {
		fields: [entitlements.organization_id],
		references: [organizations.organization_id]
	}),
	plan: one(plans, {
		fields: [entitlements.plan_id],
		references: [plans.plan_id]
	}),
}));

export const flag_overridesRelations = relations(flag_overrides, ({one}) => ({
	authUsers: one(authUsers, {
		fields: [flag_overrides.set_by],
		references: [authUsers.id]
	}),
	organization: one(organizations, {
		fields: [flag_overrides.organization_id],
		references: [organizations.organization_id]
	}),
	profile: one(profiles, {
		fields: [flag_overrides.user_id],
		references: [profiles.user_id]
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

export const invoicesRelations = relations(invoices, ({one, many}) => ({
	billing_account: one(billing_accounts, {
		fields: [invoices.billing_account_id],
		references: [billing_accounts.billing_account_id]
	}),
	organization: one(organizations, {
		fields: [invoices.organization_id],
		references: [organizations.organization_id]
	}),
	tax_documents: many(tax_documents),
}));

export const membershipsRelations = relations(memberships, ({one}) => ({
	organization: one(organizations, {
		fields: [memberships.organization_id],
		references: [organizations.organization_id]
	}),
	profile: one(profiles, {
		fields: [memberships.user_id],
		references: [profiles.user_id]
	}),
}));

export const organizationsRelations = relations(organizations, ({many}) => ({
	billing_accounts: many(billing_accounts),
	entitlements: many(entitlements),
	flag_overrides: many(flag_overrides),
	invitations: many(invitations),
	invoices: many(invoices),
	memberships: many(memberships),
	tax_documents: many(tax_documents),
}));

export const plan_entitlementsRelations = relations(plan_entitlements, ({one}) => ({
	plan: one(plans, {
		fields: [plan_entitlements.plan_id],
		references: [plans.plan_id]
	}),
}));

export const plansRelations = relations(plans, ({many}) => ({
	entitlements: many(entitlements),
	plan_entitlements: many(plan_entitlements),
}));

export const profilesRelations = relations(profiles, ({one, many}) => ({
	authUsers: one(authUsers, {
		fields: [profiles.user_id],
		references: [authUsers.id]
	}),
	flag_overrides: many(flag_overrides),
	invitations: many(invitations),
	memberships: many(memberships),
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

export const usersInAuthRelations = relations(authUsers, ({many}) => ({
	admin_audit_logs: many(admin_audit_log),
	admin_users_granted_by: many(admin_users, {
		relationName: "admin_users_granted_by_usersInAuth_id"
	}),
	admin_users_user_id: many(admin_users, {
		relationName: "admin_users_user_id_usersInAuth_id"
	}),
	entitlements: many(entitlements),
	flag_overrides: many(flag_overrides),
	profiles: many(profiles),
}));
