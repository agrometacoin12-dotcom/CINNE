import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as opensearch from 'aws-cdk-lib/aws-opensearchservice';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface SearchStackProps extends cdk.StackProps {
  stage: string;
  vpc: ec2.IVpc;
}

/**
 * OpenSearch domain backing relevance search. Encrypted at rest + in transit,
 * node-to-node encryption, and (prod) zone-aware multi-AZ. Lives in the VPC's
 * private subnets; the API task role is granted HTTP access.
 */
export class SearchStack extends cdk.Stack {
  public readonly domain: opensearch.Domain;

  constructor(scope: Construct, id: string, props: SearchStackProps) {
    super(scope, id, props);
    const isProd = props.stage === 'prod';

    this.domain = new opensearch.Domain(this, 'Catalogue', {
      version: opensearch.EngineVersion.OPENSEARCH_2_13,
      domainName: `cinnetemple-${props.stage}`,
      capacity: {
        dataNodes: isProd ? 3 : 1,
        dataNodeInstanceType: isProd ? 'm6g.large.search' : 't3.small.search',
        multiAzWithStandbyEnabled: false,
      },
      zoneAwareness: { enabled: isProd, availabilityZoneCount: isProd ? 3 : undefined },
      ebs: { volumeSize: isProd ? 50 : 10 },
      vpc: props.vpc,
      vpcSubnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
      encryptionAtRest: { enabled: true },
      nodeToNodeEncryption: true,
      enforceHttps: true,
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Allow the account's roles to call the domain; the API task role is also
    // granted programmatically in ApiStack via grantReadWrite-equivalent policy.
    this.domain.addAccessPolicies(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [new iam.AccountPrincipal(this.account)],
        actions: ['es:ESHttp*'],
        resources: [`${this.domain.domainArn}/*`],
      }),
    );

    new cdk.CfnOutput(this, 'OpenSearchEndpoint', {
      value: `https://${this.domain.domainEndpoint}`,
    });
  }
}
