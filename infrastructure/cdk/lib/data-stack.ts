import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface DataStackProps extends cdk.StackProps {
  stage: string;
  vpc: ec2.IVpc;
}

/**
 * Stateful data tier: encrypted RDS PostgreSQL (Multi-AZ in prod) and an
 * ElastiCache Redis replication group, both in isolated subnets. A customer
 * -managed KMS key encrypts data at rest; credentials live in Secrets Manager.
 */
export class DataStack extends cdk.Stack {
  public readonly dbSecret: secretsmanager.ISecret;
  public readonly redis: elasticache.CfnReplicationGroup;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);
    const isProd = props.stage === 'prod';

    const key = new kms.Key(this, 'DataKey', {
      enableKeyRotation: true,
      alias: `alias/cinnetemple-${props.stage}-data`,
      description: 'CinneTemple data-tier encryption key',
    });

    const db = new rds.DatabaseInstance(this, 'Postgres', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      instanceType: isProd
        ? ec2.InstanceType.of(ec2.InstanceClass.R6G, ec2.InstanceSize.LARGE)
        : ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      multiAz: isProd,
      allocatedStorage: 50,
      maxAllocatedStorage: 500,
      storageEncrypted: true,
      storageEncryptionKey: key,
      credentials: rds.Credentials.fromGeneratedSecret('cinnetemple', {
        secretName: `cinnetemple/${props.stage}/db`,
      }),
      databaseName: 'cinnetemple',
      backupRetention: cdk.Duration.days(isProd ? 14 : 1),
      deletionProtection: isProd,
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      cloudwatchLogsExports: ['postgresql'],
      enablePerformanceInsights: true,
    });
    this.dbSecret = db.secret!;

    // Redis (ElastiCache) in isolated subnets.
    const redisSubnets = new elasticache.CfnSubnetGroup(this, 'RedisSubnets', {
      description: 'CinneTemple Redis subnet group',
      subnetIds: props.vpc.selectSubnets({
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      }).subnetIds,
    });
    const redisSg = new ec2.SecurityGroup(this, 'RedisSg', {
      vpc: props.vpc,
      description: 'CinneTemple Redis',
      allowAllOutbound: true,
    });
    this.redis = new elasticache.CfnReplicationGroup(this, 'Redis', {
      replicationGroupDescription: `cinnetemple-${props.stage}`,
      engine: 'redis',
      cacheNodeType: isProd ? 'cache.r6g.large' : 'cache.t4g.micro',
      numNodeGroups: 1,
      replicasPerNodeGroup: isProd ? 2 : 0,
      automaticFailoverEnabled: isProd,
      multiAzEnabled: isProd,
      atRestEncryptionEnabled: true,
      transitEncryptionEnabled: true,
      cacheSubnetGroupName: redisSubnets.ref,
      securityGroupIds: [redisSg.securityGroupId],
    });

    new cdk.CfnOutput(this, 'DbSecretArn', { value: this.dbSecret.secretArn });
    new cdk.CfnOutput(this, 'DbEndpoint', { value: db.dbInstanceEndpointAddress });
  }
}
