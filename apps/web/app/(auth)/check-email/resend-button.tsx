'use client';

import { useState } from 'react';
import { Button, Input, toast } from '@template/ui';
import { resendVerificationAction } from '@/lib/actions/auth';

// The `email` query string from sign-up is treated as a hint, never as a
// trust boundary — the resend Server Action always returns the generic
// "if that account exists..." message so this UI can't be used as an
// enumeration oracle. If the URL was visited cold (no email in the
// query string) we let the User type one in.

export function ResendVerificationButton({ email }: { email?: string }) {
  const [value, setValue] = useState(email ?? '');
  const [submitting, setSubmitting] = useState(false);

  async function onResend() {
    if (!value) return;
    setSubmitting(true);
    const result = await resendVerificationAction({ email: value });
    setSubmitting(false);
    if (result.ok) toast.success(result.data.message);
    else toast.error(result.error);
  }

  return (
    <div className="flex flex-col gap-2">
      {email ? null : (
        <Input
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      )}
      <Button type="button" variant="outline" onClick={onResend} disabled={submitting || !value}>
        {submitting ? 'Sending…' : 'Resend confirmation email'}
      </Button>
    </div>
  );
}
