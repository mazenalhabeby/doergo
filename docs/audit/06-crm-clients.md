# Area 06 — CRM & Clients

Routes: `/clients`, `/customers/[id]`, plus a space's Customers tab.

Status: **All six passes run. All 3 findings fixed**, plus 2 found while fixing.
0 High, 3 Medium.

---

## A. What this feature is (from the code)

**In one paragraph:** a Customer is a client record that can live org-wide or be scoped to a
space with the `crm` module on. It carries addresses (`CustomerUnit`, one primary, shown on
a map), an activity timeline of notes / calls / reminders, an owner and co-managers, and
optionally a portal login. Access is **per record**: a rep with `crmViewOwn` sees only
clients they own or co-manage; `crmViewAll` sees everything; separate caps govern working
the timeline (`crmWork`), editing details (`crmEditInfo`) and creating/archiving
(`crmManageClients`). A nightly scheduler sweeps due reminders and notifies each assigned
manager.

### Server surface

The CRM routes deliberately carry **no** flat `@RequirePermission` — the controller says so
in a comment. Dropping it is what lets a scoped rep reach their own clients at all;
authorization moved into the service, against the caller's resolved caps and the record's
ownership.

---

## Findings

| ID | Sev | Pass | Title | Status |
|----|-----|------|-------|--------|
| C-D1 | M | D | `customer.reminder` was emitted to a manager and nothing listened | **fixed** |
| C-D2 | M | D | The CRM announced nothing at all — no mutation was visible to anyone else | **fixed** |
| C-E1 | M | E | A third near-identical events service was about to be written | **fixed** |

### C-D1 — a reminder nobody could receive on the web

`crm-reminder.handler.ts:46` emits `customer.reminder` to each assigned manager with a
**complete** payload — client name, note body, reminder kind, timestamp. Mobile gets a push.
On the web there is no push, and no client subscribed to the socket event, so a follow-up
falling due was invisible.

Unlike the two overtime events left unwired in Area 05, this one needed no query: the
payload is self-contained and the notification bell is its obvious home. Wired there, with
a new `notifications.crmReminder` key in all five locales.

### C-D2 — the CRM had no live sync whatsoever

`customers.service.ts` contains **zero** `emit(` calls, and nothing customer-related existed
in `EVENT_INVALIDATIONS`. A rep logging an activity was invisible to a co-manager viewing
the same client; a new client never appeared on another admin's list; an archived client
stayed on screen.

Now every mutation — create, update, archive, and all three activity operations —
broadcasts `customer_changed` to the org room on success. Ids only, so a rep who cannot
reach that client refetches and gets back what they are allowed to see: the scoping lives in
the endpoint, not in who receives the hint.

### C-E1 — the third copy

`MemberEventsService` (Area 01) and `SpaceEventsService` (Area 03) were the same service
with different nouns: identical emit / try / catch / warn. CRM would have been the third.
Consolidated into one `OrgEventsService` with a private `announce()` and named methods
(`memberChanged`, `spaceChanged`, `shareChanged`, `customerChanged`), so the two invariants
that make a broadcast safe — **ids only** and **fire-and-forget** — are stated once instead
of three times. Five controllers rewired.

---

## Found while fixing — and this is the important part

**I made the phantom-key mistake this audit has warned about three times.** My first CRM
invalidation list contained `["customers"]`, which is the obvious name for the clients list.
The list is `["my-clients"]`. `invalidateQueries` never throws on a key nothing uses, so the
wiring would have looked complete, the event would have fired, and the screen would not have
moved.

I caught it by checking each key against the source before committing, then wrote the check
as a test — `hooks/__tests__/realtime-keys.spec.ts` asserts every key in
`EVENT_INVALIDATIONS` matches at least one real `queryKey`.

**That test immediately found a pre-existing one I had not been looking for.**
`[Events.WORKER_LOCATION]: [["workerLocations"]]` — no query in the app has ever used
`workerLocations`. The real key is `["task-route", taskId]`. So every GPS update from a
technician invalidated nothing, and a dispatcher watching a task's route map saw it frozen
until they reloaded. Fixed.

That is two phantom keys in one area, one of them mine, plus `attendance-today` historically
— the same defect three times. It is now impossible to add a fourth without a red test.

> The scanner first reported `"customers"` from my own explanatory comment. Like the
> `@RequirePlan` scanner in Area 04, it strips comments now: a checker that counts prose as
> code reports the documentation as the bug.

---

## Verified good (checked, no finding)

- **The per-record CRM authorization is the most carefully built access layer in the
  product.** `crmCapsFor` resolves capabilities from the database (the caller payload carries
  only `userId` and a token-derived `role`), `canReach` implements own-vs-all, and **every**
  entry point enforces: list, get, create, update, archive, and all four activity methods
  call `assertCrmReach` — writes with `needWork: true`. Dropping the route guard was
  deliberate and was compensated everywhere.
- **Archiving is a manage-level action**, soft-deletes to preserve history on tasks and
  reports, deactivates the customer's portal logins in the same transaction, and returns
  their ids so the gateway can bust the cached tokens immediately rather than at the 60s TTL.
- **Space-scoped CRM checks the space's `crm` module** on both create and update — moving a
  client into a space cannot bypass the gate that creating one there enforces.
- **The reminder sweep is cron-locked** (`runWithCronLock`), so it cannot double-notify
  across replicas.
- **Leaflet is already correctly split** — `address-map.tsx` is loaded with `dynamic()` by
  `customer-addresses.tsx`, so the map library is not in the page's first paint. **No Pass C
  finding here**: the detail page is 792 lines with three small siblings, nothing like the
  6,400-line cases in Areas 03 and 04.
- **i18n**: 100 distinct keys across 5 files, **0 missing** in de/es/fr/it.

## Verdict

**PASS WITH FIXES** — no security findings; the whole area's weakness was that nothing it
did was visible to anyone else.
