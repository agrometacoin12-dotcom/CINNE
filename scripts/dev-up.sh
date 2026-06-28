#!/usr/bin/env bash
# CinneTemple — one-shot local bootstrap.
# Brings up Postgres + Redis, installs deps, and prepares the database.
# Run from the repo root:  bash scripts/dev-up.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "▶ 1/5  Starting local infra (Postgres + Redis)…"
docker compose up -d

echo "▶ 2/5  Enabling pnpm…"
corepack enable >/dev/null 2>&1 || true
corepack prepare pnpm@9 --activate >/dev/null 2>&1 || true

echo "▶ 3/5  Installing dependencies (first run takes a few minutes)…"
pnpm install

echo "▶ 4/5  Waiting for Postgres to be ready…"
until docker compose exec -T postgres pg_isready -U cinnetemple >/dev/null 2>&1; do
  sleep 1
done

echo "▶ 5/5  Generating Prisma client, applying migrations, seeding…"
pnpm --filter @cinnetemple/backend prisma:generate
pnpm --filter @cinnetemple/backend prisma:migrate --name init
pnpm --filter @cinnetemple/backend prisma:seed

cat <<'DONE'

✅ Local environment is ready.

Start the apps in two terminals:

  pnpm --filter @cinnetemple/backend dev    # API  → http://localhost:4000  (Swagger /docs, GraphQL /graphql)
  pnpm --filter @cinnetemple/web dev        # Web  → http://localhost:3000

Dev admin login:  admin@cinnetemple.local  /  ChangeMe!Dev12345
(Verification & reset codes print in the backend log.)

Stop infra later with:  docker compose down
DONE
