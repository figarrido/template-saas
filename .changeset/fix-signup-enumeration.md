---
'@template/auth': patch
---

Fix a sign-up account-enumeration leak. This GoTrue version returns a hard
`user_already_exists` error for an already-registered *confirmed* email, which
`signUp` mapped to `unexpected` — distinguishable from a fresh sign-up's generic
success. `isUserAlreadyExistsError` now collapses it onto the same generic
"check your email" response (ADR-0002).
