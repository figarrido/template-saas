export type { EmailMessage, EmailProvider, EmailSendResult } from './provider.js';
export { ResendProvider, type ResendProviderConfig } from './providers/resend.js';
export { SmtpProvider, type SmtpProviderConfig } from './providers/smtp.js';
export { selectEmailProvider, type SelectProviderEnv } from './select.js';
// Templates are JSX — import via `@template/email/templates` so Node-only
// surfaces (worker-node) don't need a JSX-aware tsconfig. The auth
// send-email hook depends on those templates and is therefore exposed via
// `@template/email/hooks/send-email`, not from the root entry.
