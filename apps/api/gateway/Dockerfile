FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# -- Full deps (for building) --
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/auth-service/package.json ./apps/api/auth-service/
COPY apps/api/gateway/package.json ./apps/api/gateway/
RUN pnpm install --frozen-lockfile --prod=false

# -- Build + scoped prod bundle --
FROM deps AS build
COPY packages/shared/ ./packages/shared/
COPY apps/api/auth-service/prisma/ ./apps/api/auth-service/prisma/
COPY apps/api/gateway/ ./apps/api/gateway/
COPY tsconfig.base.json ./
RUN pnpm --filter @hbcfield/shared build
RUN cd apps/api/auth-service && npx prisma generate
RUN pnpm --filter @hbcfield/api-gateway build
RUN pnpm --filter @hbcfield/api-gateway deploy --prod /prod
RUN rm -rf /prod/node_modules/.prisma /prod/node_modules/@prisma/client && \
    cp -R node_modules/.prisma /prod/node_modules/.prisma && \
    cp -R node_modules/@prisma/client /prod/node_modules/@prisma/client

# -- Production --
FROM base AS production
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /prod ./
COPY --from=build /app/apps/api/auth-service/prisma ./prisma
EXPOSE 4000
CMD ["node", "dist/main.js"]
