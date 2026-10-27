import { randomUUID } from 'node:crypto';
import { SendEmailCommand, SendTemplatedEmailCommand, SESClient } from '@aws-sdk/client-ses';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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
    await this.send(to, 'Verify your CinneTemple account', `Your verification code is ${code}.`);
  }

  async sendPasswordResetCode(to: string, code: string): Promise<void> {
    await this.send(to, 'Reset your CinneTemple password', `Your password reset code is ${code}.`);
  }

  /** Plain-text transactional email (producer links, withdrawal codes and updates). */
  async sendPlain(to: string, subject: string, body: string, idempotencyKey?: string): Promise<void> {
    await this.send(to, subject, body, idempotencyKey);
  }

  /**
   * Sends a managed SES template (deployed by infrastructure/cdk). Falls back to
   * logging in non-production / without AWS credentials.
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
    if (this.driver === 'resend') {
      if (templateName === 'CinneTempleWelcome') {
        return this.send(to, 'Welcome to CinneTemple', `Welcome, ${String(data.displayName ?? 'Member')}! Your cinema, reimagined.`);
      }
      if (templateName === 'CinneTempleNewRelease') {
        return this.send(to, `Now streaming: ${String(data.title ?? 'New release')}`, `${String(data.title ?? '')} — ${String(data.tagline ?? '')}. Now streaming on CinneTemple.`);
      }
      throw new ServiceUnavailableException('Email template is not configured');
    }
    await this.client.send(
      new SendTemplatedEmailCommand({
        Source: this.from,
        Destination: { ToAddresses: [to] },
        Template: templateName,
        TemplateData: JSON.stringify(data),
      }),
    );
  }

  private async send(to: string, subject: string, body: string, idempotencyKey?: string): Promise<void> {
    if (!this.liveSend) {
      this.logger.log('Development email suppressed');
      return;
    }
    if (this.driver === 'resend') return this.sendResend(to, subject, body, idempotencyKey);
    await this.client.send(
      new SendEmailCommand({
        Source: this.from,
        Destination: { ToAddresses: [to] },
        Message: {
          Subject: { Data: subject },
          Body: { Text: { Data: body } },
        },
      }),
    );
  }
  private async sendResend(to: string, subject: string, text: string, idempotencyKey: string = randomUUID()): Promise<void> {
    if (!this.resendKey) throw new ServiceUnavailableException('Email delivery is not configured');
    const body = JSON.stringify({ from: this.from, to: [to], subject, text });
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
