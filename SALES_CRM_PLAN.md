# Sales / CRM Module — Plan

> **Status:** draft plan, nothing built. Scope may still change from open questions in §9.
> **Goal:** support a **salesperson** as a first-class persona — accounts, contacts, leads,
> a deal pipeline, quotes, commissions, activity logging, and (the standout) **smart
> multi-stop route planning** for customer visits — built **on top of the primitives
> HBCField already has**, not as a separate silo.

---

## 1. Design principle — build on what exists

The system is already ~60% of the way to a field-sales CRM. Reuse before adding:

| Need | Reuse the existing… |
|---|---|
| Accounts (customer companies) | **Customer-company Spaces** (already carry contact fields; ownership kind = CUSTOMER) |
| Salesperson persona | Dynamic **Access Profile** + the `sales` position preset (modules `tasks` + `time_off`) |
| Visit workflow | The built-in **"Sales Visit" task type** (Scheduled → On-the-way → Visited → Outcome, with GPS + form) |
| Custom data on any record | **Custom fields** (task-type-scoped) |
| Route/GPS | **OSRM** (already self-hosted for road-snapping) + **`/geo`** Google Places proxy (geocoding) |
| Quotes → billing | The **invoice builder + Ledger** (customer-space invoicing already shipped) |
| Realtime updates | `use-realtime-sync` + org socket room (`attendance.changed` pattern) |
| Audit trail | `activity_logs` (`[resourceId, createdAt]` per-entity index) |
| Feature gating | `tierAllows()` + `PlanGuard` (a new `crm` capability) |

**What's genuinely new:** Lead, Opportunity/Deal, Contact, Pipeline/Stage, Quote,
Commission, and a **Route-optimization** service.

---

## 2. Data model (new Prisma models — additive migration)

```prisma
// A person at an account (the account itself = a CUSTOMER-kind CompanyLocation/Space).
model Contact {
  id             String  @id @default(cuid())
  organizationId String
  spaceId        String? // the customer-company space this contact belongs to
  firstName      String
  lastName       String?
  title          String?
  email          String?
  phone          String?
  isPrimary      Boolean @default(false)
  ownerId        String? // sales rep who owns the relationship
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  @@index([organizationId, spaceId])
}

enum LeadStatus { NEW WORKING QUALIFIED UNQUALIFIED CONVERTED }

// A prospect not yet an account. Converts to an Account (space) + Deal.
model Lead {
  id             String     @id @default(cuid())
  organizationId String
  name           String
  company        String?
  email          String?
  phone          String?
  source         String?    // "web", "referral", "event"…
  status         LeadStatus @default(NEW)
  ownerId        String?
  convertedSpaceId String?  // set on conversion
  convertedDealId  String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  @@index([organizationId, status])
  @@index([ownerId, status])
}

// Pipelines are configurable (reuse the workflow-stage pattern). A Deal moves stages.
model Pipeline {
  id             String  @id @default(cuid())
  organizationId String
  name           String
  isDefault      Boolean @default(false)
  stages         PipelineStage[]
}
model PipelineStage {
  id          String  @id @default(cuid())
  pipelineId  String
  name        String
  position    Int
  probability Int     @default(0) // % — drives the weighted forecast
  isWon       Boolean @default(false)
  isLost      Boolean @default(false)
  pipeline    Pipeline @relation(fields: [pipelineId], references: [id], onDelete: Cascade)
}

model Deal {
  id             String   @id @default(cuid())
  organizationId String
  title          String
  spaceId        String?  // the customer-company space (account)
  contactId      String?
  ownerId        String?  // sales rep
  pipelineId     String
  stageId        String
  amountCents    Int      @default(0)
  currency       String   @default("EUR")
  expectedCloseAt DateTime?
  closedAt       DateTime?
  wonReason      String?
  lostReason     String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  @@index([organizationId, stageId])
  @@index([ownerId, stageId])
}

enum ActivityType { CALL EMAIL NOTE MEETING VISIT }
// Timeline entry on a lead / deal / account. VISIT can link a Sales-Visit task.
model SalesActivity {
  id             String   @id @default(cuid())
  organizationId String
  type           ActivityType
  ownerId        String?
  leadId         String?
  dealId         String?
  spaceId        String?
  taskId         String?  // link to a Sales-Visit task when type = VISIT
  subject        String?
  body           String?
  dueAt          DateTime?
  doneAt         DateTime?
  createdAt      DateTime @default(now())
  @@index([organizationId, dealId])
  @@index([ownerId, dueAt])
}

// Reuse the invoice builder shape; a won Quote can spawn a Ledger invoice.
model Quote { /* number, dealId, spaceId, lineItems(Json), subtotal, tax, total, status, validUntil, sentAt, acceptedAt */ }

enum CommissionBasis { BOOKED PAID }
model CommissionRule {
  id             String @id @default(cuid())
  organizationId String
  name           String
  percent        Float           // e.g. 5 = 5%
  basis          CommissionBasis @default(PAID)
  // (later) tiers / per-product overrides
}
model CommissionEntry { /* ownerId, dealId/quoteId, baseCents, percent, amountCents, period, status */ }
```

Everything is **org-scoped** and indexed on the hot query paths. Route data is
**not** stored as new tables in Phase 1 — a route is computed on demand from tasks (see §4).

---

## 3. Feature areas

1. **Accounts & Contacts** — accounts are CUSTOMER-kind spaces; add Contacts + owner. Timeline of activities.
2. **Leads & pipeline** — Lead capture (manual + later web-form/portal), a Kanban by `LeadStatus`, **convert** Lead → Account (space) + Deal.
3. **Deals / Opportunities** — pipeline **Kanban board** (drag between stages, same UX as the task board), value + currency + probability + expected close, **weighted forecast** (Σ amount × stage.probability).
4. **Route planning & optimization** — the flagship field-sales feature. **See §4.**
5. **Quotes** — build with the existing invoice builder → send → on accept, mark deal Won and optionally create a Ledger invoice.
6. **Commissions** — rules per rep, auto-computed on Won/paid, commission report per rep/period.
7. **Activities & mobile** — log call/email/note/meeting/visit; **Visit reuses the Sales-Visit task type** (GPS + form). Timeline on lead/deal/account. Full mobile support.

---

## 4. Route planning & optimization (the standout)

**Scenario:** a rep has 4–5 visit tasks (each an address → lat/lng already geocoded via `/geo`). They tap **"Plan my day / Optimize route"** and get the best visit order, ETAs, a map, and one-tap handoff to Google Maps / Waze.

### Engine — reuse the OSRM we already run
- OSRM has a built-in **`/trip` service** that solves the **Traveling-Salesman problem** (farthest-insertion heuristic ≥10 stops, brute force <10). Since OSRM is **already self-hosted** for road-snapping, route optimization is **free — no new API cost, no new dependency.**
- Input: **start** (rep's current GPS or a home base) + the selected stops (+ optional **end** = return to base). Output in one call: **optimal order + total distance + total time + per-leg ETAs.**

### Smart handoff to navigation (get this right — most tools do it wrong)
- **Google Maps** supports a **multi-stop deep link** carrying *our* optimized order:
  `https://www.google.com/maps/dir/?api=1&origin=…&destination=…&waypoints=lat,lng|lat,lng|…`
- **Waze is single-destination only** (`https://waze.com/ul?ll=lat,lng&navigate=yes`) — no multi-stop. So for Waze/Apple Maps use the **stop-by-stop** pattern: "Navigate to next stop" → on arrival mark visited → surface the next. (This is exactly how Badger Maps behaves.)

### The clever part: optimize free, drive with live traffic
OSRM optimizes on free-flow speeds (no live traffic) — fine, because we optimize the **order** with OSRM (free), then the **actual driving** happens in Google/Waze with **their live traffic**. Best of both, zero optimization cost.

### Phasing for routes
- **P1:** pure TSP via OSRM `/trip` — ordered stops + ETAs on the map + Google/Waze buttons; live progress via the existing GPS/route tracking; auto-advance stops.
- **P2:** **time windows / appointments** — lock fixed-time visits, or use **VROOM** (open-source, runs on top of OSRM) for time-windowed + per-visit duration + max-stops constraints.
- **P3 (optional):** traffic-aware *ordering* via Google Routes API `optimize_waypoint_order` (paid) for reps who want it; "lasso nearby customers on the map" to add to today's route; saved/named daily routes.

### Backend shape
- `POST /routes/optimize` → `{ start, stops[], end? }` → OSRM `/trip` → `{ order[], legs[], totalMeters, totalSeconds, geometry }` (reuse the existing OSRM client + geo). No new infra, no stored tables in P1.
- Web + mobile: an "Optimize route" action on the day's visit tasks → ordered map + deep-link buttons.

---

## 5. Roles, access & gating
- New **`crm` module** in the Access Profile: CRM tabs (Leads, Deals, Route) show only for members with it (sales + admin/managers).
- **Visibility**: reps see their own leads/deals/routes; managers/admins see the team (org-scoped queries + owner filter). Configurable per member role.
- **Billing**: a new `crm` capability, tier-gated (e.g. Pro+); route optimization can be part of it. Wire into `tierAllows()` + `PlanGuard`.

## 6. Cross-cutting
- **Realtime**: reuse the socket sync — emit `crm.changed` (deal moved, lead converted) → invalidate the CRM query keys, same pattern as `attendance.changed`.
- **Audit**: write per-change rows to `activity_logs` (`resourceType: 'deal'|'lead'`), reuse the edit-history dialog pattern for a deal/lead history.
- **Reports**: pipeline value, win rate, activities per rep, commission payouts — via the existing reports/analytics engine.

---

## 7. Suggested build order
1. **Accounts + Contacts + Activities** (mostly reuse) — fastest value.
2. **Leads + pipeline Kanban** + convert.
3. **Deals/Opportunities + weighted forecast.**
4. **Route planning & optimization (P1)** — OSRM `/trip` + Google/Waze handoff.
5. **Quotes → Ledger invoice.**
6. **Commissions + reports.**
7. Route P2 (time windows / VROOM), CRM realtime + audit polish.

## 8. Deploy notes
- Additive Prisma migration (new tables/enums; hand-authored idempotent — shadow DB is broken). No backfill.
- New task-service (CRM logic + `/routes/optimize`) + gateway endpoints + web + mobile. OSRM already deployed. Follow the standard git-bundle → build → `up -d` flow with a rollback tag.
- Mobile ships via **OTA** (preview-first).

## 9. Open decisions (please confirm — these shape everything)
- **Field sales vs inside sales** — is the primary need *visiting* customers (route planning, strong fit) or a *pipeline/deal desk* (more net-new UI)? Or both?
- **Commission model** — flat %, tiered, per-product; on **booking** vs on **paid**?
- **Quotes → Invoices** — should a won quote auto-create a Ledger invoice?
- **Multi-currency / multi-pipeline** needed at launch?
- **Route defaults** — start/end at a home base or current GPS? Max stops/day? Default nav app (Google/Waze/Apple)?
- **Web forms / portal leads** — capture inbound leads from the public site / client portal?

---

## Sources (route optimization research)
- Badger Maps — [Sales route optimization](https://www.badgermapping.com/blog/sales-route-optimization/), [multi-stop planner](https://www.badgermapping.com/blog/multi-stop-route-planner/)
- Route4Me — [multi-stop route planner app](https://support.route4me.com/plan-new-route-mobile-route-planner-app/)
- OSRM — [the Trip service (TSP solver)](https://medium.com/@imadsaddik/6-osrm-course-the-trip-service-bae381605cbf)
- Google — [Routes API: optimize the order of stops](https://developers.google.com/maps/documentation/routes/opt-way)
- Waze — [Deep Links (single-destination)](https://developers.google.com/waze/deeplinks)
