FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
# pnpm refuses a frozen install when a patch listed in package.json is missing.
COPY patches ./patches
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
COPY apps/api/auth-service/package.json ./apps/api/auth-service/
RUN awk -v keep=" . packages/shared apps/api/auth-service " \
      '/^importers:/{imp=1} /^packages:/{imp=0} imp && /^  [^ ]/{k=$1; sub(/:$/,"",k); drop=(index(keep," " k " ")==0)} !(imp && drop)' \
      pnpm-lock.yaml > pnpm-lock.pruned.yaml && mv pnpm-lock.pruned.yaml pnpm-lock.yaml && \
    pnpm install --frozen-lockfile --prod --offline --filter "@hbcfield/auth-service..."

# -- Assemble the runtime tree (workspace layout, as the entrypoint expects) --
#   /prod/node_modules                      the hoisted prod dependencies
#   /prod/apps/api/auth-service             the service, built
#   /prod/apps/api/auth-service/node_modules  what the hoisted linker kept local
#                                             to the service (incl. @hbcfield/shared)
FROM build AS bundle
COPY --from=prod-deps /prod-ws /prod-ws
# The service's own files (dist, prisma, package.json ...) without the build
# stage's dev node_modules -- the same files `pnpm deploy` used to copy -- then
# @hbcfield/shared, a workspace symlink in /prod-ws, replaced by the built package
# (plus whatever the hoisted linker kept local to it).
RUN mkdir -p /prod/apps/api/auth-service && \
    mv /prod-ws/node_modules /prod/node_modules && \
    tar -C apps/api/auth-service --exclude=./node_modules -cf - . | tar -C /prod/apps/api/auth-service -xf - && \
    mv /prod-ws/apps/api/auth-service/node_modules /prod/apps/api/auth-service/node_modules && \
    L=/prod/apps/api/auth-service/node_modules/@hbcfield/shared && rm -rf "$L" && mkdir -p "$L" && \
    cp -R packages/shared/package.json packages/shared/dist packages/shared/dist-esm "$L"/ && \
    if [ -d /prod-ws/packages/shared/node_modules ]; then mv /prod-ws/packages/shared/node_modules "$L"/node_modules; fi && \
    rm -rf /prod-ws
# overlay generated client + full prisma toolchain (CLI+engines) for runtime `prisma migrate deploy`
RUN rm -rf /prod/node_modules/.prisma /prod/node_modules/@prisma /prod/node_modules/prisma && \
    cp -R node_modules/.prisma /prod/node_modules/.prisma && \
    cp -R node_modules/@prisma /prod/node_modules/@prisma && \
    cp -R node_modules/prisma /prod/node_modules/prisma && \
    mkdir -p /prod/node_modules/.bin && \
    cp -R node_modules/.bin/prisma /prod/node_modules/.bin/prisma
# Prisma's config loader needs `effect` 3.x. On 2026-10-01 the old `pnpm deploy`
# (which ignored the lockfile, see above) hoisted effect 4.0.0, `prisma migrate
# deploy` crashed at boot ("members.map is not a function") and sign-in was down
# for eight minutes. The lockfile-exact install above now gets the pinned 3.x on
# its own; this stays as a second guard: @prisma/config gets its own copy of the
# version the lockfile pins (with effect's own dependencies beside it), so nothing
# hoisted can reach it.
# The workspace is hoisted (.npmrc node-linker=hoisted), so the lockfile's
# effect sits at node_modules/effect. Copy it and everything it depends on;
# a missing package throws and fails the build instead of shipping a broken image.
RUN node -e "const fs=require('fs'),path=require('path');const dst='/prod/node_modules/@prisma/config/node_modules';const seen=new Set();const add=(n)=>{if(seen.has(n))return;seen.add(n);const src=path.join('node_modules',n);const pkg=JSON.parse(fs.readFileSync(path.join(src,'package.json'),'utf8'));fs.cpSync(src,path.join(dst,n),{recursive:true,dereference:true});Object.keys(pkg.dependencies||{}).forEach(add)};add('effect');console.log('prisma config deps:',[...seen].join(' '))"

FROM base AS production
ENV NODE_ENV=production
WORKDIR /app
COPY --from=bundle /prod ./
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
