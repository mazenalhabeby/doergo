FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/auth-service/package.json ./apps/api/auth-service/
RUN pnpm install --frozen-lockfile --prod=false

FROM deps AS build
COPY packages/shared/ ./packages/shared/
COPY apps/api/auth-service/ ./apps/api/auth-service/
COPY tsconfig.base.json ./
RUN pnpm --filter @hbcfield/shared build
RUN cd apps/api/auth-service && npx prisma generate
RUN pnpm --filter @hbcfield/auth-service build
RUN pnpm --filter @hbcfield/auth-service deploy --prod /prod
# overlay generated client + full prisma toolchain (CLI+engines) for runtime `prisma migrate deploy`
RUN rm -rf /prod/node_modules/.prisma /prod/node_modules/@prisma /prod/node_modules/prisma && \
    cp -R node_modules/.prisma /prod/node_modules/.prisma && \
    cp -R node_modules/@prisma /prod/node_modules/@prisma && \
    cp -R node_modules/prisma /prod/node_modules/prisma && \
    cp -R node_modules/.bin/prisma /prod/node_modules/.bin/prisma

FROM base AS production
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /prod ./apps/api/auth-service
COPY --from=build /app/apps/api/auth-service/prisma ./apps/api/auth-service/prisma
COPY infra/docker/scripts/auth-entrypoint.sh /app/auth-entrypoint.sh
RUN chmod +x /app/auth-entrypoint.sh
# Run as the built-in non-root `node` user (audit). /app chown'd so the entrypoint
# (prisma migrate deploy + node) runs; migrations write only to the DB, not disk.
RUN chown -R node:node /app
USER node
ENTRYPOINT ["/app/auth-entrypoint.sh"]
