# CinneTemple — Repository Structure

A pnpm + Turborepo monorepo. TypeScript packages are workspace members; the iOS
app is a native Xcode project living under `apps/ios` (excluded from the JS
workspace graph).

```
cinnetemple/
├── apps/
│   ├── web/                  # Next.js + React + Tailwind + Framer Motion (Amplify Hosting)
│   ├── ios/                  # SwiftUI + MVVM + Swift Concurrency (Xcode project)
│   │   ├── CinneTemple.xcodeproj
│   │   └── CinneTemple/      # Swift sources (auto-synced file group)
│   └── backend/              # NestJS microservices (ECS Fargate)
│       ├── prisma/           # schema, migrations, seed
│       ├── src/
│       │   ├── main.ts
│       │   ├── app.module.ts
│       │   ├── common/       # guards, filters, interceptors, decorators
│       │   ├── config/       # typed config + validation
│       │   ├── infra/        # prisma, redis, cognito, kms adapters
│       │   └── modules/
│       │       ├── auth/     # controllers, services, dto, strategies
│       │       ├── users/
│       │       ├── profile/
│       │       └── sessions/
│       └── test/             # e2e / integration
├── packages/
│   ├── shared/               # Zod contracts + TS types shared by all clients
│   ├── ui/                   # React component library (web design system)
│   ├── sdk/                  # Typed API client (generated from OpenAPI)
│   └── config/               # Shared ESLint / TS / Tailwind presets
├── infrastructure/
│   ├── cdk/                  # AWS CDK app (primary IaC)
│   │   ├── bin/app.ts
│   │   └── lib/              # network, auth, data, edge, observability stacks
│   └── terraform/            # optional / org-level resources
├── docs/                     # architecture, database, api, roadmap, context
├── .github/workflows/        # CI/CD
├── turbo.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── package.json
```

## Ownership & boundaries

- `packages/shared` is the single source of truth for request/response shapes.
  Backend DTOs and the web/iOS clients all derive from it — no drift.
- `apps/*` may depend on `packages/*` but never on each other.
- `infrastructure/cdk` is the only place that provisions AWS resources.
- Domain logic stays inside `apps/backend/src/modules/**/domain`; controllers and
  adapters are thin.
