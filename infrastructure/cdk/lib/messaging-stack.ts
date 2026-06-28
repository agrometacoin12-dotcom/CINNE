import * as cdk from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'node:path';
import { Construct } from 'constructs';

export interface MessagingStackProps extends cdk.StackProps {
  stage: string;
}

/**
 * Async backbone: a domain-event bus, an SQS-buffered worker for fan-out
 * processing, an SNS topic for push, SES transactional templates, and a Step
 * Functions onboarding workflow triggered when a user registers.
 */
export class MessagingStack extends cdk.Stack {
  public readonly bus: events.EventBus;
  public readonly pushTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: MessagingStackProps) {
    super(scope, id, props);
    const fromAddress = `no-reply@cinnetemple.com`;

    this.bus = new events.EventBus(this, 'Bus', { eventBusName: 'cinnetemple' });
    this.pushTopic = new sns.Topic(this, 'PushTopic', {
      topicName: `cinnetemple-${props.stage}-push`,
    });

    // ── SES transactional templates ──────────────────────────────────────
    new ses.CfnTemplate(this, 'WelcomeTemplate', {
      template: {
        templateName: 'CinneTempleWelcome',
        subjectPart: 'Welcome to CinneTemple, {{displayName}} 🎬',
        htmlPart:
          '<h1>Welcome, {{displayName}}!</h1><p>Your cinema, reimagined. Start exploring tonight.</p>',
        textPart: 'Welcome, {{displayName}}! Your cinema, reimagined.',
      },
    });
    new ses.CfnTemplate(this, 'NewReleaseTemplate', {
      template: {
        templateName: 'CinneTempleNewRelease',
        subjectPart: 'New on CinneTemple: {{title}}',
        htmlPart: '<h2>{{title}}</h2><p>{{tagline}}</p><p>Now streaming.</p>',
        textPart: '{{title}} — {{tagline}}. Now streaming on CinneTemple.',
      },
    });

    // ── Worker Lambda (SES sender) ───────────────────────────────────────
    const worker = new lambdaNodejs.NodejsFunction(this, 'NotificationWorker', {
      functionName: `cinnetemple-${props.stage}-notification-worker`,
      entry: path.join(__dirname, '..', 'lambdas', 'notification-worker', 'index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(30),
      environment: { SES_FROM_ADDRESS: fromAddress },
    });
    worker.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ses:SendTemplatedEmail', 'ses:SendEmail'],
        resources: ['*'],
      }),
    );

    // ── SQS buffer (EventBridge → SQS → worker) with DLQ ─────────────────
    const dlq = new sqs.Queue(this, 'WorkerDLQ', {
      queueName: `cinnetemple-${props.stage}-worker-dlq`,
      retentionPeriod: cdk.Duration.days(14),
    });
    const queue = new sqs.Queue(this, 'WorkerQueue', {
      queueName: `cinnetemple-${props.stage}-worker`,
      visibilityTimeout: cdk.Duration.seconds(60),
      deadLetterQueue: { queue: dlq, maxReceiveCount: 5 },
    });
    worker.addEventSource(new lambdaEventSources.SqsEventSource(queue, { batchSize: 10 }));

    // Route domain events that need fan-out processing to the queue.
    new events.Rule(this, 'EventsToQueue', {
      eventBus: this.bus,
      eventPattern: {
        source: ['cinnetemple.backend'],
        detailType: ['watchlist.added', 'title.released'],
      },
      targets: [new targets.SqsQueue(queue)],
    });

    // ── Step Functions onboarding workflow (on user.registered) ──────────
    const sendWelcome = new tasks.LambdaInvoke(this, 'SendWelcomeEmail', {
      lambdaFunction: worker,
      payload: sfn.TaskInput.fromObject({
        action: 'welcome',
        'email.$': '$.detail.email',
        'displayName.$': '$.detail.displayName',
      }),
    });
    const waitADay = new sfn.Wait(this, 'WaitOneDay', {
      time: sfn.WaitTime.duration(cdk.Duration.days(1)),
    });
    const definition = sendWelcome.next(waitADay).next(new sfn.Succeed(this, 'Onboarded'));

    const onboarding = new sfn.StateMachine(this, 'Onboarding', {
      stateMachineName: `cinnetemple-${props.stage}-onboarding`,
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      timeout: cdk.Duration.days(2),
    });

    new events.Rule(this, 'UserRegisteredRule', {
      eventBus: this.bus,
      eventPattern: { source: ['cinnetemple.backend'], detailType: ['user.registered'] },
      targets: [new targets.SfnStateMachine(onboarding)],
    });

    new cdk.CfnOutput(this, 'EventBusName', { value: this.bus.eventBusName });
    new cdk.CfnOutput(this, 'PushTopicArn', { value: this.pushTopic.topicArn });
  }
}
