# syntax=docker/dockerfile:1
# Railway deployment for the static Next.js export.
# Build context is the monorepo root (like the backend Dockerfile).

# ---- Build stage ----
FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY . .
# Install the web app and its workspace dependencies (incl. dev deps for build).
RUN pnpm install --filter @cinnetemple/web... --frozen-lockfile
# NEXT_PUBLIC_* values are baked into the static bundle at build time.
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_REALTIME_URL
ENV NEXT_PUBLIC_REALTIME_URL=$NEXT_PUBLIC_REALTIME_URL
RUN pnpm --filter @cinnetemple/web build

# ---- Runtime stage ----
FROM caddy:2-alpine
COPY apps/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/out /srv
