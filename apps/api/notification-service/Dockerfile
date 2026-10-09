FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# -- Full deps (for building) --
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
# pnpm refuses a frozen install when a patch listed in package.json is missing.
COPY patches ./patches
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
RUN pnpm --filter @hbcfield/shared build
RUN cd apps/api/auth-service && npx prisma generate
RUN pnpm --filter @hbcfield/notification-service build

# -- Production dependencies, exactly as pnpm-lock.yaml pins them --
#
# This used to be `pnpm --filter <svc> deploy --prod --frozen-lockfile /prod`.
# Under pnpm 9, `pnpm deploy` NEVER reads the lockfile -- its own log says "The
# current configuration prohibits to read or write a lockfile" -- and the
# --frozen-lockfile flag on that line was silently ignored. Every build therefore
# re-resolved every range against the registry and shipped whatever it called
# latest that minute. It broke production builds three times while the lockfile
# pinned working versions: 2026-09-09 (@aws-sdk/credential-provider-login 3.972.78,
# tarball 404), 2026-10-01 (effect 4.0.0 hoisted, `prisma migrate deploy` crashed,
# sign-in down eight minutes), 2026-10-09 (@aws-sdk/client-s3 3.1149.0 whose
# dependencies were not downloadable yet; the lockfile pins 3.1014.0).
#
# Instead this is a second, prod-only `pnpm install` of the SAME lockfile, run
# --offline from the store the `deps` stage just filled: pnpm cannot reach the
# registry at all here, so a version the lockfile does not name cannot be fetched,
# let alone shipped. Proof in the build log: "Lockfile is up to date, resolution
# step is skipped", and no "prohibits to read or write a lockfile" warning.
#
# The lockfile is first trimmed to the importers this image needs (root, shared,
# this service). That only DROPS other apps' entries and changes no version;
# without it the hoisted linker installs web-app and mobile too (~1.8 GB).
FROM deps AS prod-deps
WORKDIR /prod-ws
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY patches ./patches
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/notification-service/package.json ./apps/api/notification-service/
RUN awk -v keep=" . packages/shared apps/api/notification-service " \
      '/^importers:/{imp=1} /^packages:/{imp=0} imp && /^  [^ ]/{k=$1; sub(/:$/,"",k); drop=(index(keep," " k " ")==0)} !(imp && drop)' \
      pnpm-lock.yaml > pnpm-lock.pruned.yaml && mv pnpm-lock.pruned.yaml pnpm-lock.yaml && \
    pnpm install --frozen-lockfile --prod --offline --filter "@hbcfield/notification-service..."

# -- Assemble the runtime tree --
#   /prod/app               -> /app               the service, built (dist, package.json ...)
#   /prod/app/node_modules  -> /app/node_modules  what the hoisted linker kept local to
#                                                 the service, incl. @hbcfield/shared
#   /prod/node_modules      -> /node_modules      the hoisted prod dependencies
# The hoisted ones sit one directory ABOVE the app, so Node looks in the service's
# own node_modules first and the hoisted ones second -- exactly as in the
# workspace (apps/api/<svc>/node_modules, then the root's) -- while the app keeps
# /app as its directory and working directory (dist/main.js, ./prisma, ./uploads).
FROM build AS bundle
COPY --from=prod-deps /prod-ws /prod-ws
# The service's own files without the build stage's dev node_modules -- the same
# files `pnpm deploy` used to copy -- then @hbcfield/shared, a workspace symlink in
# /prod-ws, replaced by the built package (plus whatever was kept local to it).
RUN mkdir -p /prod/app && \
    mv /prod-ws/node_modules /prod/node_modules && \
    tar -C apps/api/notification-service --exclude=./node_modules -cf - . | tar -C /prod/app -xf - && \
    mv /prod-ws/apps/api/notification-service/node_modules /prod/app/node_modules && \
    L=/prod/app/node_modules/@hbcfield/shared && rm -rf "$L" && mkdir -p "$L" && \
    cp -R packages/shared/package.json packages/shared/dist packages/shared/dist-esm "$L"/ && \
    if [ -d /prod-ws/packages/shared/node_modules ]; then mv /prod-ws/packages/shared/node_modules "$L"/node_modules; fi && \
    rm -rf /prod-ws
# overlay the generated Prisma client + engine + its scope (musl, same platform)
RUN rm -rf /prod/node_modules/.prisma /prod/node_modules/@prisma/client && \
    mkdir -p /prod/node_modules/@prisma && \
    cp -R node_modules/.prisma /prod/node_modules/.prisma && \
    cp -R node_modules/@prisma/client /prod/node_modules/@prisma/client

# -- Production --
FROM base AS production
ENV NODE_ENV=production
WORKDIR /app
COPY --from=bundle /prod/node_modules /node_modules
COPY --from=bundle /prod/app ./
COPY --from=build /app/apps/api/auth-service/prisma ./prisma
EXPOSE 4001
# Run as the built-in non-root `node` user (audit). No local file writes.
RUN chown -R node:node /app
USER node
CMD ["node", "dist/main.js"]
