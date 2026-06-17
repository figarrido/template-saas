import { Resend } from 'resend';
import type { EmailMessage, EmailProvider, EmailSendResult } from '../provider.js';

export type ResendProviderConfig = {
  apiKey: string;
};

export class ResendProvider implements EmailProvider {
  readonly name = 'resend' as const;
  private readonly client: Resend;

  constructor(config: ResendProviderConfig) {
    this.client = new Resend(config.apiKey);
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const result = await this.client.emails.send({
      from: message.from,
      to: message.to,
      subject: message.subject,
      replyTo: message.replyTo,
      html: message.html,
      text: message.text,
      react: message.react,
      headers: message.headers,
    });
    if (result.error) {
      throw new Error(`Resend send failed: ${result.error.message}`);
    }
    return { id: result.data?.id, provider: 'resend' };
  }
}
