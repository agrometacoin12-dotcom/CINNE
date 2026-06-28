import * as cdk from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'node:path';
import { Construct } from 'constructs';

export interface RealtimeStackProps extends cdk.StackProps {
  stage: string;
}

/**
 * In-app realtime over a WebSocket API Gateway. Connections are tracked in a
 * DynamoDB table (TTL-expired) so the backend can push to clients via the
 * management API.
 */
export class RealtimeStack extends cdk.Stack {
  public readonly connectionsTable: dynamodb.Table;
  public readonly apiEndpoint: string;
  public readonly managementEndpoint: string;

  constructor(scope: Construct, id: string, props: RealtimeStackProps) {
    super(scope, id, props);

    this.connectionsTable = new dynamodb.Table(this, 'Connections', {
      tableName: `cinnetemple-${props.stage}-ws-connections`,
      partitionKey: { name: 'connectionId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: props.stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    const entry = path.join(__dirname, '..', 'lambdas', 'realtime', 'index.ts');
    const common = {
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      entry,
      environment: { CONNECTIONS_TABLE: this.connectionsTable.tableName },
    } satisfies Partial<lambdaNodejs.NodejsFunctionProps>;

    const connectFn = new lambdaNodejs.NodejsFunction(this, 'ConnectFn', { ...common, handler: 'connect' });
    const disconnectFn = new lambdaNodejs.NodejsFunction(this, 'DisconnectFn', { ...common, handler: 'disconnect' });
    const defaultFn = new lambdaNodejs.NodejsFunction(this, 'DefaultFn', { ...common, handler: 'defaultHandler' });

    this.connectionsTable.grantWriteData(connectFn);
    this.connectionsTable.grantWriteData(disconnectFn);

    const api = new apigwv2.WebSocketApi(this, 'WsApi', {
      apiName: `cinnetemple-${props.stage}-realtime`,
      connectRouteOptions: { integration: new integrations.WebSocketLambdaIntegration('Connect', connectFn) },
      disconnectRouteOptions: { integration: new integrations.WebSocketLambdaIntegration('Disconnect', disconnectFn) },
      defaultRouteOptions: { integration: new integrations.WebSocketLambdaIntegration('Default', defaultFn) },
    });
    const stage = new apigwv2.WebSocketStage(this, 'WsStage', {
      webSocketApi: api,
      stageName: props.stage,
      autoDeploy: true,
    });

    this.apiEndpoint = stage.url; // wss://...
    this.managementEndpoint = `https://${api.apiId}.execute-api.${this.region}.amazonaws.com/${props.stage}`;

    new cdk.CfnOutput(this, 'WebSocketUrl', { value: this.apiEndpoint });
    new cdk.CfnOutput(this, 'WebSocketManagementEndpoint', { value: this.managementEndpoint });
  }
}
