'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  FieldError,
  FieldLabel,
  Input,
  useZodForm,
  toast,
} from '@template/ui';
import { verifyChallengeAction, redeemRecoveryCodeAction } from '@/lib/actions/mfa';

const totpSchema = z.object({ code: z.string().min(6, 'Enter the 6-digit code') });
const recoverySchema = z.object({ code: z.string().min(1, 'Enter your recovery code') });

type TotpValues = z.infer<typeof totpSchema>;
type RecoveryValues = z.infer<typeof recoverySchema>;

type Props = { factorId: string };

export function ChallengeForm({ factorId }: Props) {
  const router = useRouter();
  const [useRecovery, setUseRecovery] = useState(false);
  const totpForm = useZodForm(totpSchema);
  const recoveryForm = useZodForm(recoverySchema);

  async function onTotpSubmit(values: TotpValues) {
    const result = await verifyChallengeAction({ factorId, code: values.code });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    router.push('/');
  }

  async function onRecoverySubmit(values: RecoveryValues) {
    const result = await redeemRecoveryCodeAction({ code: values.code });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    router.push('/');
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{useRecovery ? 'Use a recovery code' : 'Authenticator verification'}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {useRecovery ? (
          <form
            method="post"
            onSubmit={recoveryForm.handleSubmit(onRecoverySubmit)}
            className="flex flex-col gap-4"
          >
            <Field>
              <FieldLabel htmlFor="recovery-code">Recovery code</FieldLabel>
              <Input
                id="recovery-code"
                type="text"
                autoComplete="off"
                {...recoveryForm.register('code')}
              />
              <FieldError message={recoveryForm.formState.errors.code?.message} />
            </Field>
            <Button type="submit" disabled={recoveryForm.formState.isSubmitting}>
              {recoveryForm.formState.isSubmitting ? 'Verifying…' : 'Redeem code'}
            </Button>
            <Button type="button" variant="outline" onClick={() => setUseRecovery(false)}>
              Use authenticator app instead
            </Button>
          </form>
        ) : (
          <form
            method="post"
            onSubmit={totpForm.handleSubmit(onTotpSubmit)}
            className="flex flex-col gap-4"
          >
            <Field>
              <FieldLabel htmlFor="totp-code">6-digit code</FieldLabel>
              <Input
                id="totp-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                {...totpForm.register('code')}
              />
              <FieldError message={totpForm.formState.errors.code?.message} />
            </Field>
            <Button type="submit" disabled={totpForm.formState.isSubmitting}>
              {totpForm.formState.isSubmitting ? 'Verifying…' : 'Verify'}
            </Button>
            <Button type="button" variant="outline" onClick={() => setUseRecovery(true)}>
              Use a recovery code
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
