---
'@template/email': patch
---

Fix double-confirm email changes never delivering the new-address confirmation.
The send-email hook only sent one message to `user.email`, so the new address
was never confirmed and the change could not complete. `buildAuthEmail` now
returns `EmailMessage[]` and fans an `email_change` out to both the current
address (`token_hash`) and the new address (`token_hash_new`).
