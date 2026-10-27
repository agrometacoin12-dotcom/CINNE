# Transactional email alerts

Production uses Resend, a sending-only domain-scoped API key, and no-reply@cinnetemple.com. Browser and mobile events share the backend. No historical backfill or marketing broadcasts occur.

| Event | Recipient | Delivery |
|---|---|---|
| Account activated, password changed | Account email | Durable queue |
| Verification/reset code | Account email | Immediate, bounded retries |
| Producer profile created | Producer and configured admins | Durable queue |
| Producer assigned / private link reissued | Producer | Immediate; assignment failure queues admin alert |
| Movie created, video attached/removed, published/drafted | Assigned producer and admins | Durable queue |
| Episode created/video changed | Assigned producer and admins | Durable queue |
| Coin credit, transfer, film funding/refund/payout, Apple refund/reversal | Wallet owner | Durable queue |
| Failed real top-up | Wallet owner | Durable queue |
| Real ticket paid/refunded/failed | Purchaser; gift recipient when applicable | Durable queue |
| Real ticket paid/refunded | Assigned producer | Durable queue; dashboard remains earnings authority |
| Withdrawal confirmation code | Producer | Immediate |
| Withdrawal submitted | Producer and admins | Durable queue |
| Withdrawal marked paid, rejected, expired | Producer | Durable queue |

Queue events are inserted by PostgreSQL triggers in the same transaction as the business event. These triggers are part of Prisma migration 20261026170000_transactional_email_alerts. A failed or rolled-back transaction creates no alert. Database status transitions—not browser return URLs—drive receipts. MOCK purchases and top-ups do not create real-money receipts. Isolated sandbox ledger tables are not subscribed.

The API worker polls every 15 seconds. Row locks and five-minute leases prevent concurrent workers from claiming the same active row. All retries use the same Resend idempotency key. Retries stop after 12 attempts or 20 hours from the first attempt, within Resend's 24-hour idempotency window. FAILED rows need investigation; do not blindly replay uncertain sends beyond that window. ACCEPTED means Resend accepted the message, not confirmed inbox delivery. Inspect Resend events for delivered/bounced status.

GET /v1/admin/email-alerts requires AdminGuard and returns counts plus failed alert IDs/reasons. Operational recipients come from ADMIN_EMAILS, deduplicated per event. Missing recipients produce a retained failure rather than dropping the alert. Queue rows contain transaction references, email addresses and message text; never OTPs, private dashboard keys, or complete bank details. Protect this table as customer data.

Upload alerts describe persisted catalogue/video attachments, not client-side upload progress or proof that an encode/playback succeeded. A disconnected client before persistence cannot create an upload-complete notification. Upload/encoder error telemetry is separate from these catalogue events.

Validation: Jest mail/queue/auth/producer tests; `test/email-alerts.sql` on an isolated migrated PostgreSQL database (transaction rolls back). Never run fixture tests on production. Keep code and trigger migration together when deploying or restoring the backend.
