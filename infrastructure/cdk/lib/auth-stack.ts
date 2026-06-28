import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

export interface AuthStackProps extends cdk.StackProps {
  stage: string;
}

/**
 * Amazon Cognito user pool configured for email, Apple, Google, passkeys
 * (WebAuthn), and MFA — the identity backbone for web and iOS.
 */
export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);
    const isProd = props.stage === 'prod';

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `cinnetemple-${props.stage}`,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
        fullname: { required: false, mutable: true },
      },
      passwordPolicy: {
        minLength: 12,
        requireDigits: true,
        requireLowercase: true,
        requireUppercase: true,
        requireSymbols: true,
      },
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: { sms: false, otp: true },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      featurePlan: cognito.FeaturePlan.PLUS, // enables advanced security + passkeys
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Hosted UI domain for OAuth / social sign-in.
    this.userPool.addDomain('Domain', {
      cognitoDomain: { domainPrefix: `cinnetemple-${props.stage}` },
    });

    // Social identity providers (credentials supplied via context/secrets).
    const googleClientId = this.node.tryGetContext('googleClientId') as string | undefined;
    if (googleClientId) {
      new cognito.UserPoolIdentityProviderGoogle(this, 'Google', {
        userPool: this.userPool,
        clientId: googleClientId,
        clientSecretValue: cdk.SecretValue.secretsManager(
          `cinnetemple/${props.stage}/google-oauth`,
        ),
        scopes: ['openid', 'email', 'profile'],
        attributeMapping: { email: cognito.ProviderAttribute.GOOGLE_EMAIL },
      });
    }

    this.userPoolClient = this.userPool.addClient('AppClient', {
      userPoolClientName: `cinnetemple-${props.stage}-app`,
      generateSecret: true,
      authFlows: { userPassword: true, userSrp: true },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: ['https://cinnetemple.com/auth/callback', 'cinnetemple://auth/callback'],
        logoutUrls: ['https://cinnetemple.com'],
      },
      accessTokenValidity: cdk.Duration.minutes(15),
      idTokenValidity: cdk.Duration.minutes(15),
      refreshTokenValidity: cdk.Duration.days(30),
      preventUserExistenceErrors: true,
    });

    new cdk.CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: this.userPoolClient.userPoolClientId });
  }
}
