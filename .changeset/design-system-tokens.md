---
'@template/ui': minor
'@template/config': minor
---

Design tokens now derive from the root `DESIGN.md` (the getdesign.md/DESIGN.md standard, with Notion as the neutral reference). Updates `packages/ui/src/globals.css` and `packages/config/tailwind/preset.ts` with the new token set, refreshes `badge` and `typography` for the new tokens, and adds a "Foundations" section (color + radius swatches) to the `apps/web` design-system showcase page.
