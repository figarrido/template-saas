---
'@template/auth': patch
---

Revoke every other Session on a password change. `changePassword` now calls
`signOut({ scope: 'others' })` after a successful `updateUser`, matching the
reset-password flow: a password change is the canonical "lock every other
device out" action, so the changing device stays signed in and all others are
torn down on their next refresh. Email changes deliberately do not revoke
Sessions — a Session is keyed to the User, not the address, and the secure
double-confirm already proves control of both mailboxes (ADR-0003).
