---
'@template/observability': patch
'@template/db': patch
'@template/jobs': patch
'@template/billing': patch
'@template/email': patch
---

Remediate the weekly `pnpm audit` high-severity advisories (issues #1, #9). Bump security-relevant runtime dependencies to patched versions:

- **next** 15.1.2 → 15.5.20 (critical middleware auth bypass, RCE in the RSC flight protocol, several DoS) — within the existing `^15` range.
- **drizzle-orm** 0.36 → 0.45.2 (high: SQL injection via improperly escaped identifiers) — used by `@template/db`, `@template/jobs`, `@template/billing`, and `apps/admin` under the service role.
- **@opentelemetry/sdk-node** 0.54 → 0.220 and **@opentelemetry/resources** 1.x → 2.x (high: exporter crash, unbounded baggage memory). The `resources` 2.0 breaking change replaces `new Resource(...)` with `resourceFromAttributes(...)` in `otel.ts`.
- **nodemailer** 6 → 9 in the dev SMTP transport (high: raw-option SSRF / file read).
- **vitest** 2 → 3.2.7 (critical: UI-server arbitrary file read) across the test workspaces.

Transitive-only advisories (next via react-email, glob, rollup, vite) are pinned through `pnpm-workspace.yaml` overrides. `pnpm audit --audit-level=high` is now clean (was 3 critical + 15 high); the remaining findings are moderate/low dev-and-build tooling that do not trip the weekly gate.
