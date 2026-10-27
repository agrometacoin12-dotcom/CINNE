import { randomUUID } from 'node:crypto';
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { MailService } from '../auth/mail.service';

type Alert = { id: string; event_key: string; recipient: string; subject: string; body: string; attempts: number; first_attempt_at: Date; lease_token: string };

/** Transactional database outbox. Trigger writes roll back with the business event. */
@Injectable()
export class EmailAlertsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailAlertsService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(private readonly prisma: PrismaService, private readonly mail: MailService, private readonly config: ConfigService) {}
  onModuleInit() {
    if (this.config.get('env') !== 'production') return;
    this.timer = setInterval(() => void this.drain(), 15_000);
    this.timer.unref();
    void this.drain();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async drain() {
    if (this.running) return;
    this.running = true;
    try {
      // One row at a time: keep every lease shorter than its five-minute expiry.
      for (let i = 0; i < 20; i++) {
        const token = randomUUID();
        const rows = await this.prisma.$queryRaw<Alert[]>`
          UPDATE email_alerts SET status='SENDING', lease_token=${token}::uuid,
            attempts=attempts+1, first_attempt_at=COALESCE(first_attempt_at,now()),
            available_at=now()+interval '5 minutes'
          WHERE id=(SELECT id FROM email_alerts WHERE status IN ('PENDING','SENDING')
            AND available_at<=now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
          RETURNING *`;
        const row = rows[0];
        if (!row) break;
        try {
          if (Date.now() - new Date(row.first_attempt_at).getTime() >= 20 * 3600_000 || row.attempts > 12) {
            throw new Error('RETRY_WINDOW_EXPIRED');
          }
          if (row.recipient === '@admins') {
            const recipients = [...new Set(this.config.get<string[]>('adminEmails') ?? [])]
              .map(s => s.trim().toLowerCase()).filter(s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
            if (!recipients.length) throw new Error('ADMIN_RECIPIENTS_MISSING');
            await this.prisma.$transaction(async tx => {
              for (const recipient of recipients) {
                await tx.$executeRaw`SELECT ct_queue_mail(${row.event_key},${recipient},${row.subject},${row.body})`;
              }
              await tx.$executeRaw`UPDATE email_alerts SET status='ACCEPTED',accepted_at=now(),lease_token=NULL
                WHERE id=${row.id}::uuid AND lease_token=${token}::uuid`;
            });
          } else {
            // Stable across retries/restarts, within Resend's 24-hour deduplication window.
            await this.mail.sendPlain(row.recipient, row.subject, row.body, `alert-${row.id}`);
            await this.prisma.$executeRaw`UPDATE email_alerts SET status='ACCEPTED',accepted_at=now(),lease_token=NULL,last_error=NULL
              WHERE id=${row.id}::uuid AND lease_token=${token}::uuid`;
          }
        } catch (error) {
          const expired = (error as Error)?.message === 'RETRY_WINDOW_EXPIRED';
          const dead = expired || row.attempts >= 12;
          const delaySeconds = Math.min(3600, 30 * 2 ** Math.min(row.attempts, 7));
          const reason = expired ? 'RETRY_WINDOW_EXPIRED' : (error as Error)?.message === 'ADMIN_RECIPIENTS_MISSING' ? 'ADMIN_RECIPIENTS_MISSING' : 'DELIVERY_FAILED';
          await this.prisma.$executeRaw`UPDATE email_alerts SET status=${dead ? 'FAILED' : 'PENDING'},
            available_at=now()+${delaySeconds}*interval '1 second',lease_token=NULL,last_error=${reason}
            WHERE id=${row.id}::uuid AND lease_token=${token}::uuid`;
          this.logger.warn(`Email alert ${row.id}: ${reason}${dead ? ' (manual review required)' : ''}`);
        }
        // Resend's default rate limit is two requests per second across the account.
        await new Promise(resolve => setTimeout(resolve, 600));
      }
    } catch {
      this.logger.error('Email alert queue unavailable; retrying on next interval');
    } finally { this.running = false; }
  }

  async status() {
    const counts = await this.prisma.$queryRaw<Array<{status:string; count:bigint}>>`SELECT status, count(*) FROM email_alerts GROUP BY status`;
    const failed = await this.prisma.$queryRaw<Array<{id:string; subject:string; attempts:number; last_error:string; created_at:Date}>>`
      SELECT id,subject,attempts,last_error,created_at FROM email_alerts WHERE status='FAILED' ORDER BY created_at DESC LIMIT 50`;
    return { counts: counts.map(r => ({status:r.status,count:Number(r.count)})), failed };
  }
}
