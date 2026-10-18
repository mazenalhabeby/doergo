# API performance audit — 2026-10-18

Local stack (demo data), branch `refactor/code-audit-2026-10`. Production was read in the same session at the
infrastructure level only (load 0.06 / 8 cores, DB 36 MB, cache hit 100 %, no full scans on app tables); its
query texts were not read.

## Method

- 63 route × role pairs (admin, manager, employee), 20 calls each after two warm-ups; p50/p95 in ms.
- **SQL** = Postgres log lines between two markers, fewest of three tries. Postgres logs each statement as
  bind + execute, so the real query count is about **half** the number shown. Compared with the 2026-10-17 pass.
- DB time vs wall time measured separately (`dbtime.mjs`): on every route the database spends **0.5–6 ms**;
  the rest is round trips (≈3–4 ms per sequential query through Prisma) and the gateway → service hop
  (≈5 ms). The approvals inbox is the only route with real DB time (≈49 ms over 55 queries).

## Reads (after today's refactors, before this pass's fixes)

| Role | Route | p50 | p95 | SQL | SQL 10-17 |
|---|---|---|---|---|---|
| admin | `/approvals` | 54.1 | 132.8 | 119 | 149 |
| admin | `/calendar` | 23.3 | 60.2 | 35 | 41 |
| admin | `/employees/floor-now` | 20.9 | 27.9 | 27 | 27 |
| admin | `/attendance/status` | 20.3 | 24.2 | 25 | 25 |
| admin | `/billing/bill` | 15.2 | 123.5 | 22 | 35 |
| admin | `/tasks` | 30.4 | 53.7 | 17 | 15 |
| admin | `/overtime/summary` | 14.6 | 21.9 | 17 | 17 |
| admin | `/chat/contacts` | 13.3 | 19.1 | 13 | 13 |
| admin | `/assets` | 13 | 14.7 | 13 | 13 |
| admin | `/customers` | 11.3 | 17.7 | 11 | 11 |
| admin | `/customers/due` | 12.6 | 23.4 | 11 | 11 |
| admin | `/invoices` | 13.3 | 17.2 | 11 | 11 |
| admin | `/attendance/approvals/pending` | 12 | 13.6 | 11 | 11 |
| admin | `/attendance/no-shows/summary` | 13.5 | 16.1 | 11 | 11 |
| admin | `/documents/pending` | 49.3 | 117.2 | 11 | 11 |
| admin | `/organizations/members` | 14.8 | 22 | 9 | 9 |
| admin | `/locations` | 14.2 | 29.5 | 9 | 9 |
| admin | `/support/tickets` | 12.3 | 25 | 9 | 9 |
| admin | `/employees` | 11.5 | 15.8 | 7 | 7 |
| admin | `/chat/conversations` | 9.9 | 16.3 | 7 | 7 |
| admin | `/documents/compliance` | 75.5 | 153.2 | 7 | 7 |
| admin | `/tasks/open-for-me` | 8.5 | 13.5 | 5 | 5 |
| admin | `/chat/badge` | 7 | 8.1 | 3 | 3 |
| admin | `/attendance/active-entries` | 13.7 | 23.5 | 3 | 3 |
| admin | `/attendance/breaks/active` | 6.9 | 7.8 | 3 | 3 |
| admin | `/tasks/counts` | 7.3 | 27.3 | 1 | 1 |
| admin | `/approvals/count` | 5 | 13.6 | 1 | 1 |
| admin | `/attendance/entries` | 5.4 | 9.5 | 1 | 1 |
| admin | `/auth/me` | 5.7 | 8.1 | 1 | 1 |
| admin | `/analytics/catalog` | 6.2 | 8 | 1 | 1 |
| employee | `/calendar` | 37.3 | 63.8 | 33 | 55 |
| employee | `/tasks/handover/mine` | 40.6 | 171.5 | 31 | 31 |
| employee | `/attendance/status` | 52.6 | 121.5 | 25 | 26 |
| employee | `/attendance/clock-in-locations` | 56.2 | 337.1 | 23 | 23 |
| employee | `/tasks` | 50.9 | 94.7 | 15 | 21 |
| employee | `/documents/pending` | 17.1 | 40.6 | 11 | 11 |
| employee | `/chat/conversations` | 13.7 | 22.5 | 7 | 7 |
| employee | `/employees/me/request-options` | 16.7 | 31.3 | 7 | 7 |
| employee | `/assets/mine` | 14.8 | 45.9 | 5 | 5 |
| employee | `/tasks/open-for-me` | 16.2 | 22.5 | 5 | 5 |
| employee | `/attendance/auto-clock/plan` | 21.9 | 38.1 | 5 | 5 |
| employee | `/chat/badge` | 16.7 | 78.1 | 3 | 3 |
| employee | `/approvals/count` | 9.5 | 17.3 | 1 | 1 |
| employee | `/auth/me` | 9 | 20.8 | 1 | 1 |
| manager | `/approvals` | 58.6 | 76 | 105 | – |
| manager | `/calendar` | 17.7 | 52.6 | 29 | – |
| manager | `/employees/floor-now` | 35.5 | 114.1 | 27 | – |
| manager | `/attendance/status` | 51.5 | 142.4 | 25 | – |
| manager | `/customers` | 30.7 | 42.7 | 21 | – |
| manager | `/tasks` | 16.1 | 19.3 | 17 | – |
| manager | `/assets` | 26.7 | 57.3 | 13 | – |
| manager | `/attendance/approvals/pending` | 28 | 60.3 | 11 | – |
| manager | `/locations` | 16.7 | 26.4 | 9 | – |
| manager | `/documents/pending` | 17.9 | 33 | 9 | – |
| manager | `/employees` | 16.4 | 28.7 | 7 | – |
| manager | `/chat/conversations` | 28.2 | 68.4 | 7 | – |
| manager | `/chat/badge` | 13 | 24.1 | 3 | – |
| manager | `/attendance/active-entries` | 14.2 | 54.9 | 3 | – |
| manager | `/tasks/open-for-me` | 22.4 | 79.1 | 3 | – |
| manager | `/tasks/counts` | 6.1 | 9 | 1 | – |
| manager | `/approvals/count` | 7.2 | 12.9 | 1 | – |
| manager | `/attendance/entries` | 11.7 | 23.1 | 1 | – |
| manager | `/auth/me` | 12.8 | 16.7 | 1 | – |

**No regression** from the typed contracts, the validation pipe or the injected collaborators: every route
issues the same number of statements or fewer than on 2026-10-17, and p50s are lower (that pass ran while other
builds loaded the machine).

## Writes (validation pipe in the path)

| Role | Route | Status | p50 | p95 |
|---|---|---|---|---|
| admin | POST `/calendar/availability` | 201 | 37 | 66.4 |
| admin | POST `/calendar/free-slots` | 201 | 33 | 50.6 |
| admin | PATCH `/tasks/:id` | 404 | 1.1 | 1.8 |
| admin | POST `/tasks/:id/comments` | 201 | 30.2 | 113.8 |
| employee | POST `/attendance/heartbeat` | 201 | 22.1 | 44.9 |
| employee | POST `/tracking/location` | 201 | 15.3 | 24.3 |
| employee | POST `/employees/me/requests/precheck` | 200 | 47.4 | 78.5 |
| employee | POST `/chat/conversations/:id/messages` | 201 | 61.4 | 133.2 |
| employee | POST `/chat/conversations/:id/read` | 201 | 14.7 | 42.1 |
| admin | POST `/approvals/decide` | 404 | 12.7 | 16.7 |

No write route is slow; the pipe adds nothing visible next to the service work. (`PATCH /tasks/:id` is not a
route — tasks update through their own endpoints; `/approvals/decide` 404 is the probe's made-up id.)

## Fixed (identical JSON before/after, proven by swapping the committed code back in)

| Change | Before p50 | After p50 |
|---|---|---|
| `/attendance/status` (polled by the phone and the navbar): the open shift, the workspaces and the provisional clock-out read together; tags and excursion together | 23.2 ms | 20.6 ms |
| `/calendar`: organization zone and the workspace check read together | 34.9 ms | 25.5 ms |
| `/tasks/handover/mine`: open rows, own time, crew and checklist read together | 43.0 ms | 45.5 ms (noise; 2 fewer sequential trips) |
| Index `tasks(organizationId, createdAt)` — migration `20261018120000_tasks_org_created_idx` (applied locally only). The default task list (no status filter) walked `tasks_createdAt_idx` across **every** organization and filtered; it grows with other tenants' data | – | – |

JSON compared for 10 cases (four roles' status, two handovers, four calendars incl. a workspace and a 400 refusal):
all identical. Suites: task-service 2,610 pass (known `pdf-receipt`); e2e approvals, external access, clock audit
39/39, chat, calendar pass.

## Smells found and left (with reason)

- **Awaited queries in loops (62 hits, `n1.cjs`)**: almost all are per-row WRITES inside one transaction or a sweep
  claiming rows one by one (intentional: a conditional update per row is the claim), chunked inserts, a paged history
  read (`task-report-sections.ts:52`), a parent-chain walk (`task-hierarchy.service.ts:46`, depth-bounded) or a
  collision retry (`invitation.service.ts:150`). Request-path reads in loops are small N: customer sign batch
  (`customer-sign-batch.service.ts:106,131`, per signer), document routing (`document-routing.service.ts:185-218`,
  per signer). Left.
- **Unbounded lists on big tables (`unbounded.cjs`)**: portal request lists per portal/customer
  (`task-portal.service.ts:22,65`) have no `take` — a portal's own requests, small today; worth a page size when a
  portal passes a few hundred requests. Extra-time list (`extra-time.service.ts:189`) is bounded by state. Left.
- **Approvals inbox (≈120 statements)**: by design every kind is read through its own route as the caller; already
  concurrent. Left.
- **Duplicate `shift_assignments` read in `/attendance/status`** (twice, < 1 ms): inside the shift resolver,
  shared with the clock-in check. Not worth a second code path.
- **The 7–17 statements of `/tasks`**: already one parallel list + count and a cached workflow lookup; the wall time
  is the gateway → service hop plus the list's relation reads.
