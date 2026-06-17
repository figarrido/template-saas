export type { EmailMessage, EmailProvider, EmailSendResult } from './provider.js';
export { ResendProvider, type ResendProviderConfig } from './providers/resend.js';
export { SmtpProvider, type SmtpProviderConfig } from './providers/smtp.js';
export { selectEmailProvider, type SelectProviderEnv } from './select.js';
export * from './templates/index.js';
