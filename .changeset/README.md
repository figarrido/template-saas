# Changesets

Per `docs/architecture/08-platform.md` § Release / versioning:

- Every PR that touches `packages/*` must include a changeset.
- Apps (`apps/*`) and services (`services/*`) are unversioned — they're deployed, not published.
- `packages/billing` is pinned `0.x.y` until the first non-Stripe adapter exists.

To create a changeset:

```sh
pnpm changeset
```

Pick the affected packages, the bump level (patch/minor/major), and write a short summary. CI enforces that PRs touching `packages/**` ship at least one changeset file.
