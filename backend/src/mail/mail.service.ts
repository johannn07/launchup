import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transport: Transporter | null = null;
  private from = '';
  private loginUrl: string;

  constructor(config: ConfigService) {
    const host = config.get<string>('SMTP_HOST');
    const user = config.get<string>('SMTP_USER');
    const pass = config.get<string>('SMTP_PASS');
    // The first deployed origin; registration emails link back to it.
    const origin =
      config
        .get<string>('FRONTEND_ORIGINS')
        ?.split(',')
        .map((o) => o.trim())
        .find(Boolean) ?? 'http://localhost:5173';
    this.loginUrl = `${origin.replace(/\/$/, '')}/login`;

    if (!host || !user || !pass) {
      this.logger.warn(
        'Mail not configured (SMTP_* vars): registration emails will not be sent.',
      );
      return;
    }
    const port = Number(config.get<string>('SMTP_PORT') ?? 587);
    this.from = config.get<string>('MAIL_FROM') || `LaunchUp <${user}>`;
    // 465 is implicit TLS; 587 upgrades with STARTTLS.
    this.transport = createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }

  get isEnabled(): boolean {
    return this.transport !== null;
  }

  // SRS 1.1. Never throws: a mail outage must not fail the registration.
  async sendRegistrationConfirmation(to: string, firstName?: string) {
    if (!this.transport) return;
    const name = firstName?.trim() || 'there';
    try {
      await this.transport.sendMail({
        from: this.from,
        to,
        subject: 'Your LaunchUp account is ready',
        text: [
          `Hi ${name},`,
          '',
          `Your LaunchUp account for ${to} has been created.`,
          `Sign in here: ${this.loginUrl}`,
          '',
          'If you did not register, you can ignore this email.',
        ].join('\n'),
        html: `<p>Hi ${escapeHtml(name)},</p>
<p>Your LaunchUp account for ${escapeHtml(to)} has been created.</p>
<p><a href="${this.loginUrl}">Sign in to LaunchUp</a></p>
<p>If you did not register, you can ignore this email.</p>`,
      });
    } catch (err) {
      this.logger.warn(
        `Registration email to ${to} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
