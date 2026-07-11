'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Badge,
  Field,
  FieldLabel,
  FieldError,
  Input,
  useZodForm,
  toast,
} from '@template/ui';
import { grantCompSchema, type GrantCompInput } from '@/lib/schemas/comps';
import { grantCompAction, revokeCompAction } from '@/lib/actions/comps';
import type { ActiveComp } from '@template/billing/entitlements';
import type { PlanOption } from '@/lib/data/organizations';

const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

export function CompsPanel({
  organizationId,
  plans,
  comps,
}: {
  organizationId: string;
  plans: PlanOption[];
  comps: ActiveComp[];
}) {
  const router = useRouter();
  const [isRevoking, startRevoke] = useTransition();
  const form = useZodForm(grantCompSchema, { defaultValues: { planId: '', expiresAt: '' } });

  async function onGrant(values: GrantCompInput) {
    const result = await grantCompAction(organizationId, values);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('Comp granted.');
    form.reset({ planId: '', expiresAt: '' });
    router.refresh();
  }

  function onRevoke(planId: string) {
    startRevoke(async () => {
      const result = await revokeCompAction(organizationId, planId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success('Comp revoked.');
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Comps</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <form onSubmit={form.handleSubmit(onGrant)} className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="planId">Plan</FieldLabel>
            <select id="planId" className={selectClass} {...form.register('planId')}>
              <option value="">Select a plan…</option>
              {plans.map((p) => (
                <option key={p.planId} value={p.planId}>
                  {p.name}
                </option>
              ))}
            </select>
            <FieldError message={form.formState.errors.planId?.message} />
          </Field>
          <Field>
            <FieldLabel htmlFor="expiresAt">Expiry</FieldLabel>
            <Input id="expiresAt" type="date" {...form.register('expiresAt')} />
            <FieldError message={form.formState.errors.expiresAt?.message} />
          </Field>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Granting…' : 'Grant Comp'}
          </Button>
        </form>

        {comps.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active comps.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Keys</th>
                <th className="px-4 py-3 font-medium">Expires</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {comps.map((c) => (
                <tr key={c.planId} className="border-b last:border-0">
                  <td className="px-4 py-3">{c.planName}</td>
                  <td className="px-4 py-3">
                    {c.keys.map((k) => (
                      <Badge key={k} variant="secondary" className="mr-1 font-mono">
                        {k}
                      </Badge>
                    ))}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {c.expiresAt ? new Date(c.expiresAt).toISOString().slice(0, 10) : 'No expiry'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isRevoking}
                      onClick={() => onRevoke(c.planId)}
                    >
                      Revoke
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
