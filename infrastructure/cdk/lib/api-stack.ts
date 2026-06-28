import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as opensearch from 'aws-cdk-lib/aws-opensearchservice';
import * as events from 'aws-cdk-lib/aws-events';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';
import * as path from 'node:path';
import { Construct } from 'constructs';

export interface ApiStackProps extends cdk.StackProps {
  stage: string;
  vpc: ec2.IVpc;
  dbSecret: secretsmanager.ISecret;
  redis: elasticache.CfnReplicationGroup;
  userPool: cognito.IUserPool;
  userPoolClient: cognito.IUserPoolClient;
  catalogueTable: dynamodb.ITable;
  mediaDistribution: cloudfront.IDistribution;
  searchDomain: opensearch.IDomain;
  eventBus: events.IEventBus;
  pushTopic: sns.ITopic;
  realtimeManagementEndpoint: string;
  /** Apex domain (e.g. "cinnetemple.com"); the API is served at api.<domain>. */
  domain?: string;
}

/**
 * Runs the NestJS backend on ECS Fargate behind an Application Load Balancer,
 * autoscaled on CPU, fronted by AWS WAF with managed OWASP + rate-limit rules.
 */
export class ApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);
    const isProd = props.stage === 'prod';

    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc: props.vpc,
      containerInsights: true,
    });

    // Build the NestJS image from source as a CDK Docker asset (pushed to ECR
    // automatically on deploy). Build context is the repo root so the pnpm
    // workspace is available to the Dockerfile.
    const repoRoot = path.resolve(__dirname, '..', '..', '..');
    const apiImage = ecs.ContainerImage.fromAsset(repoRoot, {
      file: 'apps/backend/Dockerfile',
      // Fargate runs linux/amd64; pin so builds on Apple Silicon match.
      platform: Platform.LINUX_AMD64,
    });

    // Optional custom domain + managed TLS: serves the API at api.<domain> over
    // HTTPS and redirects HTTP → HTTPS. Enabled by passing `--context domain=...`.
    let domainProps: Partial<ecsPatterns.ApplicationLoadBalancedFargateServiceProps> = {};
    if (props.domain) {
      const zone = route53.HostedZone.fromLookup(this, 'Zone', { domainName: props.domain });
      const apiDomain = `api.${props.domain}`;
      const certificate = new acm.Certificate(this, 'ApiCert', {
        domainName: apiDomain,
        validation: acm.CertificateValidation.fromDns(zone),
      });
      domainProps = {
        domainName: apiDomain,
        domainZone: zone,
        certificate,
        protocol: elbv2.ApplicationProtocol.HTTPS,
        redirectHTTP: true,
        sslPolicy: elbv2.SslPolicy.RECOMMENDED_TLS,
      };
    }

    const service = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'Api', {
      cluster,
      ...domainProps,
      cpu: isProd ? 1024 : 256,
      memoryLimitMiB: isProd ? 2048 : 512,
      desiredCount: isProd ? 3 : 1,
      publicLoadBalancer: true,
      taskImageOptions: {
        image: apiImage,
        containerPort: 4000,
        environment: {
          NODE_ENV: isProd ? 'production' : props.stage,
          AUTH_DRIVER: 'cognito',
          COGNITO_USER_POOL_ID: props.userPool.userPoolId,
          COGNITO_CLIENT_ID: props.userPoolClient.userPoolClientId,
          REDIS_URL: `rediss://${props.redis.attrPrimaryEndPointAddress}:6379`,
          CATALOGUE_DRIVER: 'dynamodb',
          CATALOGUE_TABLE: props.catalogueTable.tableName,
          MEDIA_BASE_URL: `https://${props.mediaDistribution.distributionDomainName}`,
          SEARCH_DRIVER: 'opensearch',
          OPENSEARCH_ENDPOINT: `https://${props.searchDomain.domainEndpoint}`,
          EVENTS_DRIVER: 'eventbridge',
          EVENT_BUS_NAME: props.eventBus.eventBusName,
          PUSH_DRIVER: 'sns',
          REALTIME_ENDPOINT: props.realtimeManagementEndpoint,
        },
        secrets: {
          DATABASE_URL: ecs.Secret.fromSecretsManager(props.dbSecret),
        },
      },
    });

    service.targetGroup.configureHealthCheck({ path: '/v1/health' });

    // Least-privilege grants for the API task role.
    props.catalogueTable.grantReadData(service.taskDefinition.taskRole);
    props.searchDomain.grantRead(service.taskDefinition.taskRole);
    props.eventBus.grantPutEventsTo(service.taskDefinition.taskRole);
    props.pushTopic.grantPublish(service.taskDefinition.taskRole);
    // Push realtime messages to WebSocket clients via the management API.
    service.taskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['execute-api:ManageConnections'],
        resources: [`arn:aws:execute-api:${this.region}:${this.account}:*/*/POST/@connections/*`],
      }),
    );
    // Create/manage SNS platform endpoints for device push.
    service.taskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['sns:CreatePlatformEndpoint', 'sns:Publish'],
        resources: ['*'],
      }),
    );

    const scaling = service.service.autoScaleTaskCount({
      minCapacity: isProd ? 3 : 1,
      maxCapacity: isProd ? 30 : 3,
    });
    scaling.scaleOnCpuUtilization('CpuScaling', { targetUtilizationPercent: 60 });

    // WAF: AWS managed common rule set + a rate-based rule.
    const webAcl = new wafv2.CfnWebACL(this, 'WebAcl', {
      defaultAction: { allow: {} },
      scope: 'REGIONAL',
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: `cinnetemple-${props.stage}-acl`,
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          name: 'AWSManagedCommon',
          priority: 1,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'common',
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'RateLimit',
          priority: 2,
          action: { block: {} },
          statement: {
            rateBasedStatement: { limit: 2000, aggregateKeyType: 'IP' },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'ratelimit',
            sampledRequestsEnabled: true,
          },
        },
      ],
    });

    new wafv2.CfnWebACLAssociation(this, 'WebAclAssoc', {
      resourceArn: service.loadBalancer.loadBalancerArn,
      webAclArn: webAcl.attrArn,
    });

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: `http://${service.loadBalancer.loadBalancerDnsName}`,
    });
  }
}
