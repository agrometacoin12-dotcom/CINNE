# CinneTemple — Go Live (production, domain, TestFlight)

This is the end-to-end path to put CinneTemple on real infrastructure: the API on
AWS behind your own domain over HTTPS, the web app on Amplify Hosting with a
custom domain, and the iOS app on TestFlight.

> You'll run these on your Mac with your own AWS + Apple accounts. Anything that
> touches credentials, payments, or code signing is done by you — the code and
> config here are already prepared for it.

Replace `cinnetemple.com` with the domain you register.

---

## 0. Prerequisites

- AWS account (you have one — we'll configure the CLI in step 1).
- Apple Developer Program membership (you're enrolled ✅).
- Tools: Node 20, pnpm 9, Docker Desktop, AWS CLI v2, and the AWS CDK
  (`pnpm --filter @cinnetemple/infra-cdk exec cdk --version`).

---

## 1. Configure the AWS CLI

Create an IAM user (or IAM Identity Center user) with admin access for setup,
then:

```bash
aws configure                # paste Access Key, Secret, region us-east-1, json
aws sts get-caller-identity  # should print your account id
export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
export CDK_DEFAULT_REGION=us-east-1
```

> Prefer not to use long-lived keys long term? After the first deploy, switch CI
> to the GitHub OIDC role from the `Cicd` stack (see `infrastructure/cdk`).

## 2. Register the domain in Route 53

AWS Console → **Route 53 → Domains → Register domains** → search and buy
`cinnetemple.com`. Registration auto-creates a **hosted zone** (this is what the
CDK looks up for DNS + certificates). Wait until the domain shows as registered.

## 3. Bootstrap + deploy the API with HTTPS

```bash
pnpm install                 # also pulls in esbuild for fast Lambda bundling
# sanity check — no AWS calls, but Docker must be running (the image-optimizer
# Lambda builds its native `sharp` dependency in Docker)
pnpm --filter @cinnetemple/infra-cdk synth -- --context stage=prod --context domain=cinnetemple.com

# one-time per account/region
pnpm --filter @cinnetemple/infra-cdk exec cdk bootstrap

# pre-create the Google OAuth secret if using Google sign-in (optional)
# aws secretsmanager create-secret --name cinnetemple/prod/google-oauth --secret-string '<secret>'

# deploy everything (Docker must be running — the API image builds locally)
pnpm --filter @cinnetemple/infra-cdk deploy -- \
  --context stage=prod --context domain=cinnetemple.com --all
```

This provisions VPC, RDS, Redis, Cognito, DynamoDB, OpenSearch, S3+CloudFront,
EventBridge/SQS/Step Functions, the WebSocket API, and the Fargate API — and,
because you passed `domain`, an ACM certificate + Route 53 record so the API is
served at **https://api.cinnetemple.com** (HTTP redirects to HTTPS).

ACM validation is automatic via the hosted zone; the first deploy waits a few
minutes for the certificate to validate.

## 4. Seed catalogue data + search index

```bash
CATALOGUE_DRIVER=dynamodb CATALOGUE_TABLE=cinnetemple-prod-catalogue \
  AWS_REGION=us-east-1 pnpm --filter @cinnetemple/backend seed:catalogue

OPENSEARCH_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name CinneTemple-prod-Search \
  --query "Stacks[0].Outputs[?OutputKey=='OpenSearchEndpoint'].OutputValue" --output text) \
  AWS_REGION=us-east-1 pnpm --filter @cinnetemple/backend index:catalogue
```

Verify:

```bash
curl -s https://api.cinnetemple.com/v1/health
curl -s https://api.cinnetemple.com/v1/catalogue/browse | head -c 300
```

> SES starts in sandbox mode — verify your sender domain and request production
> access in the SES console so verification/welcome emails reach real users.

## 5. Web app → Amplify Hosting + custom domain

AWS Console → **Amplify → Create app → Host web app** → connect your Git repo and
branch. Amplify auto-detects the monorepo build via `apps/web/amplify.yml`.

Set these environment variables in Amplify (App settings → Environment variables):

```
NEXT_PUBLIC_API_BASE_URL = https://api.cinnetemple.com
NEXT_PUBLIC_REALTIME_URL  = wss://<from CinneTemple-prod-Realtime "WebSocketUrl" output>
NEXT_PUBLIC_COGNITO_DOMAIN = <from CinneTemple-prod-Auth output>
NEXT_PUBLIC_COGNITO_CLIENT_ID = <from CinneTemple-prod-Auth output>
```

Then **Domain management → Add domain** → `cinnetemple.com`, map root + `www`.
Amplify provisions the certificate and DNS automatically (same Route 53 zone).
Result: **https://cinnetemple.com**.

## 6. iOS → TestFlight

The Release build already points at `https://api.cinnetemple.com`
(`API_BASE_URL` build setting). Update it if your domain differs:
Xcode → target **CinneTemple** → Build Settings → search `API_BASE_URL` → set the
**Release** value.

1. **Bundle id & team:** target → Signing & Capabilities → select your Team; set a
   unique Bundle Identifier (e.g. `com.<you>.cinnetemple`). Update the matching
   value in App Store Connect.
2. **Capabilities:** add **Push Notifications** and, under Background Modes,
   **Remote notifications** + **Background fetch** (also add the
   `BGTaskSchedulerPermittedIdentifiers` Info key — see `apps/ios/README.md`).
3. **App Store Connect:** create a new app record with that bundle id.
4. **Archive:** in Xcode set the destination to **Any iOS Device**, then
   **Product → Archive**.
5. **Upload:** in the Organizer, **Distribute App → App Store Connect → Upload**
   (Xcode handles signing with your team).
6. **TestFlight:** once processed, add testers (internal immediately; external
   needs a brief Beta App Review). Testers install via the TestFlight app.

> Cognito callback URLs already include `cinnetemple://auth/callback` and
> `https://cinnetemple.com/auth/callback` for Apple/Google sign-in.

## 7. Push notifications (APNs)

In the Apple Developer portal create an **APNs Auth Key (.p8)**. Create an SNS
**Platform Application** (APNS) with that key, then set its ARN:

```bash
aws ssm put-parameter --name /cinnetemple/prod/sns-platform-app-arn \
  --value <APNS platform application ARN> --type String
```

(Wire it into the API task as `SNS_PLATFORM_APP_ARN`; the backend's `PushService`
uses it to register device tokens.)

---

## Environments

Use `--context stage=dev|staging|prod` and a matching `--context domain=` (e.g.
`dev.cinnetemple.com`) to stand up isolated environments. `dev` is cheapest;
`prod` enables Multi-AZ, deletion protection, and longer backups.

## Cost & teardown

Production runs billable resources continuously (NAT, RDS Multi-AZ, OpenSearch,
Fargate, ElastiCache). For non-prod: `cdk destroy --context stage=dev --all`.
Prod retains stateful resources by design.
