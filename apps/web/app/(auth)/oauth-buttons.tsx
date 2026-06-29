'use client';

import { useTransition } from 'react';
import { Button, toast } from '@template/ui';
import { oauthSignInButtons, type OAuthProvider } from '@template/auth';
import { oauthSignInAction } from '@/lib/actions/auth';

// Issue #8 — dynamic OAuth button list. Driven by `oauthSignInButtons()`,
// which is the wired-but-dormant seam: every provider in
// `packages/auth/src/providers.ts` ships disabled, so this renders nothing
// today. Flipping a provider's `enabled` flag is the only code change
// needed to surface its button on sign-in / sign-up. Identity auto-linking
// on a provider-verified-email match is the Supabase default (ADR 0004).

export function OAuthButtons() {
  const buttons = oauthSignInButtons();
  const [pending, startTransition] = useTransition();

  if (buttons.length === 0) return null;

  function onClick(provider: OAuthProvider) {
    startTransition(async () => {
      const result = await oauthSignInAction(provider);
      // A successful initiation `redirect()`s server-side; we only land here
      // on failure to obtain a provider URL.
      if (!result.ok) toast.error(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {buttons.map((b) => (
        <Button
          key={b.provider}
          type="button"
          variant="outline"
          onClick={() => onClick(b.provider)}
          disabled={pending}
        >
          {b.label}
        </Button>
      ))}
    </div>
  );
}
