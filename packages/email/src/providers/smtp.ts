import { createTransport, type Transporter } from 'nodemailer';
import { render } from '@react-email/components';
import type { EmailMessage, EmailProvider, EmailSendResult } from '../provider.js';

export type SmtpProviderConfig = {
  host: string;
  port: number;
  /** Optional auth — InBucket and most dev SMTP catchers ignore creds. */
  user?: string;
  pass?: string;
  secure?: boolean;
};

/**
 * Dev-only SMTP provider. Points at Supabase-bundled InBucket so engineers
 * can preview sent emails in the InBucket web UI without burning a Resend
 * quota or shipping unexpected mail. See docs/architecture/12-local-dev.md
 * § Email in dev.
 */
export class SmtpProvider implements EmailProvider {
  readonly name = 'smtp' as const;
  private readonly transport: Transporter;

  constructor(config: SmtpProviderConfig) {
    this.transport = createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure ?? false,
      auth: config.user ? { user: config.user, pass: config.pass } : undefined,
    });
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    let html = message.html;
    if (!html && message.react) {
      html = await render(message.react);
    }
    const info = await this.transport.sendMail({
      from: message.from,
      to: Array.isArray(message.to) ? message.to.join(', ') : message.to,
      replyTo: message.replyTo,
      subject: message.subject,
      html,
      text: message.text,
      headers: message.headers,
    });
    return { id: info.messageId, provider: 'smtp' };
  }
}
