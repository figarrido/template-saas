'use client';

import { useState } from 'react';
import Link from 'next/link';
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
import { confirmEnrollmentAction } from '@/lib/actions/mfa';

const enrollSchema = z.object({ code: z.string().min(6, 'Enter the 6-digit code') });
type Values = z.infer<typeof enrollSchema>;

type Enrollment = {
  factorId: string;
  qrCode: string;
  secret: string;
};

type Props = {
  // null once the Operator is already enrolled (e.g. the post-verify
  // revalidation, or revisiting /enroll after setup): no new factor to confirm.
  enrollment: Enrollment | null;
};

export function EnrollForm({ enrollment }: Props) {
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const form = useZodForm(enrollSchema);

  async function onSubmit(values: Values) {
    if (!enrollment) return;
    const result = await confirmEnrollmentAction({
      factorId: enrollment.factorId,
      code: values.code,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setRecoveryCodes(result.data.recoveryCodes);
  }

  if (recoveryCodes) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Save your recovery codes</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Save these now — each works once and they will not be shown again.
          </p>
          <ul className="font-mono text-sm space-y-1 bg-muted p-4 rounded-md">
            {recoveryCodes.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>
          <Link href="/" className="w-full">
            <Button className="w-full">Continue to backoffice</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (!enrollment) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Authenticator ready</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">Your authenticator is set up.</p>
          <Link href="/" className="w-full">
            <Button className="w-full">Continue to backoffice</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Set up authenticator</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Scan the QR code with your authenticator app, or enter the secret manually.
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={enrollment.qrCode} alt="TOTP QR code" className="mx-auto" />
        <p className="text-xs text-muted-foreground text-center">
          Manual entry: <code className="font-mono">{enrollment.secret}</code>
        </p>
        <form method="post" onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="code">6-digit code</FieldLabel>
            <Input
              id="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              {...form.register('code')}
            />
            <FieldError message={form.formState.errors.code?.message} />
          </Field>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Verifying…' : 'Verify and continue'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
