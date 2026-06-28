import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { NetworkStack } from '../lib/network-stack';
import { DataStack } from '../lib/data-stack';
import { AuthStack } from '../lib/auth-stack';

const env = { account: '123456789012', region: 'us-east-1' };

describe('CinneTemple CDK stacks (prod)', () => {
  const app = new cdk.App();
  const network = new NetworkStack(app, 'Net', { env, stage: 'prod' });
  const data = new DataStack(app, 'Data', { env, stage: 'prod', vpc: network.vpc });
  const auth = new AuthStack(app, 'Auth', { env, stage: 'prod' });

  it('creates a multi-AZ encrypted Postgres instance', () => {
    const t = Template.fromStack(data);
    t.hasResourceProperties('AWS::RDS::DBInstance', {
      Engine: 'postgres',
      MultiAZ: true,
      StorageEncrypted: true,
    });
  });

  it('creates an encrypted Redis replication group', () => {
    const t = Template.fromStack(data);
    t.hasResourceProperties('AWS::ElastiCache::ReplicationGroup', {
      AtRestEncryptionEnabled: true,
      TransitEncryptionEnabled: true,
    });
  });

  it('enforces a strong Cognito password policy', () => {
    const t = Template.fromStack(auth);
    t.hasResourceProperties('AWS::Cognito::UserPool', {
      Policies: {
        PasswordPolicy: {
          MinimumLength: 12,
          RequireSymbols: true,
        },
      },
    });
  });

  it('provisions a VPC', () => {
    Template.fromStack(network).resourceCountIs('AWS::EC2::VPC', 1);
  });
});
