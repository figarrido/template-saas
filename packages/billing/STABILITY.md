# Stability

`@template/billing` is pinned at `0.x.y` until at least one derived project ships a non-Stripe `BillingProvider` adapter that passes the conformance suite and a non-Stripe `EmitterProvider` adapter that exercises the emit/void/getStatus surface end-to-end.

Until that happens, the abstraction has only seen one concrete shape (Stripe) and the interface will move as the second adapter reveals gaps. **Derived projects must pin exact versions** — patch bumps may break callers.

Per `docs/architecture/04-billing.md`:

- No second billing adapter ships in the template.
- No concrete `EmitterProvider` adapter ships — the interface ships, derived projects implement.
- `providerMetadata` on the domain types is the escape hatch for vendor-specific fields that don't generalize.
