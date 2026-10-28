#!/bin/bash
# Layer 0 — the foundation — in one command: green means the base still holds. LOCAL ONLY.
#
#   pnpm layer0:check            # ~6 minutes (needs `pnpm dev:api` running and the local docker database)
#   QUICK=1 pnpm layer0:check    # skips the two deliberate waits in the sign-in script
#
# 1. database: a fresh database built from the code; any difference from the schema beyond the reviewed list
#    (tools/layer0-known-drift.txt — SQL-only indexes Prisma cannot describe) fails
# 2. ratchets: size and structure (no import loops, no server code in the client bundle)
# 3. unit tests of the foundation: shared core (time zones, money, access), the gateway's guards and error filter,
#    sign-in and sessions in auth-service
# 4. live: sign-in and sessions attacked, the gateway layer attacked, speed and 200-at-once
#
# Production is NOT touched. Its own checks (TLS, ports, restore test) are listed in docs/plans/layer0-checks.md.
set -uo pipefail
cd "$(dirname "$0")/.."
FAILED=()
step() { printf '\n\033[1m━━ %s\033[0m\n' "$*"; }
run() { local name="$1"; shift; if "$@"; then echo "✔ $name"; else echo "✘ $name"; FAILED+=("$name"); fi; }

step "1. database"
db_check() {
  local pw fresh diff
  pw=$(grep -h '^DATABASE_URL' apps/api/auth-service/.env | sed -E 's#.*://[^:]*:([^@]*)@.*#\1#')
  fresh="postgresql://hbcfield:${pw}@localhost:5432/l0_check?schema=public"
  docker exec hbcfield-postgres psql -U hbcfield -d hbcfield -qc "drop database if exists l0_check" -c "create database l0_check" >/dev/null 2>&1
  (cd packages/db && DATABASE_URL="$fresh" npx ts-node prisma/baseline/create-fresh-db.ts >/tmp/l0-fresh.log 2>&1) || { tail -5 /tmp/l0-fresh.log; return 1; }
  diff=$(cd packages/db && npx prisma migrate diff --from-url "$fresh" --to-schema-datamodel prisma/schema.prisma --script 2>/dev/null | grep -vE '^--|^$' | sort)
  docker exec hbcfield-postgres psql -U hbcfield -d hbcfield -qc "drop database if exists l0_check" >/dev/null 2>&1
  local extra; extra=$(comm -13 tools/layer0-known-drift.txt <(echo "$diff"))
  [ -z "$extra" ] || { echo "new difference between the code and a database built from it:"; echo "$extra"; return 1; }
}
run "a fresh database matches the schema (only reviewed SQL-only items differ)" db_check

step "2. ratchets"
run "size" pnpm -s size:check
run "structure" pnpm -s structure:check

step "3. unit tests of the foundation"
# jest's exit code is the verdict; its output is kept short.
jest_in() { (cd "$1" && shift && npx jest --silent "$@" >/tmp/l0-jest.log 2>&1) || { grep -E '^(FAIL|Tests:)' /tmp/l0-jest.log; return 1; }; }
run "shared core" jest_in packages/shared
run "gateway common (guards, filter, throttling, scope)" jest_in apps/api/gateway src/common
run "auth-service sign-in and sessions" jest_in apps/api/auth-service src/modules/auth

step "4. live (local API)"
curl -sf -o /dev/null http://localhost:4000/api/v1/health || { echo "the local API is not running (pnpm dev:api)"; FAILED+=("local API"); }
run "sign-in and sessions attacked" python3 tools/layer0-auth-e2e.py ${QUICK:+--quick}
run "gateway layer attacked" python3 tools/layer0-gateway-e2e.py
run "speed and 200 at once" python3 tools/layer0-load.py

printf '\n'
if [ ${#FAILED[@]} -eq 0 ]; then printf '\033[32m■ LAYER 0 GREEN\033[0m\n'; else printf '\033[31m■ LAYER 0 RED:\033[0m %s\n' "${FAILED[*]}"; exit 1; fi
