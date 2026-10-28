import { randomUUID } from 'node:crypto';
import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { renderEmail } from './email/email-design';

/**
 * Transactional email via Resend or SES. Non-production suppresses delivery
 * without logging message bodies, reset codes or private producer links.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly client: SESClient;
  private readonly from: string;
  private readonly liveSend: boolean;
  private readonly driver: string;
  private readonly resendKey: string;

  constructor(private readonly config: ConfigService) {
    this.client = new SESClient({ region: this.config.get<string>('region') });
    this.from = this.config.get<string>('mail.from') || this.config.get<string>('ses.fromAddress') || 'no-reply@cinnetemple.com';
    this.driver = this.config.get<string>('mail.driver') ?? 'ses';
    this.resendKey = this.config.get<string>('mail.resendApiKey') ?? '';
    this.liveSend = this.config.get<string>('env') === 'production';
  }

  async sendVerificationCode(to: string, code: string): Promise<void> {
    await this.send(to, 'Verify your CinneTemple account', `Welcome to CinneTemple. Enter this code in the app to verify your email address:\n\n${code}\n\nIf you did not create an account, you can ignore this email.`);
  }

  async sendPasswordResetCode(to: string, code: string): Promise<void> {
    await this.send(to, 'Reset your CinneTemple password', `Enter this code in CinneTemple to reset your password:\n\n${code}\n\nIf you did not request a password reset, ignore this email. Your password has not been changed.`);
  }

  /** Transactional content delivered as branded HTML plus an unchanged text fallback. */
  async sendPlain(to: string, subject: string, body: string, idempotencyKey?: string): Promise<void> {
    await this.send(to, subject, body, idempotencyKey);
  }

  /**
   * Renders named templates locally for both providers, with identical branding.
   * Delivery is suppressed in non-production.
   */
  async sendTemplated(
    to: string,
    templateName: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    if (!this.liveSend) {
      this.logger.log('Development email suppressed (template)');
      return;
    }
    if (templateName === 'CinneTempleWelcome') {
      return this.send(to, 'Welcome to CinneTemple', `Hello ${String(data.displayName ?? 'Member')},\n\nYour CinneTemple account is ready. Discover your next movie and make a night of it.\n\nhttps://www.cinnetemple.com`);
    }
    if (templateName === 'CinneTempleNewRelease') {
      return this.send(to, `Now streaming: ${String(data.title ?? 'New release')}`, `${String(data.title ?? '')}\n\n${String(data.tagline ?? '')}\n\nNow streaming on CinneTemple.\nhttps://www.cinnetemple.com`);
    }
    throw new ServiceUnavailableException('Email template is not configured');
  }

  private async send(to: string, subject: string, body: string, idempotencyKey?: string): Promise<void> {
    if (!this.liveSend) {
      this.logger.log('Development email suppressed');
      return;
    }
    const html = renderEmail(subject, body);
    if (this.driver === 'resend') return this.sendResend(to, subject, body, html, idempotencyKey);
    await this.client.send(
      new SendEmailCommand({
        Source: this.from,
        Destination: { ToAddresses: [to] },
        Message: {
          Subject: { Data: subject },
          Body: { Text: { Data: body, Charset: 'UTF-8' }, Html: { Data: html, Charset: 'UTF-8' } },
        },
      }),
    );
  }
  private async sendResend(to: string, subject: string, text: string, html: string, idempotencyKey: string = randomUUID()): Promise<void> {
    if (!this.resendKey) throw new ServiceUnavailableException('Email delivery is not configured');
    const body = JSON.stringify({ from: this.from, to: [to], subject, text, html });
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST', signal: AbortSignal.timeout(10000),
          headers: { Authorization: `Bearer ${this.resendKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey }, body,
        });
        const result = await response.json().catch(() => null) as { id?: string } | null;
        if (response.ok && result?.id) {
          this.logger.log(`Resend accepted email id=${result.id}`);
          return;
        }
        if (response.status !== 429 && response.status < 500) {
          this.logger.error(`Resend rejected email: HTTP ${response.status}`);
          throw new ServiceUnavailableException('Email delivery is unavailable. Please try again later.');
        }
      } catch (error) {
        if (error instanceof ServiceUnavailableException) throw error;
        // Network timeouts may occur after acceptance; retries reuse the key.
      }
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
    this.logger.error('Resend email delivery failed after retries');
    throw new ServiceUnavailableException('Email delivery is unavailable. Please try again later.');
  }

}
