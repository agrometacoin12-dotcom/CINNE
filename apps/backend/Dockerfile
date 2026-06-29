# syntax=docker/dockerfile:1
# ---- Build stage ----
FROM node:20-bookworm-slim AS build
WORKDIR /app
# OpenSSL is required by Prisma's engines.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable
# Copy the whole workspace (node_modules excluded via .dockerignore) so the
# filtered install can resolve every package.json in the monorepo.
COPY . .
# Install the backend and its workspace dependencies (incl. dev deps for build).
RUN pnpm install --filter @cinnetemple/backend... --frozen-lockfile
RUN pnpm --filter @cinnetemple/backend prisma:generate \
 && pnpm --filter @cinnetemple/backend build

# ---- Runtime stage ----
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app/apps/backend
# Bring the built workspace across intact (preserves the pnpm symlink layout,
# the generated Prisma client, and the Prisma CLI used for migrations).
COPY --from=build /app /app
EXPOSE 4000
# Assemble DATABASE_URL from the injected RDS secret fields (DB_*), run pending
# migrations, then start. Falls back to a pre-set DATABASE_URL for local dev.
CMD ["sh", "-c", "if [ -n \"$DB_HOST\" ]; then export DATABASE_URL=\"postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME?schema=public\"; fi && node_modules/.bin/prisma migrate deploy && node dist/main.js"]
