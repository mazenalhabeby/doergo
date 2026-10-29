#!/bin/bash
# Layer 2 — the organization and its workspaces — in one command: green means the base the work stands on holds.
# LOCAL ONLY.
#
#   pnpm layer2:check        # ~6 minutes (needs `pnpm dev:api` and the local docker database)
#
# 1. unit tests: the bill (module prices, usage ladders, seats, the €2 observer seat, the agreed price, billing modes,
#    alerts), the gates (module guard, Options guard failing closed, gating keys, module surfaces, Option surfaces on
#    the web), legal companies, the default workspace, currencies
# 2. live: tools/layer2-e2e.py (a workspace's life, a module and an Option switched off for real, company vs
#    workspace values, the bill moving by exactly a module's price, who may change what, 50 workspaces timed),
#    tools/companies-e2e.py (36), tools/currency-e2e.py
set -uo pipefail
cd "$(dirname "$0")/.."
FAILED=()
step() { printf '\n\033[1m━━ %s\033[0m\n' "$*"; }
run() { local name="$1"; shift; if "$@"; then echo "✔ $name"; else echo "✘ $name"; FAILED+=("$name"); fi; }
jest_in() { (cd "$1" && shift && npx jest --silent "$@" >/tmp/l2-jest.log 2>&1) || { grep -E '^(FAIL|Tests:)' /tmp/l2-jest.log; return 1; }; }

step "1. unit tests"
run "shared: the bill, currencies, legal companies" jest_in packages/shared src/billing
run "gateway: module and Option gates" jest_in apps/api/gateway "(module-guard|plan-guard|gating-keys|module-surfaces|access-module-guard|subscription-guard)"
run "auth-service: billing, legal companies, invoices currency" jest_in apps/api/auth-service "src/modules/(billing|invoices)"
run "task-service: workspaces and the default" jest_in apps/api/task-service "(src/modules/spaces|task-create-steps)"
run "web: Options and modules leave the menu and the page" jest_in apps/web-app "(option-surfaces|external-supervisor-surfaces)"

step "2. live (local API)"
curl -sf -o /dev/null http://localhost:4000/api/v1/health || { echo "the local API is not running (pnpm dev:api)"; FAILED+=("local API"); }
run "workspaces, modules, Options, the bill, who may change what, speed" python3 tools/layer2-e2e.py
run "legal companies" python3 tools/companies-e2e.py
run "currencies" python3 tools/currency-e2e.py

echo
if [ ${#FAILED[@]} -eq 0 ]; then printf '\033[1;32m■ LAYER 2 GREEN\033[0m\n'; exit 0; fi
printf '\033[1;31m■ LAYER 2 RED — %s\033[0m\n' "${FAILED[*]}"
exit 1
