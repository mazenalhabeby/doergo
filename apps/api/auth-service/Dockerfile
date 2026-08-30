FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/auth-service/package.json ./apps/api/auth-service/
RUN pnpm install --frozen-lockfile --prod=false

# The OCR language model, fetched at BUILD time.
#
# Left to itself tesseract.js downloads it from a public CDN on first use, which
# would make a member's document upload depend on somebody else's uptime, add
# seconds to the first request after every deploy, and fail outright on a box
# with no egress. It is 4 MB and static — there is no reason for it to arrive
# over the internet while somebody is waiting.
FROM base AS tessdata
RUN apk add --no-cache curl && \
    mkdir -p /tessdata && \
    curl -fsSL -o /tessdata/eng.traineddata \
      https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/eng.traineddata

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
# Beside the app, where MrzOcrService looks by default (TESSDATA_PATH overrides).
COPY --from=tessdata /tessdata ./apps/api/auth-service/tessdata
COPY infra/docker/scripts/auth-entrypoint.sh /app/auth-entrypoint.sh
RUN chmod +x /app/auth-entrypoint.sh
# Run as the built-in non-root `node` user (audit). /app chown'd so the entrypoint
# (prisma migrate deploy + node) runs; migrations write only to the DB, not disk.
RUN chown -R node:node /app
USER node
ENTRYPOINT ["/app/auth-entrypoint.sh"]
