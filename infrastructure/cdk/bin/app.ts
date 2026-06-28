#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NetworkStack } from '../lib/network-stack';
import { DataStack } from '../lib/data-stack';
import { AuthStack } from '../lib/auth-stack';
import { ApiStack } from '../lib/api-stack';
import { CatalogueStack } from '../lib/catalogue-stack';
import { MediaStack } from '../lib/media-stack';
import { SearchStack } from '../lib/search-stack';
import { MessagingStack } from '../lib/messaging-stack';
import { RealtimeStack } from '../lib/realtime-stack';
import { CicdStack } from '../lib/cicd-stack';

const app = new cdk.App();

const stage = (app.node.tryGetContext('stage') as string) ?? process.env.STAGE ?? 'dev';
// Optional custom domain, e.g. --context domain=cinnetemple.com (API at api.<domain>).
const domain = app.node.tryGetContext('domain') as string | undefined;
const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
};

const prefix = `CinneTemple-${stage}`;
const tags = { Project: 'CinneTemple', Stage: stage, ManagedBy: 'cdk' };

const network = new NetworkStack(app, `${prefix}-Network`, { env, stage });

const data = new DataStack(app, `${prefix}-Data`, {
  env,
  stage,
  vpc: network.vpc,
});

const auth = new AuthStack(app, `${prefix}-Auth`, { env, stage });

const catalogue = new CatalogueStack(app, `${prefix}-Catalogue`, { env, stage });
const media = new MediaStack(app, `${prefix}-Media`, { env, stage });
const search = new SearchStack(app, `${prefix}-Search`, { env, stage, vpc: network.vpc });
const messaging = new MessagingStack(app, `${prefix}-Messaging`, { env, stage });
const realtime = new RealtimeStack(app, `${prefix}-Realtime`, { env, stage });

new ApiStack(app, `${prefix}-Api`, {
  env,
  stage,
  vpc: network.vpc,
  dbSecret: data.dbSecret,
  redis: data.redis,
  userPool: auth.userPool,
  userPoolClient: auth.userPoolClient,
  catalogueTable: catalogue.table,
  mediaDistribution: media.distribution,
  searchDomain: search.domain,
  eventBus: messaging.bus,
  pushTopic: messaging.pushTopic,
  realtimeManagementEndpoint: realtime.managementEndpoint,
  domain,
});

// CI/CD deploy role via GitHub OIDC (no long-lived AWS keys). Optional:
// provide the GitHub repo via `--context githubRepo=owner/name` to enable.
const githubRepo = app.node.tryGetContext('githubRepo') as string | undefined;
if (githubRepo) {
  new CicdStack(app, `${prefix}-Cicd`, { env, stage, githubRepo });
}

Object.entries(tags).forEach(([k, v]) => cdk.Tags.of(app).add(k, v));
