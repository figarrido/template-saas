# Frontend

## UI library

**Decision:** **shadcn/ui + Tailwind.** Components copied into `packages/ui`, not installed from npm — standard shadcn pattern.

**Why:**
- Sets the bar for component DX without coupling to a heavyweight design system.
- Owning the component source means derived projects can extend or rip pieces without forking a dependency.

**Tradeoffs:**
- Component updates are pull-based (re-run `shadcn add`), not automatic. Acceptable; documented in `packages/ui/README.md`.

**Related:** [11-config](./11-config.md), [forms](#form--validation--toast-layer)

---

## Email

**Decision:** **Resend** + **React Email** for production. **InBucket** (bundled with Supabase local stack) for dev via a dev-only `SmtpProvider`. Templates live in `packages/email`.

**Mechanics:**
- `packages/email` exports a provider interface; the `ResendProvider` is used in prod, an `SmtpProvider` pointing at InBucket (`localhost`, port from `supabase status`) is used in dev.
- Adapter selected by `NODE_ENV` / a `MAIL_PROVIDER` env var.
- InBucket's web UI (surfaced by `supabase status`) shows sent emails with HTML preview.

**Why:**
- React Email gives JSX-based templates with HTML preview — better DX than Handlebars/mjml.
- InBucket is already running in the Supabase local stack; piggy-backing on it costs nothing and gives better DX than stdout logs.

**Tradeoffs:**
- Dev adapter is ~50 lines of code prod will never use. Benefit: every derived project's email development "just works."

**Related:** [03-auth](./03-auth.md), [12-local-dev](./12-local-dev.md)

---

## Form / validation / toast layer

**Decision:** **React Hook Form + Zod + Sonner.** Shared form primitives in `packages/ui/forms`.

**Mechanics:**
- **React Hook Form** for client form state. Uncontrolled-first, cheap re-renders.
- **Zod** for validation, reusing the same schemas the API boundary uses — one schema definition serves the client form and the Server Action's server-side parse.
- **Sonner** for toasts (shadcn's official pick as of mid-2024).
- `packages/ui/forms` exports `Field`, `Label`, `ErrorMessage`, `FormProvider` primitives wrapping shadcn + RHF, so derived projects don't redo the wiring per form.

**Why:**
- De-facto standard pairing in the Next.js ecosystem; minimal ramp-up for contributors.
- Schema reuse between client and server eliminates a class of drift bug.

**Tradeoffs:**
- RHF + Server Actions integration has rough edges (validation timing across client/server, pending states). Documented in package README; not blocking.

**Related:** [09-api-boundary](./09-api-boundary.md)

---

## Theming (dark mode)

**Decision:** Wired toggle, **defaults to `prefers-color-scheme`**, choice persisted in a cookie (SSR-safe, no flash).

**Mechanics:**
- Via `next-themes`. Switcher component in the user menu of both `apps/web` and `apps/admin`.
- Cookie (not localStorage) so the HTML class is set server-side from the cookie, preventing flash of wrong theme on first paint.
- shadcn primitives already support dark/light tokens.

**Why:**
- Defaulting to system means dark-mode-on devices get dark mode immediately.
- Cost to ship is ~10 lines + a switcher component. Retrofitting later is meaningfully more work.

**Tradeoffs:**
- Derived projects that want a single hard-coded theme delete the switcher and pin the cookie value. ~5 minutes.

---

## Folder structure within each Next.js app

**Decision:** Same layout for `apps/web` and `apps/admin`. Server Actions and data-access helpers live in `lib/`, not co-located inside route files. Apps don't import each other.

**Layout:**

```
app/
  (auth)/              # route group: signup, login, verify, accept-invite
  (marketing)/         # web-only: public landing
  (app)/               # authenticated app
    [orgSlug]/
      layout.tsx       # active-org middleware lift
      dashboard/
      settings/
  api/                 # Route Handlers (webhooks, public API surface)
components/            # app-local components (compose from packages/ui)
lib/
  actions/             # Server Actions, grouped by domain
  data/                # data-access helpers (RSC reads)
  utils/
middleware.ts          # auth, active-org, CSP nonce, rate-limit
```

**Conventions:**
- **Server Actions in `lib/actions/<domain>.ts`**, not co-located in route files. Grep-able; prevents accidental re-export from a page module.
- **Data-access helpers in `lib/data/<domain>.ts`**. Server Components call them directly; helpers wrap supabase-js and use `cache()` for per-request memoization. See [02-data](./02-data.md).
- **Cross-app shared logic lives in `packages/*`**. `apps/admin` never imports from `apps/web` and vice versa.

**Tradeoffs:**
- Some developers prefer co-located actions/data files inside route segments. The split-out convention scales better and is grep-friendly; derived projects can move things around.

**Related:** [02-data](./02-data.md), [09-api-boundary](./09-api-boundary.md), [11-config](./11-config.md)
