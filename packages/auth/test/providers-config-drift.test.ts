import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROVIDERS } from '../src/providers.js';

// Issue #8 — drift gate. The "config only" promise from the commit message
// ("PROVIDERS[i].enabled=true + env vars + supabase/config.toml — no flow
// rework") only holds if every provider we ship is *already* present in
// supabase/config.toml as wired-but-disabled. Otherwise a derived project has
// to hand-author a whole [auth.external.X] block from scratch — which is
// exactly the rework we said wasn't needed. This test pins the alignment.

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = resolve(__dirname, '../../../supabase/config.toml');
const configToml = readFileSync(configPath, 'utf8');

function sectionFor(provider: string): string | null {
  // Grab the block from `[auth.external.<provider>]` up to the next `[` header.
  const header = `[auth.external.${provider}]`;
  const start = configToml.indexOf(header);
  if (start === -1) return null;
  const rest = configToml.slice(start + header.length);
  const nextHeader = rest.search(/\n\[/);
  return nextHeader === -1 ? rest : rest.slice(0, nextHeader);
}

describe('PROVIDERS ↔ supabase/config.toml drift', () => {
  for (const config of PROVIDERS) {
    describe(`[auth.external.${config.provider}]`, () => {
      const section = sectionFor(config.provider);

      it('has a wired section in supabase/config.toml', () => {
        expect(section, `missing [auth.external.${config.provider}]`).not.toBeNull();
      });

      it('ships disabled (the seam is dormant by default)', () => {
        expect(section).toMatch(/^\s*enabled\s*=\s*false\b/m);
      });

      it('references every declared env var via env() substitution', () => {
        // Both halves of the credential pair (client_id + secret) must be wired
        // through env() so "flip enabled + add env vars" really is all a
        // derived project does — no string literal to edit in the toml.
        for (const envVar of config.envVars) {
          expect(section, `[auth.external.${config.provider}] missing env(${envVar})`).toMatch(
            new RegExp(`env\\(${envVar}\\)`),
          );
        }
      });
    });
  }
});
