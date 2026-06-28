# @cinnetemple/backend

NestJS authentication & identity microservice (Phase 1) for CinneTemple.

## Stack

NestJS · TypeScript · Prisma (PostgreSQL) · Redis · Passport-JWT · argon2 ·
Amazon Cognito / SES (AWS SDK) · Swagger · Pino · class-validator.

## Architecture

Clean, layered, framework-light domain:

```
controllers ──> services ──> repositories ──> Prisma ──> PostgreSQL
                   │
                   ├─ TokensService      (app-issued JWT + rotating refresh)
                   ├─ CognitoService     (IdP adapter; AUTH_DRIVER=cognito)
                   ├─ VerificationService(OTP in Redis)
                   ├─ MailService        (SES; logs in dev)
                   └─ AuditService       (immutable audit_log)
```

**Auth drivers.** `AUTH_DRIVER=local` (default) hashes passwords with argon2id
and runs fully offline — ideal for dev/test/CI. `AUTH_DRIVER=cognito` delegates
credential storage, social login, passkeys and MFA to Amazon Cognito while the
service still issues its own session tokens.

## Run locally

```bash
# from the repo root
docker compose up -d                 # Postgres + Redis
cp .env.example .env                 # adjust if needed
pnpm install
pnpm --filter @cinnetemple/backend prisma:generate
pnpm --filter @cinnetemple/backend prisma:migrate     # create schema
pnpm --filter @cinnetemple/backend prisma:seed        # roles + dev admin
pnpm --filter @cinnetemple/backend dev                # http://localhost:4000
```

Open Swagger UI at `http://localhost:4000/docs` (raw spec at `/docs-json`).

### Try it

```bash
curl -s localhost:4000/v1/health
curl -s -X POST localhost:4000/v1/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"SuperSecret!123","displayName":"You"}'
# the verification code is printed in the server log in dev
```

## Test

```bash
pnpm --filter @cinnetemple/backend test       # unit
pnpm --filter @cinnetemple/backend test:e2e   # e2e (needs Postgres+Redis)
```

## Deploy to AWS

Built as a Docker image, pushed to ECR, and run on ECS Fargate behind API
Gateway + ALB. `migrate deploy` runs on container start. Secrets
(`DATABASE_URL`, `JWT_SECRET`, Cognito client secret) are injected from Secrets
Manager; non-secret config from Parameter Store. See `infrastructure/cdk`.

## Environment

See `.env.example` at the repo root for the full list. Key vars: `DATABASE_URL`,
`REDIS_URL`, `AUTH_DRIVER`, `JWT_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`,
`COGNITO_*`, `SES_FROM_ADDRESS`.
