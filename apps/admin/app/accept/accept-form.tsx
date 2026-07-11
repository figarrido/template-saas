'use client';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
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
import { acceptOperatorInvitationAction } from '@/lib/actions/operators';

type Props = {
  token: string;
  requiresPassword: boolean;
  email: string;
};

const schema = z.object({ password: z.string() });
type Values = z.infer<typeof schema>;

export function AcceptForm({ token, requiresPassword, email }: Props) {
  const router = useRouter();
  // Default the password to '' so the field's absence in the existing-user
  // branch (no password input rendered) still passes `z.string()` validation —
  // otherwise handleSubmit rejects the undefined value and never fires onSubmit.
  const form = useZodForm(schema, { defaultValues: { password: '' } });

  async function onSubmit(values: Values) {
    const result = await acceptOperatorInvitationAction({ token, password: values.password });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('Operator access granted — sign in to continue.');
    router.push('/login');
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Accept Operator Invitation</CardTitle>
      </CardHeader>
      <CardContent>
        {!requiresPassword && (
          <p className="mb-4 text-sm text-muted-foreground">
            You already have an account ({email}) — accepting grants Operator access; sign in to
            continue.
          </p>
        )}
        <form method="post" onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          {requiresPassword && (
            <Field>
              <FieldLabel htmlFor="password">Set a password</FieldLabel>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                {...form.register('password')}
              />
              <FieldError message={form.formState.errors.password?.message} />
            </Field>
          )}
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Accepting…' : 'Accept & grant operator access'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
