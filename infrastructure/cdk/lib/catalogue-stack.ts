import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface CatalogueStackProps extends cdk.StackProps {
  stage: string;
}

/**
 * DynamoDB single-table store for the catalogue (titles + curated browse rows).
 * On-demand billing scales to millions of reads; PITR + encryption + (prod)
 * deletion protection for durability.
 *
 * Access patterns:
 *   - GetItem  PK=TITLE#<id>, SK=META          → title detail
 *   - Query    PK=CAT#<slug>, SK begins POP#    → a browse row (popularity order)
 *   - Query    PK=FEATURED                      → hero
 *   - GSI1 (TYPE#<movie|series>)                → browse all of a type
 */
export class CatalogueStack extends cdk.Stack {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props: CatalogueStackProps) {
    super(scope, id, props);
    const isProd = props.stage === 'prod';

    this.table = new dynamodb.Table(this, 'CatalogueTable', {
      tableName: `cinnetemple-${props.stage}-catalogue`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      deletionProtection: isProd,
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      contributorInsightsEnabled: isProd,
    });

    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    new cdk.CfnOutput(this, 'CatalogueTableName', { value: this.table.tableName });
  }
}
