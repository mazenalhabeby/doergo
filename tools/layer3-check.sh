#!/bin/bash
# Layer 3 — people & time — in one command: green means clocking, counting, shifts, leave and the automatic clock
# still hold. LOCAL ONLY.
#
#   pnpm layer3:check        # ~30 minutes (needs `pnpm dev:api` and the local docker database)
#
# 1. unit tests: the shared attendance / calendar / leave / time-zone rules, task-service attendance + technicians +
#    calendar, the phone's offline clock
# 2. live: every layer-3 suite, EACH ON A CLEAN DAY. Run back to back they used to fail on each other: they share the
#    same people on the same day, and approval rules left in the local data hold their decisions for a second
#    approver. Before each suite the test people's entries of the last 20 h are removed and the organization's
#    approval rules are switched off; the rules are switched back on at the end, whatever happens.
set -uo pipefail
cd "$(dirname "$0")/.."
FAILED=()
step() { printf '\n\033[1m━━ %s\033[0m\n' "$*"; }
run() { local name="$1"; shift; if "$@"; then echo "✔ $name"; else echo "✘ $name"; FAILED+=("$name"); fi; }
jest_in() { (cd "$1" && shift && npx jest --silent "$@" >/tmp/l3-jest.log 2>&1) || { grep -E '^(FAIL|Tests:)' /tmp/l3-jest.log; return 1; }; }
psql_q() { docker exec hbcfield-postgres psql -U hbcfield -d hbcfield -Atc "$1"; }
ORG=$(psql_q "select \"organizationId\" from users where email='client@example.com'")
PEOPLE="'noor@example.com','mike@example.com','sarah@example.com','karim@example.com','lisa@example.com'"

RULES=$(psql_q "select coalesce(string_agg(''''||id||'''',','),'') from approval_rules where \"organizationId\"='$ORG' and \"isActive\"")
restore_rules() { [ -n "$RULES" ] && psql_q "update approval_rules set \"isActive\"=true where id in ($RULES)" >/dev/null; }
trap restore_rules EXIT

clean_day() {
  [ -n "$RULES" ] && psql_q "update approval_rules set \"isActive\"=false where id in ($RULES)" >/dev/null
  local ids
  ids=$(psql_q "select coalesce(string_agg(''''||e.id||'''',','),'') from time_entries e join users u on u.id=e.\"userId\"
    where u.email in ($PEOPLE) and e.\"clockInAt\" > now() - interval '20 hours'")
  [ -n "$ids" ] && psql_q "delete from breaks where \"timeEntryId\" in ($ids); delete from time_entries where id in ($ids)" >/dev/null
  docker exec hbcfield-redis sh -c "redis-cli --scan --pattern 'throttle:*' | xargs -r redis-cli del" >/dev/null
}
suite() { local name="$1"; shift; clean_day; run "$name" "$@"; }

step "1. unit tests"
run "shared: attendance, calendar, leave, zones" jest_in packages/shared "src/(attendance|calendar|leave|requests|utils/__tests__/zone)"
run "task-service: attendance" jest_in apps/api/task-service src/modules/attendance
run "task-service: people, leave, calendar" jest_in apps/api/task-service "src/modules/(technicians|calendar|members|spaces)"
run "phone: the offline clock" jest_in apps/mobile "src/offline/attendance"

step "2. live (local API), each suite on a clean day"
curl -sf -o /dev/null http://localhost:4000/api/v1/health || { echo "the local API is not running (pnpm dev:api)"; FAILED+=("local API"); }
suite "the clock audit (39)" python3 tools/clock-audit.py
suite "a member's day at the clock" python3 tools/clock-in-day-e2e.py
suite "the clock review" python3 tools/clock-review-e2e.py
suite "counting time (~50)" python3 tools/time-counting-e2e.py
suite "time outside the shift (11)" python3 tools/outside-shift-e2e.py
suite "the company calendar (39)" python3 tools/calendar-e2e.py
suite "a leader's own requests (13)" python3 tools/leader-requests-e2e.py
suite "which hours the client is charged" python3 tools/hours-basis-e2e.py
suite "the automatic clock (no sweep waits)" python3 tools/auto-clock-e2e.py --no-sweep

echo
if [ ${#FAILED[@]} -eq 0 ]; then printf '\033[1;32m■ LAYER 3 GREEN\033[0m\n'; exit 0; fi
printf '\033[1;31m■ LAYER 3 RED — %s\033[0m\n' "${FAILED[*]}"
exit 1
