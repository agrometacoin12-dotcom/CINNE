import {
  SendEmailCommand,
  SendTemplatedEmailCommand,
  SESClient,
} from '@aws-sdk/client-ses';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Transactional email via Amazon SES. In non-production with no AWS credentials
 * configured, emails are logged instead of sent so local flows work offline.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly client: SESClient;
  private readonly from: string;
  private readonly liveSend: boolean;

  constructor(private readonly config: ConfigService) {
    this.client = new SESClient({ region: this.config.get<string>('region') });
    this.from = this.config.get<string>('ses.fromAddress')!;
    this.liveSend = this.config.get<string>('env') === 'production';
  }

  async sendVerificationCode(to: string, code: string): Promise<void> {
    await this.send(to, 'Verify your CinneTemple account', `Your verification code is ${code}.`);
  }

  async sendPasswordResetCode(to: string, code: string): Promise<void> {
    await this.send(to, 'Reset your CinneTemple password', `Your password reset code is ${code}.`);
  }

  /**
   * Sends a managed SES template (deployed by infrastructure/cdk). Falls back to
   * logging in non-production / without AWS credentials.
   */
  async sendTemplated(to: string, templateName: string, data: Record<string, unknown>): Promise<void> {
    if (!this.liveSend) {
      this.logger.log(`[DEV EMAIL] template=${templateName} to=${to} data=${JSON.stringify(data)}`);
      return;
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

  private async send(to: string, subject: string, body: string): Promise<void> {
    if (!this.liveSend) {
      this.logger.log(`[DEV EMAIL] to=${to} subject="${subject}" body="${body}"`);
      return;
    }
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
}
