# CinneTemple — Deployment Runbook

> Target for this guide: **prod** in **us-east-1**. The same commands work for
> `dev`/`staging` by changing `--context stage=`.

⚠️ **Cost & irreversibility.** Deploying creates billable resources immediately
(NAT gateways, RDS Multi-AZ, ElastiCache, Fargate, ALB). In `prod` the RDS
instance has **deletion protection** and a **RETAIN** removal policy — it will
not be torn down by `cdk destroy`. Start with `dev` if you only want to validate.

---

## 0. Verify readiness (no AWS calls)

```bash
pnpm install
pnpm --filter @cinnetemple/infra-cdk build      # tsc compile of the stacks
pnpm --filter @cinnetemple/infra-cdk test       # assertion tests (synth-based)
pnpm --filter @cinnetemple/infra-cdk synth -- --context stage=prod
```

`synth` renders CloudFormation locally and **does not touch AWS**. If it
produces templates, the app is structurally deploy-ready.

## 1. Prerequisites

- AWS account + an admin/deploy identity configured locally (`aws configure` or
  SSO). Verify: `aws sts get-caller-identity`.
- Docker running (the backend image is built locally as a CDK asset).
- Node 20, pnpm 9.
- For prod, set the account/region explicitly:

```bash
export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
export CDK_DEFAULT_REGION=us-east-1
```

## 2. One-time bootstrap (per account/region)

```bash
pnpm --filter @cinnetemple/infra-cdk exec cdk bootstrap aws://$CDK_DEFAULT_ACCOUNT/us-east-1
```

## 3. Pre-create secrets the stacks expect

```bash
# Social login (only if enabling Google now)
aws secretsmanager create-secret --name cinnetemple/prod/google-oauth \
  --secret-string '<google-oauth-client-secret>' --region us-east-1
```

The RDS credentials secret (`cinnetemple/prod/db`) is **created by the Data
stack** — you do not pre-create it.

## 4. Deploy

```bash
# Review the change set first
pnpm --filter @cinnetemple/infra-cdk diff   -- --context stage=prod

# Deploy all stacks (Network → Data → Auth → Api)
pnpm --filter @cinnetemple/infra-cdk deploy -- --context stage=prod --all
```

Deploy order is resolved automatically from stack dependencies. The `Api` stack
builds `apps/backend/Dockerfile`, pushes it to ECR, and runs it on Fargate.

### Optional: GitHub Actions OIDC deploy role

```bash
pnpm --filter @cinnetemple/infra-cdk deploy -- \
  --context stage=prod --context githubRepo=<owner>/<repo> CinneTemple-prod-Cicd
```

Then add the printed role ARN as `AWS_DEPLOY_ROLE_ARN` in repo secrets and use
`aws-actions/configure-aws-credentials` in CI — no long-lived keys.

## 5. Post-deploy wiring

Read the stack outputs and populate runtime config:

```bash
aws cloudformation describe-stacks --region us-east-1 \
  --stack-name CinneTemple-prod-Auth \
  --query "Stacks[0].Outputs" --output table
```

- Put `UserPoolId` / `UserPoolClientId` into the API task config (already passed
  by the `Api` stack via env) and the web app's `NEXT_PUBLIC_*` vars.
- The API runs DB migrations on container start (`prisma migrate deploy`).

## 6. Verify

```bash
# ALB URL is an output of the Api stack
curl -s http://<alb-dns>/v1/health
```

## 7. Tear down (non-prod only)

```bash
pnpm --filter @cinnetemple/infra-cdk destroy -- --context stage=dev --all
```

Prod retains stateful resources by design; removing them is a deliberate manual
step.

---

## What gets created (Phase 1)

VPC (multi-AZ, isolated data subnets, NAT, flow logs, VPC endpoints) · KMS CMK ·
RDS PostgreSQL 16 (encrypted, Multi-AZ, PITR) · ElastiCache Redis (encrypted) ·
Cognito user pool + app client + hosted domain · ECS Fargate service + ALB +
CPU autoscaling · WAF (managed OWASP + rate limit) · CloudWatch logs/metrics.

Edge (CloudFront + ACM + Route 53) and web hosting (Amplify) are added with the
web deployment increment.
