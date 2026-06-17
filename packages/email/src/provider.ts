import type { ReactElement } from 'react';

export type EmailMessage = {
  to: string | string[];
  from: string;
  replyTo?: string;
  subject: string;
  /** Pre-rendered HTML body. Pass `react` instead to let the provider render. */
  html?: string;
  text?: string;
  /** React Email component — providers render it before sending. */
  react?: ReactElement;
  headers?: Record<string, string>;
};

export type EmailSendResult = {
  id?: string;
  provider: 'resend' | 'smtp';
};

export interface EmailProvider {
  readonly name: 'resend' | 'smtp';
  send(message: EmailMessage): Promise<EmailSendResult>;
}
