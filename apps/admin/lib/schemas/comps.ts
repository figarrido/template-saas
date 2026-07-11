import { z } from 'zod';

export const grantCompSchema = z.object({
  planId: z.string().uuid('Select a plan.'),
  expiresAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose an expiry date.')
    .refine((v) => new Date(`${v}T23:59:59.999Z`).getTime() > Date.now(), {
      message: 'Expiry must be in the future.',
    }),
});
export type GrantCompInput = z.infer<typeof grantCompSchema>;

export function compExpiryToIso(expiresAt: string): string {
  return new Date(`${expiresAt}T23:59:59.999Z`).toISOString();
}
