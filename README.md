<div align="center">

# 🎬 CinneTemple

**A production-grade, AWS-native platform — web · iOS · API.**

Netflix-style experience · Liquid Glass UI · built to the AWS Well-Architected Framework.

</div>

---

## What this is

CinneTemple is a cloud-native platform delivered as a **pnpm + Turborepo
monorepo**. It is built incrementally, phase by phase, with each increment fully
functional, tested, and deployable — not stubbed. Everything runs on **AWS only**.

- **Web** — Next.js · React · TypeScript · Tailwind · Framer Motion (Amplify Hosting)
- **iOS** — SwiftUI · MVVM · Swift Concurrency · biometric login · offline sync
- **Backend** — NestJS · TypeScript · Prisma · REST (+ GraphQL later), OpenAPI
- **Infra** — AWS CDK (VPC, Cognito, RDS, Redis, ECS Fargate, WAF, KMS, …)

> 📐 Start with [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). The full design
> canon (diagram, schema, API, roadmap, UI system) lives in [`docs/`](docs/).

## Repository layout

```
apps/        web · ios · backend
packages/    shared · ui · sdk · config
infrastructure/  cdk · terraform
docs/        architecture · database · api · roadmap · ui · context
```

See [`docs/REPO_STRUCTURE.md`](docs/REPO_STRUCTURE.md) for the annotated tree.

## Status

| Area | State |
|------|-------|
| Phase 0 — Foundation (monorepo, tooling, CI, docs) | ✅ |
| Phase 1 — Auth backend (NestJS + Cognito + JWT/refresh + RBAC) | ✅ |
| Phase 1 — Auth infrastructure (CDK: VPC, Cognito, RDS, Redis, ECS, WAF) | ✅ |
| Phase 1 — Web auth UI (Netflix + Liquid Glass) | ✅ |
| Phase 1 — iOS auth flows (MVVM, biometrics, offline) | ✅ |

Full plan: [`docs/ROADMAP.md`](docs/ROADMAP.md). Running decisions/build log:
[`docs/PROJECT_CONTEXT.md`](docs/PROJECT_CONTEXT.md).

## Quick start (backend, fully local & offline)

```bash
# 0) prerequisites: Node 20, pnpm 9, Docker
corepack enable && corepack prepare pnpm@9 --activate

# 1) install
pnpm install

# 2) local infra (Postgres + Redis)
docker compose up -d

# 3) env
cp .env.example .env

# 4) database + seed
pnpm --filter @cinnetemple/backend prisma:generate
pnpm --filter @cinnetemple/backend prisma:migrate
pnpm --filter @cinnetemple/backend prisma:seed

# 5) run the API  →  http://localhost:4000  (Swagger at /docs)
pnpm --filter @cinnetemple/backend dev
```

`AUTH_DRIVER=local` (default) runs auth fully offline with argon2 password
hashing. Set `AUTH_DRIVER=cognito` once the infrastructure is deployed to use
Amazon Cognito as the identity provider.

## Run the web app

```bash
cd apps/web && cp .env.local.example .env.local   # point at the API
pnpm --filter @cinnetemple/web dev                # http://localhost:3000
```

Pages: `/` (landing), `/register`, `/verify`, `/login`, `/forgot-password`,
`/reset-password`, `/profile`, `/settings`, `/auth/callback`.

## Common commands (Turborepo)

```bash
pnpm dev          # run all dev servers
pnpm build        # build everything
pnpm lint         # lint all packages
pnpm typecheck    # type-check all packages
pnpm test         # run all tests
pnpm format       # prettier write
```

## Deploy to AWS

```bash
# one-time per account/region
pnpm --filter @cinnetemple/infra-cdk cdk bootstrap

# review + deploy a stage
pnpm --filter @cinnetemple/infra-cdk diff   -- --context stage=dev
pnpm --filter @cinnetemple/infra-cdk deploy -- --context stage=dev --all
```

CI (`.github/workflows/ci.yml`) runs lint · typecheck · test · build on every PR
plus an iOS build job. CD wiring (ECR push + CDK deploy per environment) is part
of the Phase 1 finish.

## License

UNLICENSED — private project.
