# @cinnetemple/infra-cdk

AWS infrastructure for CinneTemple, defined with the AWS CDK (TypeScript).

## Stacks (Phase 1)

| Stack | Resources |
|-------|-----------|
| `Network` | VPC (public/private/isolated subnets, multi-AZ), NAT, flow logs, VPC endpoints (Secrets Manager, SSM, S3) |
| `Data` | RDS PostgreSQL 16 (encrypted, Multi-AZ in prod, PITR), ElastiCache Redis (encrypted in transit + at rest), KMS CMK, Secrets Manager DB credentials |
| `Auth` | Cognito user pool (email/Apple/Google/passkeys/MFA), hosted UI domain, app client |
| `Api` | ECS Fargate (NestJS) behind ALB, CPU autoscaling, WAF (managed OWASP + rate limit) |

> Later phases add: CloudFront + ACM + Route 53 edge, S3 media buckets,
> EventBridge/SQS/SNS/Step Functions, OpenSearch, AWS Backup plans, and
> CodePipeline. They slot in as additional stacks without changing the above.

## Prerequisites

- AWS account + credentials (`aws configure`)
- Node 20, pnpm
- One-time per account/region: `pnpm cdk bootstrap`

## Usage

```bash
pnpm --filter @cinnetemple/infra-cdk install
# Inspect changes
pnpm --filter @cinnetemple/infra-cdk synth -- --context stage=dev
pnpm --filter @cinnetemple/infra-cdk diff  -- --context stage=dev
# Deploy
pnpm --filter @cinnetemple/infra-cdk deploy -- --context stage=dev --all
```

Stages: `dev`, `staging`, `prod` (via `--context stage=`). Production turns on
Multi-AZ, larger instance classes, deletion protection, and longer backup
retention automatically.

## Notes

- The `Api` stack currently references a placeholder container image so `synth`
  succeeds before the first ECR push; CI replaces it with the real
  `@cinnetemple/backend` image (`infrastructure` deploy job depends on the
  backend image build).
- Social IdP secrets (`cinnetemple/<stage>/google-oauth`, Apple keys) must exist
  in Secrets Manager before enabling those providers.
