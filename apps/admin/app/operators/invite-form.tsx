'use client';
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
import { inviteOperatorAction } from '@/lib/actions/operators';

const schema = z.object({ email: z.string().email('Enter a valid email address.') });
type Values = z.infer<typeof schema>;

export function InviteOperatorForm() {
  const form = useZodForm(schema);

  async function onSubmit(values: Values) {
    const result = await inviteOperatorAction(values);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('Invitation sent.');
    form.reset();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite Operator</CardTitle>
      </CardHeader>
      <CardContent>
        <form method="post" onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input id="email" type="email" autoComplete="email" {...form.register('email')} />
            <FieldError message={form.formState.errors.email?.message} />
          </Field>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Sending…' : 'Send invitation'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
