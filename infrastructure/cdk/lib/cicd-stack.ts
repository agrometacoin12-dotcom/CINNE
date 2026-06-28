import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface CicdStackProps extends cdk.StackProps {
  stage: string;
  /** GitHub repository in "owner/name" form, allowed to assume the deploy role. */
  githubRepo: string;
}

/**
 * GitHub Actions OIDC trust + a deploy role. Lets CI run `cdk deploy` and push
 * images to ECR without storing long-lived AWS access keys.
 *
 * Scope the trust to your repo (and optionally branch/environment). The attached
 * policy below is broad for bootstrap simplicity — tighten to least privilege
 * before production use.
 */
export class CicdStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CicdStackProps) {
    super(scope, id, props);

    const provider = new iam.OpenIdConnectProvider(this, 'GithubOidc', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });

    const role = new iam.Role(this, 'GithubDeployRole', {
      roleName: `cinnetemple-${props.stage}-gha-deploy`,
      assumedBy: new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        },
        StringLike: {
          'token.actions.githubusercontent.com:sub': `repo:${props.githubRepo}:*`,
        },
      }),
      description: 'Role assumed by GitHub Actions to deploy CinneTemple',
      maxSessionDuration: cdk.Duration.hours(1),
    });

    // Allow assuming the CDK bootstrap roles (deploy, file/image publishing, lookup).
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: [`arn:aws:iam::${this.account}:role/cdk-*`],
      }),
    );

    new cdk.CfnOutput(this, 'DeployRoleArn', { value: role.roleArn });
  }
}
