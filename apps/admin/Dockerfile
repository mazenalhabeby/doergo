FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# -- Dependencies (admin is independent — no @hbcfield/shared) --
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/admin/package.json ./apps/admin/
RUN pnpm install --frozen-lockfile --prod=false --filter @hbcfield/admin...

# -- Build --
FROM deps AS build
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY apps/admin/ ./apps/admin/
COPY tsconfig.base.json ./
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
