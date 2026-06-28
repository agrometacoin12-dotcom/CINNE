# CinneTemple — Phased Implementation Roadmap

A platform of this size is delivered in coherent, shippable increments. Each
phase produces working, tested, deployable code — not stubs. Phases build on a
shared foundation (monorepo, shared contracts, CI/CD, observability) so later
work integrates without rework.

Legend: ✅ done · 🚧 in progress · ⬜ planned

---

## Phase 0 — Foundation  🚧
Goal: a reproducible, well-governed monorepo and the design canon.

- ✅ Monorepo (pnpm + Turborepo), TS config, ESLint/Prettier, Husky, commitlint
- ✅ Architecture, database, API, repo-structure & roadmap docs
- ✅ CI workflow (lint · typecheck · test · build · iOS build)
- 🚧 `packages/shared` contracts (Zod + types) consumed by web/iOS/backend
- ⬜ `packages/config` shared ESLint/TS presets published internally
- ⬜ Base CDK app + bootstrap, OIDC role for GitHub Actions deploys

## Phase 1 — Authentication & Identity  🚧
Goal: end-to-end auth across web, iOS, and API.

- 🚧 Backend: NestJS auth/users/profile/session modules, Cognito, JWT/refresh,
      RBAC guards, validation, Swagger, audit logging, unit/integration tests
- 🚧 Infra: VPC, Cognito (email/Apple/Google/passkey/MFA), RDS PG, Redis,
      Secrets Manager, KMS, API Gateway + WAF
- ⬜ Web: landing, register, verify, login, forgot/reset, profile, settings,
      session management (glassmorphism, dark/light, a11y, Framer Motion)
- ⬜ iOS: onboarding, auth flows, Keychain, biometric login, offline session,
      MVVM + DI, haptics
- ⬜ E2E: Playwright (web) + XCUITest (iOS) happy paths

## Phase 2 — Core domain & content  🚧
Goal: the primary product surface (catalogue/feature domain) on the auth base.

- 🚧 Catalogue domain (DDD): Title aggregate, repository pattern, DynamoDB
      single-table store (+ local seed driver), browse/detail/search service
- 🚧 Watchlist (Postgres/Prisma): add/remove/list, soft delete + audit
- 🚧 Infra: DynamoDB catalogue table, S3 media buckets + CloudFront (OAC)
- ✅ OpenSearch relevance search (SearchStack + driver-swappable provider + indexer)
- ✅ S3 media pipeline: upload → EventBridge → Lambda (sharp) → CloudFront
- ✅ GraphQL read layer (code-first Apollo: browse/title/search)
- ✅ Web catalogue UI: browse (hero+rows), title detail, search, watchlist
- ✅ iOS catalogue UI: home (live browse, offline cache, pull-to-refresh),
      detail, search, watchlist (+ tabs)
- ✅ iOS background sync (BGTaskScheduler refresh of browse cache)

> Phase 2 feature-complete. Remaining polish: GraphQL mutations, personalized
> rows, signed-URL/HLS video delivery.

## Phase 3 — Realtime, notifications & async  ✅ (core)
- ✅ EventBridge domain events (EventBus driver), SQS worker + DLQ, Step
      Functions onboarding orchestration
- ✅ Push notifications (SNS → APNs, device registration, iOS PushManager),
      SES transactional templates (welcome, new-release)
- ✅ In-app realtime (WebSocket API Gateway + connections table; web useRealtime
      hook + notification bell)
- ⬜ Web push registration; richer realtime payloads (per-user routing)

## Phase 4 — Hardening, scale & launch  ⬜
- ⬜ Load & chaos testing to validate "millions of users" targets
- ⬜ Shield Advanced, WAF tuning, pen-test remediation, SOC2-style controls
- ⬜ Multi-region DR drills, RTO/RPO validation, cost-optimization pass
- ⬜ Blue/green production rollout via CodeDeploy

---

## Disaster recovery targets (initial)

| Tier | RPO | RTO | Mechanism |
|------|-----|-----|-----------|
| RDS PostgreSQL | ≤ 5 min | ≤ 30 min | Multi-AZ + PITR + cross-region snapshot copy |
| DynamoDB | ~0 | ≤ 15 min | Global tables (prod) + PITR |
| S3 | ~0 | ≤ 15 min | Cross-region replication on critical buckets |
| Stateless compute | n/a | ≤ 10 min | Redeploy from image in DR region |

## Definition of Done (every feature)

1. Code + types + validation
2. Unit + integration tests passing in CI
3. OpenAPI / contracts updated in `packages/shared`
4. Observability: logs, metrics, alarms, traces
5. Security review (authz, input, secrets, least-priv IAM)
6. Docs updated (this folder) + `PROJECT_CONTEXT.md` entry
7. Deployable via CDK to `dev` → `staging` → `prod`
