import type { EmailProvider } from './provider.js';
import { ResendProvider } from './providers/resend.js';
import { SmtpProvider } from './providers/smtp.js';

export type SelectProviderEnv = {
  NODE_ENV?: string;
  MAIL_PROVIDER?: 'resend' | 'smtp';
  RESEND_API_KEY?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: number | string;
  SMTP_USER?: string;
  SMTP_PASS?: string;
};

/**
 * Pick the provider per env without forcing callers to import both adapters.
 *
 * Order of precedence:
 *   1. explicit MAIL_PROVIDER env var
 *   2. NODE_ENV === 'production' → resend
 *   3. fallback → smtp (InBucket in dev)
 */
export function selectEmailProvider(env: SelectProviderEnv = process.env as SelectProviderEnv): EmailProvider {
  const choice =
    env.MAIL_PROVIDER ?? (env.NODE_ENV === 'production' ? 'resend' : 'smtp');

  if (choice === 'resend') {
    if (!env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is required when MAIL_PROVIDER=resend');
    }
    return new ResendProvider({ apiKey: env.RESEND_API_KEY });
  }

  const host = env.SMTP_HOST ?? '127.0.0.1';
  const port = Number(env.SMTP_PORT ?? 54325); // InBucket default exposed in supabase/config.toml
  return new SmtpProvider({ host, port, user: env.SMTP_USER, pass: env.SMTP_PASS });
}
