FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# -- Dependencies (the console + @hbcfield/shared, which it takes its HTTP core from) --
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
# pnpm refuses a frozen install when a patch listed in package.json is missing.
COPY patches ./patches
COPY packages/shared/package.json ./packages/shared/
COPY apps/admin/package.json ./apps/admin/
# `@hbcfield/admin...` = the console AND its workspace dependencies (shared), so
# shared's own build dependencies are installed too.
RUN pnpm install --frozen-lockfile --prod=false --filter @hbcfield/admin...

# -- Build --
FROM deps AS build
# Declared here as well as passed by compose: an ARG that is not declared is
# silently dropped by Docker. SOCKET_URL is normally unset (same origin).
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SOCKET_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL
COPY tsconfig.base.json ./
COPY packages/shared/ ./packages/shared/
# Shared first: the console imports its built entry (@hbcfield/shared/client → dist-esm).
RUN pnpm --filter @hbcfield/shared build
COPY apps/admin/ ./apps/admin/
RUN pnpm --filter @hbcfield/admin build

# -- Production (standalone) --
FROM base AS production
ENV NODE_ENV=production
ENV PORT=3002
ENV HOSTNAME=0.0.0.0
COPY --from=build /app/apps/admin/.next/standalone ./
COPY --from=build /app/apps/admin/.next/static ./apps/admin/.next/static

EXPOSE 3002
RUN chown -R node:node /app
USER node
CMD ["node", "apps/admin/server.js"]
