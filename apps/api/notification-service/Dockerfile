FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# -- Dependencies --
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/auth-service/package.json ./apps/api/auth-service/
COPY apps/api/notification-service/package.json ./apps/api/notification-service/
RUN pnpm install --frozen-lockfile --prod=false

# -- Build --
FROM deps AS build
COPY packages/shared/ ./packages/shared/
COPY apps/api/auth-service/prisma/ ./apps/api/auth-service/prisma/
COPY apps/api/notification-service/ ./apps/api/notification-service/
COPY tsconfig.base.json ./
RUN pnpm --filter @doergo/shared build
RUN cd apps/api/auth-service && npx prisma generate
RUN pnpm --filter @doergo/notification-service build

# -- Production --
FROM base AS production
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/apps/api/notification-service/node_modules ./apps/api/notification-service/node_modules
COPY --from=deps /app/apps/api/auth-service/node_modules ./apps/api/auth-service/node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/apps/api/notification-service/dist ./apps/api/notification-service/dist
COPY --from=build /app/apps/api/auth-service/prisma ./apps/api/auth-service/prisma
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/notification-service/package.json ./apps/api/notification-service/
COPY apps/api/auth-service/package.json ./apps/api/auth-service/
COPY pnpm-workspace.yaml package.json ./
RUN cd apps/api/auth-service && npx prisma generate

EXPOSE 4001
CMD ["node", "apps/api/notification-service/dist/main.js"]
