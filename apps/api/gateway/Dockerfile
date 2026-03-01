FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# -- Dependencies --
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/gateway/package.json ./apps/api/gateway/
RUN pnpm install --frozen-lockfile --prod=false

# -- Build --
FROM deps AS build
COPY packages/shared/ ./packages/shared/
COPY apps/api/gateway/ ./apps/api/gateway/
COPY tsconfig.base.json ./
RUN pnpm --filter @doergo/shared build
RUN pnpm --filter @doergo/api-gateway build

# -- Production --
FROM base AS production
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/apps/api/gateway/node_modules ./apps/api/gateway/node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/apps/api/gateway/dist ./apps/api/gateway/dist
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/gateway/package.json ./apps/api/gateway/
COPY pnpm-workspace.yaml package.json ./

EXPOSE 4000
CMD ["node", "apps/api/gateway/dist/main.js"]
