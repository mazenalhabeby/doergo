# Area 07 — Customer Portals (B2B2C)

Routes: `/portal/*` (external customers, 6 endpoints), `/portal-admin/*` (staff),
`/locations/[id]/portals/[portalId]` and the space's Portal tab.

> **This area was audited after a disagreement about whether it exists.** It does: `b2c_portal`
> is a live module priced at **€49/month** plus €29 per extra portal, listed on the public
> pricing page, with a `CUSTOMER` role, three models, a global confinement guard and six
> authenticated external endpoints. Nothing had been removed.

Status: **All six passes run. 2 findings fixed.** 0 Critical, 0 High, 1 Medium, 1 Low.

---

## A. What this feature is (from the code)

**In one paragraph:** an organization can invite its own clients into the app as `CUSTOMER`
accounts — a genuinely external principal, not staff. A customer logs in, sees the portal's
branding and category tree, the units or assets they hold, and their own requests with a
status timeline; they can submit a new request, which lands **un-triaged** in the office's
portal inbox until a staff member routes it to a space and a workflow, at which point it
becomes a normal task. The whole thing is mobile-only on the customer side; the web app
carries only the admin surface.

---

## Findings

| ID | Sev | Pass | Title | Status |
|----|-----|------|-------|--------|
| P-D1 | M | D | A customer's new request never appeared in the office inbox | **fixed** |
| P-C1 | L | C | Two dialogs (~470 lines) loaded eagerly on the portal admin page | **fixed** |

### P-D1 — the request arrived and nobody was told

Submitting a portal request creates a Task and announces `task_created`, but
`EVENT_INVALIDATIONS` mapped that to `["tasks"]` and `["taskStatusCounts"]` only. The
office's portal inbox is `["portalAllRequests", portalId]`, which nothing invalidated — so a
request from an external customer sat unseen on an open portal page until someone reloaded.
For a queue whose entire purpose is "a client is waiting", that is the wrong failure.

Wired into `task_created`, `task_updated` and `task_status_changed`. The new guard test
confirmed the key is real before it was committed.

### P-C1 — two dialogs in the first paint

`ApartmentDialog` (203) and `CustomerForm` (which drags in the whole 271-line customers-tab
module) were static imports on a 711-line admin page; both render on a click. Lazy now.
Small, and named as small — this is not the 6,400-line case from Areas 03 and 04.

---

## Verified good — and this is the substance of the area

Pass B found **nothing**, which is worth stating in detail because this is the only place in
the product where a non-employee authenticates.

- **Default-deny confinement.** `CustomerConfinementGuard` runs immediately after
  `JwtAuthGuard` in the global chain and refuses a `CUSTOMER` on any route not explicitly
  allowlisted. Its comment names the exact reason: `RolesGuard` and `PermissionsGuard`
  **fail open when undecorated**, so without this a valid customer token would reach any
  endpoint nobody had thought to decorate.
- **The allowlist is minimal and every entry is justified**: all of `/portal/*`,
  `/auth/me`, `/auth/logout`, and push-token register/unregister. Four things.
- **`CustomerScopeGuard` fails closed** on a customer with no linked `Customer` record, and
  **revokes on disable** — `customerPortalEnabled === false` is refused rather than merely
  hidden.
- **Every portal read filters by the token's `customerId`**, never a request parameter, in
  the `where` clause — confirmed at the service layer for requests (list *and* get, which
  404s), units and assets.
- **The response is an explicit allow-list, not a spread.** `portalRequestShape` builds a
  fixed object — id, reference, title, status, priority, unit, timeline — so a new column on
  `Task` cannot silently become customer-visible.
- **Submission is TOCTOU-free**: the category is resolved from the caller's *own* portal
  config and fails closed on an unknown key, and unit/asset ownership is validated **inside
  task-service in the same transaction** rather than checked in the gateway and trusted —
  the comment says so explicitly.
- **The socket layer confines customers too**, which is where I expected to find the leak.
  `handleAuthenticate` joins a `CUSTOMER` to their **own user room only** and never to
  `org:`/`role:`/`taskviewers:`, with a comment naming what would otherwise leak: org-wide
  staff attendance, presence, geofence and join-request events. A REST-only audit would have
  missed this; the socket is a second, parallel authorization surface and it is handled.
- **Socket auth itself is hardened**: JWT verified with a **pinned algorithm** (`HS256`, so
  none-alg and RS↔HS confusion are both closed), and the token's subject is cross-checked
  against the userId the client claims.
- **Portal admin routes are uniformly `canManageUsers`** — all fourteen.
- **i18n**: 104 keys across the admin surface, **0 missing** in de/es/fr/it.

## Open questions

- `portalRequestShape` returns `tracked: true` when the current status enables GPS, but no
  portal endpoint serves a location and the confinement guard blocks every other route — so
  a customer cannot fetch what the flag advertises. Either a tracking endpoint is missing or
  the flag is aspirational. Worth resolving before it becomes a support question.
- `listPortalRequests` has no `take:`. Bounded by one customer's own history, so not urgent,
  but it is an uncapped list.
- **Commercially**: this is a €49/month capability on the public pricing page that the team
  believed had been cancelled. Whether any organization has it enabled is a database
  question, not a code one — worth answering, because "nobody is watching it" is the
  condition under which the guards above stop being maintained.

## Verdict

**PASS WITH FIXES.** The highest-risk boundary in the product is also the best-defended part
of it — including the socket layer, which is the half most audits never look at.
