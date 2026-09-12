import { config } from '../config/env.js';

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  loggedOnly?: boolean;
}

export class EmailService {
  /**
   * Dispatches an email using Resend (https://api.resend.com/emails).
   *
   * In non-production environments without RESEND_API_KEY, logs the email payload
   * to console without throwing to ensure uninterrupted local testing.
   *
   * This method catches all errors internally and returns a result status,
   * guaranteeing that callers are never disrupted by email delivery failures.
   */
  public async sendEmail(
    to: string,
    subject: string,
    body: string,
    html?: string,
  ): Promise<SendEmailResult> {
    const trimmedTo = to?.trim();
    if (!trimmedTo || !trimmedTo.includes('@')) {
      console.warn(`[Email] Skipping email dispatch: invalid recipient "${to}".`);
      return { success: false, error: 'Invalid recipient email' };
    }

    // Development fallback when no Resend API key is configured
    if (!config.email.resendApiKey) {
      if (config.isProduction) {
        console.error(`[Email Alert] RESEND_API_KEY is missing in production. Email dropped: to=${trimmedTo}, subject="${subject}"`);
        return { success: false, error: 'RESEND_API_KEY missing in production' };
      }

      console.info(
        `\n[Email Dev Log]\n  To: ${trimmedTo}\n  From: ${config.email.fromAddress}\n  Subject: ${subject}\n  Body:\n${body}\n`,
      );
      return { success: true, loggedOnly: true };
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.email.resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: config.email.fromAddress,
          to: [trimmedTo],
          subject,
          text: body,
          ...(html ? { html } : {}),
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[Email] Resend API responded with status ${response.status}: ${errText}`);
        return { success: false, error: `Resend HTTP ${response.status}: ${errText}` };
      }

      const data = (await response.json()) as { id?: string };
      console.info(`[Email] Sent email to ${trimmedTo} (Subject: "${subject}", ID: ${data?.id || 'n/a'})`);
      return { success: true, messageId: data?.id };
    } catch (err) {
      console.error(`[Email] Exception while sending email to ${trimmedTo}:`, err);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

export const emailService = new EmailService();
