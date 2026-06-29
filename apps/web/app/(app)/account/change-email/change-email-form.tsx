'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { z } from 'zod';
import {
  Button,
  Field,
  FieldError,
  FieldLabel,
  Input,
  useZodForm,
  toast,
} from '@template/ui';
import { changeEmailSchema } from '@template/auth';
import { changeEmailAction } from '@/lib/actions/auth';

// Same Zod schema validates client + Server Action (over the flow in
// `packages/auth`). On success we show the "check both inboxes" copy
// inline rather than navigating away — the User must keep this device's
// Session intact while they click the confirm links from the old + new
// addresses (issue #7 secure double-confirm).
//
// The no-password-identity branch (story 41) bounces the User to the
// recovery flow — they need to set a password before they can re-auth
// to change their email. The same shape as ChangePasswordForm.

type Values = z.infer<typeof changeEmailSchema>;

export function ChangeEmailForm() {
  const form = useZodForm(changeEmailSchema);
  const [needsRecovery, setNeedsRecovery] = useState(false);
  const [requested, setRequested] = useState<string | null>(null);

  async function onSubmit(values: Values) {
    const result = await changeEmailAction(values);

    if (!result.ok) {
      if (result.code === 'no-password-identity') {
        setNeedsRecovery(true);
      }
      toast.error(result.error);
      return;
    }

    form.reset();
    setRequested(result.data.message);
    toast.success(result.data.message);
  }

  if (needsRecovery) {
    return (
      <div className="flex flex-col gap-4">
        <p>
          Your account doesn&apos;t have a password yet. To change your email, first set a
          password via the password-reset flow.
        </p>
        <Button asChild>
          <Link href="/forgot-password">Set a password via recovery</Link>
        </Button>
      </div>
    );
  }

  if (requested) {
    return (
      <div className="flex flex-col gap-4">
        <p>{requested}</p>
        <p className="text-muted-foreground text-sm">
          You can keep using your current email to sign in until the change is confirmed.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor="currentPassword">Current password</FieldLabel>
        <Input
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          {...form.register('currentPassword')}
        />
        <FieldError message={form.formState.errors.currentPassword?.message} />
      </Field>
      <Field>
        <FieldLabel htmlFor="newEmail">New email</FieldLabel>
        <Input
          id="newEmail"
          type="email"
          autoComplete="email"
          {...form.register('newEmail')}
        />
        <FieldError message={form.formState.errors.newEmail?.message} />
        <p className="text-muted-foreground text-sm">
          We&apos;ll send confirmation links to both your current and new addresses. The change
          takes effect once both are clicked.
        </p>
      </Field>
      <Button type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? 'Sending…' : 'Change email'}
      </Button>
    </form>
  );
}
