/**
 * Notification worker.
 *
 * Invoked two ways:
 *  - As a Step Functions task (welcome onboarding) with a direct payload
 *    `{ action: 'welcome', email, displayName }`.
 *  - From SQS (EventBridge → SQS) with records whose body is an EventBridge
 *    envelope; used for fan-out processing of domain events.
 *
 * Sends transactional email via SES managed templates.
 */
import { SendTemplatedEmailCommand, SESClient } from '@aws-sdk/client-ses';

const ses = new SESClient({});
const FROM = process.env.SES_FROM_ADDRESS!;

interface WelcomePayload {
  action: 'welcome';
  email: string;
  displayName: string;
}

interface SqsEvent {
  Records: { body: string }[];
}

async function sendTemplate(to: string, template: string, data: Record<string, unknown>) {
  await ses.send(
    new SendTemplatedEmailCommand({
      Source: FROM,
      Destination: { ToAddresses: [to] },
      Template: template,
      TemplateData: JSON.stringify(data),
    }),
  );
}

async function handleDomainEvent(detailType: string, detail: Record<string, unknown>) {
  switch (detailType) {
    case 'user.registered':
      await sendTemplate(detail.email as string, 'CinneTempleWelcome', {
        displayName: (detail.displayName as string) ?? 'there',
      });
      break;
    default:
      console.log(`No handler for ${detailType}`);
  }
}

export const handler = async (event: WelcomePayload | SqsEvent): Promise<void> => {
  // Step Functions task path
  if ('action' in event && event.action === 'welcome') {
    await sendTemplate(event.email, 'CinneTempleWelcome', { displayName: event.displayName });
    return;
  }

  // SQS path (EventBridge envelopes)
  if ('Records' in event) {
    for (const record of event.Records) {
      const envelope = JSON.parse(record.body) as {
        'detail-type': string;
        detail: Record<string, unknown>;
      };
      await handleDomainEvent(envelope['detail-type'], envelope.detail);
    }
  }
};
