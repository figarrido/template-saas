# @template/ui

shadcn/ui primitives copied into source (not npm-installed), Tailwind preset, React Hook Form + Zod helpers, Sonner toasts, next-themes provider.

## Adding or refreshing a component

```sh
# from packages/ui
pnpm ui:add button   # rewrites src/components/button.tsx
pnpm ui:add dialog   # adds src/components/dialog.tsx
```

`pnpm ui:add` proxies to the shadcn CLI pinned in dev dependencies. Edit the regenerated file in place — the source is yours once it lands.

Primitives that ship out of the box: `button`, `input`, `label`, `card`. Re-run `pnpm ui:add` for the rest of the registry as needs come up. Don't pre-add components for "completeness" — every primitive is weight every consumer carries.
