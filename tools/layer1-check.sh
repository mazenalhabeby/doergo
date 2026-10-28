#!/bin/bash
# Layer 1 — permissions — in one command: green means who-may-do-what still holds. LOCAL ONLY.
#
#   pnpm layer1:check        # ~30 minutes (needs `pnpm dev:api` and the local docker database)
#
# 1. unit tests of every permission rule: the shared resolver and levels, document visibility, CRM reach, the
#    gateway's guards and route sweeps (external reach, observer writes, scope forwarding), every service's
#    "is this in the caller's scope" boundary, the grant ceiling, stand-ins
# 2. live: tools/layer1-access-e2e.py (the reviewed access map, raising one's own power, power given and taken
#    away), tools/layer1-deep-e2e.py (every route naming a record, with real ids, and every write — by another
#    organization, an external, an employee and a leader of another workspace; the database fingerprinted around
#    each; reviewed map tools/layer1-record-map.txt), tools/layer1-socket-e2e.mjs (live updates), the external
#    member (48 checks), a task open to a role
#
# ⚠️ Local must run like production: ACCESS_IGNORE_LEGACY_FLAGS=true in the services' .env (the old per-user
#    columns grant nothing). Without it a seeded employee with an old column set reads the member list.
set -uo pipefail
cd "$(dirname "$0")/.."
FAILED=()
step() { printf '\n\033[1m━━ %s\033[0m\n' "$*"; }
run() { local name="$1"; shift; if "$@"; then echo "✔ $name"; else echo "✘ $name"; FAILED+=("$name"); fi; }
jest_in() { (cd "$1" && shift && npx jest --silent "$@" >/tmp/l1-jest.log 2>&1) || { grep -E '^(FAIL|Tests:)' /tmp/l1-jest.log; return 1; }; }
PERM='(access|permission|scope|external|grant|ceiling|role|guard|reach|visibility|deny|delegation|stand-in|found-in-org|observer|takeover|tenant)'

step "0. local runs like production"
legacy_off() { for s in auth-service task-service gateway notification-service; do
  grep -q '^ACCESS_IGNORE_LEGACY_FLAGS=true' "apps/api/$s/.env" || { echo "apps/api/$s/.env: ACCESS_IGNORE_LEGACY_FLAGS=true missing"; return 1; }
done; }
run "the old per-user permission columns grant nothing" legacy_off

step "1. unit tests of every permission rule"
run "shared: resolver, levels, documents, CRM reach" jest_in packages/shared "src/(access|crm)"
run "gateway: guards and route sweeps" jest_in apps/api/gateway "$PERM"
run "task-service: scope boundaries" jest_in apps/api/task-service "$PERM"
run "auth-service: roles, members, documents, portal" jest_in apps/api/auth-service "$PERM"
run "tracking-service: workspace scope" jest_in apps/api/tracking-service scope

step "2. live (local API)"
curl -sf -o /dev/null http://localhost:4000/api/v1/health || { echo "the local API is not running (pnpm dev:api)"; FAILED+=("local API"); }
run "access map, another organization, raising power, taking it away" python3 tools/layer1-access-e2e.py
run "every record route, every write, the workspace boundary" python3 tools/layer1-deep-e2e.py
run "live updates: nobody hears what they may not see" node tools/layer1-socket-e2e.mjs
run "an external member keeps to their workspace" python3 tools/external-access-e2e.py
run "a task open to a work role" python3 tools/role-tasks-e2e.py

echo
if [ ${#FAILED[@]} -eq 0 ]; then printf '\033[1;32m■ LAYER 1 GREEN\033[0m\n'; exit 0; fi
printf '\033[1;31m■ LAYER 1 RED — %s\033[0m\n' "${FAILED[*]}"
exit 1
