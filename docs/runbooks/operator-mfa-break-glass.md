# Operator MFA Break-Glass

ADR 0006 recovery-ladder rung 3 — for when an Operator has lost both their TOTP device and all recovery codes (total factor loss).

This procedure is **deliberately manual** and must be performed out-of-band by someone with direct database access (service-role or `ADMIN_DATABASE_URL` credentials). Every use must be recorded.

---

## When to use

Use only when the Operator cannot sign in via:
- **Rung 1:** A recovery code (single-use codes from enrollment)
- **Rung 2:** Peer MFA reset (another Operator revokes and re-enrolls the factor — when Operator invitations ship)
- **Rung 3 (this runbook):** Direct DB intervention

---

## Steps

Connect using the service-role connection (e.g. `ADMIN_DATABASE_URL`) and the Operator's `user_id` (UUID from `auth.users`):

```sql
-- 1. Remove the Supabase TOTP factor.
--    The next sign-in will drop to the /enroll flow where the Operator
--    can set up a fresh authenticator.
DELETE FROM auth.mfa_factors
WHERE user_id = '<operator-uuid>';

-- 2. Clear any spent or unspent recovery codes.
--    A fresh batch is issued when the Operator re-enrolls.
DELETE FROM public.admin_recovery_codes
WHERE user_id = '<operator-uuid>';
```

After these two statements execute, the Operator can sign in and will be prompted to enroll a new TOTP factor at `/enroll`.

---

## Notes

- Do **not** touch `admin_users` — the Operator's admin grant is separate from their MFA factors.
- The elevation cookie (`admin_recovery_aal2`) is session-bound and keyed to the Supabase `session_id`; it expires when the session does. No cleanup is needed.
- Record the date, the Operator's `user_id`, and the initiator in the `admin_audit_log` or an out-of-band incident log.

---

**Referenced from:** [docs/architecture/03-auth.md](../architecture/03-auth.md), [docs/adr/0006-operator-access-model.md](../adr/0006-operator-access-model.md)
