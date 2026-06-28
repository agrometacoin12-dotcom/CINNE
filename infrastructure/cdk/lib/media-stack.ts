import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as path from 'node:path';
import { Construct } from 'constructs';

export interface MediaStackProps extends cdk.StackProps {
  stage: string;
}

/**
 * Media storage + delivery.
 *
 *   - `originals` (private): raw uploads (posters, hero art, future video). No
 *     public access; processed by the media pipeline (Phase 3) and read by the
 *     backend via signed URLs / OAC.
 *   - `public` delivery via CloudFront with Origin Access Control, so objects
 *     are served from the CDN, never directly from S3.
 */
export class MediaStack extends cdk.Stack {
  public readonly originalsBucket: s3.Bucket;
  public readonly deliveryBucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: MediaStackProps) {
    super(scope, id, props);
    const isProd = props.stage === 'prod';
    const removal = isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY;

    this.originalsBucket = new s3.Bucket(this, 'Originals', {
      bucketName: `cinnetemple-${props.stage}-media-originals-${this.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: isProd,
      removalPolicy: removal,
      autoDeleteObjects: !isProd,
      eventBridgeEnabled: true, // emit Object Created events to EventBridge
      lifecycleRules: [{ abortIncompleteMultipartUploadAfter: cdk.Duration.days(7) }],
    });

    this.deliveryBucket = new s3.Bucket(this, 'Delivery', {
      bucketName: `cinnetemple-${props.stage}-media-delivery-${this.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: removal,
      autoDeleteObjects: !isProd,
    });

    this.distribution = new cloudfront.Distribution(this, 'Cdn', {
      comment: `cinnetemple-${props.stage} media`,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.deliveryBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
      },
      priceClass: isProd
        ? cloudfront.PriceClass.PRICE_CLASS_ALL
        : cloudfront.PriceClass.PRICE_CLASS_100,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
    });

    // ── Optimization pipeline: EventBridge → Lambda (sharp) → delivery bucket ──
    const optimizer = new lambdaNodejs.NodejsFunction(this, 'MediaOptimizer', {
      functionName: `cinnetemple-${props.stage}-media-optimizer`,
      entry: path.join(__dirname, '..', 'lambdas', 'media-optimizer', 'index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 1536,
      timeout: cdk.Duration.minutes(1),
      environment: { DELIVERY_BUCKET: this.deliveryBucket.bucketName },
      bundling: {
        // sharp ships native binaries — build in Docker so the arm64 Lambda
        // binary is produced (not the host's), and install it as a node module.
        nodeModules: ['sharp'],
        externalModules: ['@aws-sdk/*'],
        forceDockerBundling: true,
      },
    });

    this.originalsBucket.grantRead(optimizer);
    this.deliveryBucket.grantPut(optimizer);

    new events.Rule(this, 'ObjectCreatedRule', {
      eventPattern: {
        source: ['aws.s3'],
        detailType: ['Object Created'],
        detail: { bucket: { name: [this.originalsBucket.bucketName] } },
      },
      targets: [new targets.LambdaFunction(optimizer)],
    });

    new cdk.CfnOutput(this, 'MediaBaseUrl', {
      value: `https://${this.distribution.distributionDomainName}`,
    });
    new cdk.CfnOutput(this, 'OriginalsBucketName', { value: this.originalsBucket.bucketName });
  }
}
