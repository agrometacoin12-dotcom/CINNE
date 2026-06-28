# CinneTemple — Running Project Context

> This file is the persistent memory of the build. Every meaningful decision and
> increment is appended here so future work integrates seamlessly. Newest first.

## Decisions log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-06-27 | Single cloud: **AWS only** | Per product mandate; no Firebase/Supabase/Vercel/Cloudflare. |
| 2026-06-27 | Monorepo: **pnpm + Turborepo** | Fast, cached, standard for TS monorepos; clean fit for NestJS/Next.js/CDK. |
| 2026-06-27 | iOS lives at `apps/ios` (converted in place) | Preserve existing Xcode project; one repo. |
| 2026-06-27 | Auth identity: **Cognito** + app-issued JWT/refresh | Managed IdP for Apple/Google/passkeys/MFA; app controls session lifecycle. |
| 2026-06-27 | Relational core: **RDS PostgreSQL + Prisma** | Strong consistency, migrations, soft-delete/audit conventions. |
| 2026-06-27 | Default region changed to **us-east-1**; first deploy target **prod** | User selection. CDK verified deploy-ready (no live deploy run). |
| 2026-06-27 | Provision via **CDK only** (no manual console clicking) | Reproducible IaC; console provisioning rejected as drift-prone and involving restricted actions. |
| 2026-06-27 | Backend image via **CDK Docker asset** (fromAsset → ECR) | Removes placeholder image; deploy builds/pushes the real NestJS image. |
| 2026-06-27 | **UI direction: Netflix-style + Liquid Glass (glassmorphism) on ALL pages** | Binding visual language for web AND iOS, every phase. Dark-first, cinematic, immersive hero/rows, frosted translucent surfaces, depth/blur, smooth Framer Motion / SwiftUI transitions. |

## Build log

### 2026-06-27 — Phase 0 + Phase 1 kickoff
- Restructured Desktop/CinneTemple into a monorepo (apps/packages/infrastructure/docs).
- Promoted the Xcode-created git repo to the monorepo root.
- Added root tooling: package.json, pnpm-workspace.yaml, turbo.json,
  tsconfig.base.json, ESLint/Prettier/EditorConfig, Husky + commitlint, CI.
- Authored foundation docs: ARCHITECTURE (with Mermaid AWS + sequence diagrams),
  DATABASE (Prisma schema, encryption, audit), API (OpenAPI for auth),
  ROADMAP (phased plan + DR targets), REPO_STRUCTURE.
- Phase 1 backend (NestJS auth) and Phase 1 CDK (auth stack) in progress.

### 2026-06-27 — Phase 1 web auth UI
- Built the Next.js (App Router) web app in `apps/web`: Inter font, dark-first
  theme provider, cinematic animated background, Liquid Glass components
  (GlassPanel, GlassNav, Button, TextField, Alert, AuthShell, ThemeToggle).
- API client (`lib/api.ts`) with in-memory access token + persisted refresh and
  transparent 401 rotation; auth context; RequireAuth guard.
- Pages: landing (Netflix-style hero + rows), register, verify, login,
  forgot-password, reset-password, profile, settings (active session
  management), OAuth callback. Forms validate via `@cinnetemple/shared` Zod.
- Amplify Hosting build config (`amplify.yml`); security headers in next.config.
- Fixed shared package module resolution for multi-consumer use (web/backend).

### 2026-06-27 — Phase 1 iOS auth flows
- Built the SwiftUI app in `apps/ios/CinneTemple` (MVVM + Swift Concurrency + DI).
- Core: APIClient (async/await, 401 refresh rotation), AuthAPI, KeychainStore,
  BiometricAuthenticator (Face/Touch ID), OfflineCache, SessionStore (token
  lifecycle + biometric lock + TokenProviding), AppContainer composition root.
- Theme: tokens + GlassCard/PrimaryButton/GlassField + CinematicBackground.
- Features: AuthViewModel + landing/login/register/verify/forgot/reset, plus
  MainTabView with Home (hero + rows, pull-to-refresh), Profile editor, Settings
  (biometric toggle, active-session management, sign out).
- RootView routes on session phase (loading/locked/unauthenticated/authenticated).
- Neutralized the old prototype `Movie.swift` (Phase 2 catalogue); documented the
  local-dev ATS exception for http://localhost in the iOS README.

> Phase 1 complete across backend, infrastructure, web, and iOS.

### 2026-06-27 — Phase 2 kickoff (catalogue backend + infra)
- Shared contracts: Title/TitleSummary/BrowseRow/SearchResponse/WatchlistItem.
- Backend `catalogue` module (DDD): Title entity, CatalogueRepository interface,
  Local (bundled seed) + DynamoDB single-table implementations (driver-swappable
  via CATALOGUE_DRIVER), service (browse/detail/search + media-URL resolution),
  public controller. Seed catalogue = 12 original fictional titles.
- Backend `watchlist` module: Prisma WatchlistItem model (soft delete, unique
  per user+title), service (add/remove/list with catalogue enrichment), audit.
- Infra: `CatalogueStack` (DynamoDB single table, GSI1, PITR, prod protection),
  `MediaStack` (S3 originals + CloudFront-fronted delivery via OAC). API stack
  now injects CATALOGUE_TABLE + MEDIA_BASE_URL and grants table read.
- Seed script `seed:catalogue` loads titles + row membership into DynamoDB.
- Design captured in docs/CATALOGUE.md.

> Phase 2 backend + infrastructure done. Next: web + iOS catalogue UIs
> (hero, rows, detail, search, watchlist) and OpenSearch/media pipeline.

### 2026-06-27 — Phase 2 catalogue UIs (web + iOS)
- Web: api client catalogue/watchlist methods; Hero/ContentRow/PosterCard glass
  components; pages /browse (hero+rows), /title/[id] (detail + watchlist toggle),
  /search (debounced), /watchlist (protected); nav links added.
- iOS: CatalogueModels + CatalogueAPI; CatalogueViewModel (offline-first browse),
  SearchViewModel (debounced), WatchlistViewModel; PosterCard; HomeView rewired to
  live browse with pull-to-refresh; TitleDetailView (watchlist toggle + haptics);
  SearchView (.searchable); WatchlistView; MainTabView now Home/Search/My List/
  Profile/Settings.
- Fix: web title route uses Next 14 sync params (not Promise/use()).

> Phase 2 now spans backend, infra, web, and iOS for the catalogue + watchlist.
> Remaining Phase 2: OpenSearch relevance, S3 media upload/optimize pipeline,
> GraphQL read layer, iOS background sync.

### 2026-06-27 — Phase 2 advanced (search, media, GraphQL, bg sync)
- OpenSearch: `SearchProvider` abstraction (local + opensearch drivers) wired
  into catalogue search; `SearchStack` (encrypted, VPC OpenSearch domain);
  `index:catalogue` bulk indexer; API granted es:ESHttp* + SEARCH_DRIVER env.
- Media pipeline: originals bucket emits EventBridge Object Created → media-
  optimizer Lambda (sharp) → WebP poster/hero variants in delivery bucket →
  CloudFront. Wired in MediaStack.
- GraphQL: code-first Apollo layer at /graphql (browse/title/search) reusing
  CatalogueService; GqlThrottlerGuard so rate limiting handles GraphQL too.
- iOS background sync: BackgroundSyncManager (BGTaskScheduler) refreshes browse
  cache; .backgroundTask scene modifier + reschedule on background; README documents
  the required Info.plist identifier + Background Modes capability.
- New backend deps: @nestjs/graphql, @nestjs/apollo, @apollo/server, graphql,
  @opensearch-project/opensearch, @aws-sdk/credential-provider-node.

> Phase 2 feature-complete across backend, infra, web, iOS.

### 2026-06-27 — Phase 3 (events, notifications, realtime, orchestration)
- EventBus abstraction (local/eventbridge) publishing user.registered &
  watchlist.added; EventsModule global.
- NotificationsModule: DeviceToken Prisma model, device register/unregister
  endpoint, PushService (SNS, local fallback), RealtimeService (API GW mgmt API),
  templated SES via MailService.sendTemplated.
- Infra: MessagingStack (EventBridge bus, SQS+DLQ, notification-worker Lambda,
  Step Functions onboarding, SNS topic, SES welcome/new-release templates),
  RealtimeStack (WebSocket API + connections DynamoDB + connect/disconnect/default
  Lambdas). API granted PutEvents, SNS publish, ManageConnections.
- Clients: iOS PushManager + AppDelegate adaptor (APNs → backend); web
  useRealtime hook + NotificationBell in nav.
- All new services default to local drivers → app still runs fully offline.

> Phases 1–3 core complete across backend, infra, web, iOS.

### 2026-06-28 — Local run + go-live prep
- Backend runs locally end-to-end (docker compose Postgres+Redis on 5433/6380,
  all drivers local). Fixed first-build issues: tsconfig declarationMap, e2e
  createNestApplication, pino-pretty dep. iOS first build fixed: import Combine
  in all ObservableObjects, catch-var shadowing, Xcode restart to sync new files,
  generated 1024² AppIcon. App builds & runs in simulator.
- iOS API URL now per-config via Info.plist `$(API_BASE_URL)` build setting:
  Debug=http://localhost:4000 (+ ATS localhost exception), Release=
  https://api.cinnetemple.com (set to real domain before TestFlight).
- CDK ApiStack: optional custom domain + HTTPS (Route53 lookup + ACM cert +
  HTTPS listener, HTTP→HTTPS redirect) via `--context domain=<apex>`.
- Authored docs/GO_LIVE.md: AWS CLI setup, Route53 domain registration, prod
  deploy with domain, catalogue seed/index, Amplify web hosting + custom domain,
  iOS archive → TestFlight, APNs/SNS push.
- User direction: register domain via Route53, AWS account not yet CLI-configured,
  Apple Developer enrolled, web on Amplify Hosting.

## Open questions / TODO

- Confirm AWS account-per-environment vs. single-account multi-VPC.
- Confirm primary region & data-residency constraints.
- Apple Developer + Google OAuth client credentials needed for social login.
- APNs key for push (Phase 3).
- Decide GraphQL gateway approach for Phase 2 (Apollo on Fargate vs. AppSync —
  note AppSync is acceptable as it is native AWS).

## Conventions quick-reference

- Conventional Commits, scopes: web/ios/backend/shared/ui/sdk/config/infra/docs/ci/repo.
- Branches: `main` (prod), `develop` (staging), feature branches → PR.
- Every feature: code → tests → contracts → observability → security → docs.
