# ---- Build stage ----
FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml* ./
COPY apps/backend/package.json apps/backend/
RUN pnpm install --filter @cinnetemple/backend... --frozen-lockfile || pnpm install
COPY . .
RUN pnpm --filter @cinnetemple/backend prisma:generate \
 && pnpm --filter @cinnetemple/backend build

# ---- Runtime stage ----
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN corepack enable
COPY --from=build /app/apps/backend/dist ./dist
COPY --from=build /app/apps/backend/package.json ./
COPY --from=build /app/apps/backend/prisma ./prisma
COPY --from=build /app/node_modules ./node_modules
EXPOSE 4000
# Apply migrations then start (ECS task / entrypoint)
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && node dist/main.js"]
