// Password policy constants. Length-first per the parent PRD: minimum 10,
// no composition rules, leaked-password (HIBP) protection enforced
// server-side by Supabase. The shared Zod schema in `./schemas.ts` mirrors
// this length so client and Server Action agree.

export const PASSWORD_POLICY = {
  minLength: 10,
} as const;
