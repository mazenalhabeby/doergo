#!/bin/bash
# Layer 4 — the work — in one command: green means jobs and workflows, a crew on one job, jobs open to a work role,
# assets / custody / expenses, CRM and the client portal, and documents still hold. LOCAL ONLY.
#
#   pnpm layer4:check        # ~15 minutes (needs `pnpm dev:api` and the local docker database)
#
# 1. unit tests: task-service jobs, crews, assets, portal; auth-service clients, documents, portal; the shared rules
# 2. live: the crew (45), jobs open to a role (38), clients from the phone's contacts, chat (three phases)
set -uo pipefail
cd "$(dirname "$0")/.."
FAILED=()
step() { printf '\n\033[1m━━ %s\033[0m\n' "$*"; }
run() { local name="$1"; shift; if "$@"; then echo "✔ $name"; else echo "✘ $name"; FAILED+=("$name"); fi; }
# The PDF readers fail on this machine before any layer-4 work (no PDF engine) — named, not hidden.
KNOWN='pdf-receipt|background-reader'
jest_in() {
  (cd "$1" && shift && npx jest --silent --testPathIgnorePatterns "$KNOWN" "$@" >/tmp/l4-jest.log 2>&1) ||
    { grep -E '^(FAIL|Tests:)' /tmp/l4-jest.log; return 1; }
}
unthrottle() { docker exec hbcfield-redis sh -c "redis-cli --scan --pattern 'throttle:*' | xargs -r redis-cli del" >/dev/null; }
live() { local name="$1"; shift; unthrottle; run "$name" "$@"; }

step "1. unit tests"
run "task-service: jobs, crews, role jobs, assets, portal, recurring" \
  jest_in apps/api/task-service "src/modules/(tasks|assets|recurring|portal|customers)"
run "auth-service: clients, documents, portal, members" jest_in apps/api/auth-service "src/modules/(customers|documents|portal|users)"
run "gateway: portal and tasks" jest_in apps/api/gateway "src/modules/(portal|tasks|assets|customers|documents)"
run "shared: tasks, assets, CRM, documents, access" jest_in packages/shared "src/(tasks|assets|crm|documents|access)"
run "phone: equipment and expenses" jest_in apps/mobile "src/(features/equipment|lib)"

step "2. live (local API)"
curl -sf -o /dev/null http://localhost:4000/api/v1/health || { echo "the local API is not running (pnpm dev:api)"; FAILED+=("local API"); }
live "a crew on one job (45)" python3 tools/crew-e2e.py
live "jobs open to a work role (38)" python3 tools/role-tasks-e2e.py
live "clients from the phone's contacts" python3 tools/contacts-import-e2e.py
live "chat" node tools/chat-e2e.mjs
live "chat: groups" node tools/chat-phase2-e2e.mjs
live "chat: a job's chat, search" node tools/chat-phase3-e2e.mjs

echo
if [ ${#FAILED[@]} -eq 0 ]; then printf '\033[1;32m■ LAYER 4 GREEN\033[0m\n'; exit 0; fi
printf '\033[1;31m■ LAYER 4 RED — %s\033[0m\n' "${FAILED[*]}"
exit 1
