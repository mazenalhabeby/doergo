FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# -- Dependencies --
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web-app/package.json ./apps/web-app/
RUN pnpm install --frozen-lockfile --prod=false

# -- Build --
FROM deps AS build
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_NAME=Doergo
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
COPY packages/shared/ ./packages/shared/
COPY apps/web-app/ ./apps/web-app/
COPY tsconfig.base.json ./
RUN pnpm --filter @doergo/shared build
RUN pnpm --filter @doergo/web-app build

# -- Production --
FROM base AS production
ENV NODE_ENV=production
COPY --from=build /app/apps/web-app/.next/standalone ./
COPY --from=build /app/apps/web-app/.next/static ./apps/web-app/.next/static
RUN mkdir -p apps/web-app/public

EXPOSE 3000
CMD ["node", "apps/web-app/server.js"]
