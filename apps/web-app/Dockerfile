FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# -- Dependencies --
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web-app/package.json ./apps/web-app/
RUN pnpm install --frozen-lockfile --prod=false

# -- Build --
FROM deps AS build
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_AUTH_URL
ARG NEXT_PUBLIC_SOCKET_URL
ARG NEXT_PUBLIC_APP_NAME=HBCField
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
# Map tiles. Unset, the app falls back to OpenStreetMap's public servers, which
# their Tile Usage Policy does not permit at commercial volume. These must be
# declared here as well as passed by compose: an ARG that is not declared is
# silently dropped by Docker, so the paid tile host would be configured, billed
# for, and never actually used.
ARG NEXT_PUBLIC_MAP_TILE_URL
ARG NEXT_PUBLIC_MAP_TILE_ATTRIBUTION
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_AUTH_URL=$NEXT_PUBLIC_AUTH_URL
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL
ENV NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
ENV NEXT_PUBLIC_MAP_TILE_URL=$NEXT_PUBLIC_MAP_TILE_URL
ENV NEXT_PUBLIC_MAP_TILE_ATTRIBUTION=$NEXT_PUBLIC_MAP_TILE_ATTRIBUTION
COPY packages/shared/ ./packages/shared/
COPY apps/web-app/ ./apps/web-app/
COPY tsconfig.base.json ./
RUN pnpm --filter @hbcfield/shared build
RUN pnpm --filter @hbcfield/web-app build

# -- Production --
FROM base AS production
ENV NODE_ENV=production
COPY --from=build /app/apps/web-app/.next/standalone ./
COPY --from=build /app/apps/web-app/.next/static ./apps/web-app/.next/static
# public/ is NOT bundled into Next's standalone output — copy it explicitly or
# every static asset (favicon, /shots/*, /intro.mp4) 404s at runtime.
COPY --from=build /app/apps/web-app/public ./apps/web-app/public

EXPOSE 3000
# Run as the built-in non-root `node` user (audit). /app chown'd so Next can write
# its .next/cache at runtime if needed.
RUN chown -R node:node /app
USER node
CMD ["node", "apps/web-app/server.js"]
