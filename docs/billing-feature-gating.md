# HBCField — Per-Tier Feature Gating (reference)

> Companion to `billing-plan.md` (product/pricing) and `billing-architecture.md`
> (Stripe flows). This doc is the definitive reference for **how a subscription
> tier is turned into enforced feature access** across backend, web and mobile.
>
> Status: built on `feat/billing` / merged to `main`. **Not deployed** — waiting on
> a Stripe account + live test + the go-live backfill (see §8).
> Last updated: 2026-07-11 (after the deep security audit).

---

## 1. Two module systems (do not confuse them)

| System | Stored on | Type | Purpose | Checked by |
|---|---|---|---|---|
| **Access modules** | `User.enabledModules` (per-user Access Profile) | `tasks / clock / time_off / create_task / manage` + `platforms/spaceScope/webScreens` | *Which UI a specific user sees* (mobile tabs, web screens, platform) | `hasModule()` / `getAccessPlatforms()` |
| **Feature modules** | `Organization.enabledModules` (carried on token as `orgModules`) | the 12 `AVAILABLE_MODULES` keys | *Which task features the org's plan includes* | `hasFeatureModule()` / `@RequireModule` |
| **Capabilities** | *nothing* — derived from `planTier` | `recurring / overtime / invoicing / workflows / audit_log / multi_org` | Premium features that are **not** task-modules | `tierAllows()` / `@RequirePlan` |

`Organization.enabledModules` is written **only** by registration and billing
(full-replace with `modulesForTier(tier)`); it is **not** admin-editable at the org
level (space + per-user profiles are separate). So there is no clobber risk.

---

## 2. Final tier map

Source of truth: `packages/shared/src/billing/plans.ts`.

| | Starter €29 | Professional €59 | Business €99 | Enterprise €199+ |
|---|---|---|---|---|
| **Feature modules** | subtasks, checklists, attachments, tracking, time_tracking, **service_reports** | *+ Starter* custom_fields, dependencies | *+ Pro* sprints, story_points, epics, phases | everything |
| **Capabilities** | — | recurring, overtime, invoicing | *+ Pro* workflows, audit_log, multi_org | everything |
| **Seats** | office €29 / field €19 | office €59 / field €19 | office €99 / field €19 | custom |

- Tiers are **cumulative**. `service_reports` is **core (Starter)** — the field-service
  completion flow (photos/signatures) works on every tier.
- **Trial = Professional** (`startTrial` sets `planTier='PROFESSIONAL'`, 14 days, no card).
- Enterprise → `tierAllows()` returns `true` for everything (bespoke per contract).

---

## 3. The entitlement ceiling — `tierAllows()`

```ts
tierAllows(planTier, key)  // → boolean. O(1) static-table check, no DB, no Stripe.
```

Checks `modules ∪ capabilities` for the tier. This is the **single gate** used by the
backend guards and the web/mobile UI, so pricing, enforcement and marketing can never
drift. Helpers: `entitlementsForTier(tier)`, `minTierForFeature(key)`, `modulesForTier(tier)`.

`planTier` is **server-authoritative** — set only from the `Organization` row during
`login` / `refresh` / `validateToken` (lowercased), never trusted from the client.

---

## 4. End-to-end: how a tier becomes enforced access

```
Checkout (hosted Stripe)                Webhook (verified)                     Every request
──────────────────────────────         ───────────────────────────────       ─────────────────────────
createCheckout(tier)                    checkout.session.completed  ┐          JwtAuthGuard → validate_token
  builds line items @ tier price   →    customer.subscription.*     ├─ sync →    reads org.planTier/subStatus/
  (server-resolved price IDs)           invoice.paid / .payment_failed          orgModules → caches on token
                                             │                                        │
                                             ▼                                        ▼
                                    resolveTierInterval(sub)               SubscriptionGuard (lock if inactive)
                                    ↳ reverse-maps the sub's Stripe        PlanGuard      (@RequirePlan → 402)
                                      PRICE IDs → the REAL {tier,interval}  ModuleGuard    (@RequireModule → 403)
                                             │                                  (both skip GET/HEAD/OPTIONS)
                                             ▼
                                    writes org.planTier + subscription +
                                    billingInterval + enabledModules
```

**Why `resolveTierInterval` matters (audit C1):** the purchased tier is derived from the
subscription's actual Stripe price IDs — *not* from a denormalized field — so payment and
entitlement can never diverge (a Starter buyer can't inherit the trial's Professional tier).

---

## 5. The guard chain (gateway, global `APP_GUARD` order)

```
ThrottlerGuard → JwtAuthGuard → RolesGuard → OnboardingCompleteGuard
   → PermissionsGuard → SubscriptionGuard → PlanGuard → ModuleGuard
```

| Guard | Enforces | Response | Reads pass? |
|---|---|---|---|
| **SubscriptionGuard** | read-only lock when `isLocked(subStatus)` (incomplete/canceled) | **402** (allows `/billing`, `/auth`) | yes (past_due keeps access = dunning grace) |
| **PlanGuard** | `@RequirePlan(key)` via `tierAllows(planTier,key)` | **402** + `requiredTier` | **yes** (GET/HEAD/OPTIONS) |
| **ModuleGuard** | `@RequireModule(key)` via `hasFeatureModule` | **403** | **yes** (GET/HEAD/OPTIONS) |

All three are **O(1)** — they read only token fields + route metadata, never the DB.
"Reads pass" = a downgrade never hard-breaks *viewing* existing data; only mutations are gated.

### Decorators
- `@RequirePlan('recurring')` — capabilities **and** modules (tierAllows covers both). Applied to: recurring-tasks, overtime, workflows, custom-fields (×2 controllers), invoices, task dependency POST/DELETE.
- `@RequireModule('sprints')` — feature modules via `orgModules`. Applied class-level to: sprints, epics, phases (gates every mutation, not just create).

---

## 6. Web & mobile

**Web** (`apps/web-app`):
- `useAuth().hasPlanFeature(key)` = `tierAllows(user.planTier, key)`; `hasModule(key)` for feature modules.
- `<PlanGate feature=...>` wraps premium pages (recurring, overtime, invoices, workflows, audit-log) → upgrade panel (admins get an Upgrade link; members are told to ask an admin).
- Nav/entry points hidden under-tier: Settings tabs (workflows/audit-log), Invoices menu item, recurring toggle + recurring-view button.
- Pricing cards (billing + choose-plan) render from the same `plans.ts` via `tierDelta()` → marketing == enforcement.

**Mobile** (`apps/mobile`, technician-only):
- `SubscriptionGate` calls `GET /billing/subscription` once per session, locks the app when `isLocked` (**fails open** on network error). No purchase UI (Apple/Google IAP rules).
- Deliberately **plan-agnostic** — carries no `planTier`. Tier features are enforced elsewhere: service_reports is core; custom-fields card auto-hides with no defs; **overtime is gated server-side at generation** (`attendance.service.autoClockOut` only starts the overtime flow for overtime-entitled orgs — others auto-clock-out normally), so it never reaches a Starter device.

---

## 7. Security model (what's enforced where) + audit (2026-07-11)

Enforcement is **server-side**; UI gating is UX only. Deep audit (4 parallel adversarial
agents + self-verification) found & fixed:

| Sev | Finding | Fix |
|---|---|---|
| **CRITICAL** | Purchased tier never persisted; webhook read stale `org.planTier` → Starter buyer kept Professional | `resolveTierInterval()` reverse-maps Stripe price IDs; webhook writes the real tier |
| **CRITICAL** | `register()` w/ companyName set `planTier=null`, no trial → all premium 402'd for web signups | inject `BillingService`, call `startTrial()` after register txn |
| HIGH | Invoices controller ungated | class-level `@RequirePlan('invoicing')` |
| HIGH/MED | sprints/epics/phases: only create gated | `ModuleGuard` global + reads-pass + class-level `@RequireModule` |
| MED | Web recurring toggle/button role-only | `&& hasPlanFeature('recurring')` |

**Verified secure:** billing mutations ADMIN-only; no billing IDOR (org from token, never client);
`planTier`/`subStatus` server-authoritative; webhook HMAC + raw-body + idempotency (`BillingEvent.stripeEventId @unique`);
no Stripe secret leakage (env-only, never logged/returned); mobile has no purchase surface and fails open.

**Known LOW / deferred (not launch-blockers):**
- **Auth-token cache lag (`AUTH_CACHE_TTL`, default 60s):** billing changes aren't pushed to the gateway's per-token cache → an upgrade/lock reflects within ≤60s (bounded, self-healing). Improve with org-indexed invalidation or a lower TTL before scale.
- **reconcileSeats debounce is per-process** — fine on one auth-service instance; needs a Redis lock before multiple replicas.
- **Trial farming** — one identity can create many orgs, each a trial; add a per-identity cap.
- **audit_log** readable via direct GET on any tier (reads-pass by design; UI hides it).
- **story_points** settable via task PATCH (no dedicated route; UI-gated).

---

## 8. Go-live checklist (do in order; nothing before this is done)

1. **Create the Stripe account** + Products/Prices (office × {starter,professional,business} × {monthly,annual} + field × {monthly,annual}). Copy the Price IDs.
2. **Set env** on auth-service (+ gateway for the webhook secret):
   ```
   STRIPE_SECRET_KEY=sk_live_…
   STRIPE_WEBHOOK_SECRET=whsec_…
   STRIPE_PRICE_STARTER_OFFICE_MONTHLY=price_…    STRIPE_PRICE_STARTER_OFFICE_ANNUAL=price_…
   STRIPE_PRICE_PRO_OFFICE_MONTHLY=price_…        STRIPE_PRICE_PRO_OFFICE_ANNUAL=price_…
   STRIPE_PRICE_BUSINESS_OFFICE_MONTHLY=price_…   STRIPE_PRICE_BUSINESS_OFFICE_ANNUAL=price_…
   STRIPE_PRICE_FIELD_MONTHLY=price_…             STRIPE_PRICE_FIELD_ANNUAL=price_…
   ```
   Point the Stripe webhook at `POST /api/v1/billing/webhooks/stripe` (events: `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_failed`).
3. **Backfill existing orgs** so no org is left `planTier=null` (would 402 all premium — the C1b dead state). Run once on the prod DB:
   ```sql
   -- Grandfather every existing org onto Professional (adjust per real plan if known).
   UPDATE organizations
     SET "planTier"        = COALESCE("planTier", 'PROFESSIONAL'),
         "subStatus"       = COALESCE("subStatus", 'ACTIVE'),
         "billingInterval" = COALESCE("billingInterval", 'MONTHLY')
     WHERE "planTier" IS NULL;
   -- Re-derive the org feature-module set from the (now non-null) tier so gating matches.
   -- (Only needed if any org's enabledModules predates the current tier map.)
   ```
   Note: after C1b, *new* signups self-provision via `startTrial`; the backfill is only for orgs created before this build.
4. **Live test-card run** (Stripe test mode first): register → trial shows Professional → checkout **Starter** → confirm the org drops to **Starter** entitlements (recurring/overtime/invoicing now 402) and pays €29 → add a member (seat proration) → remove (credit) → cancel (read-only lock) → re-subscribe (unlock). Repeat one **annual** cycle (increase = charge now; decrease = banked credit).
5. **Deploy** changed services (gateway, auth-service, task-service, web) per the standard flow. Mobile is JS-only here → OTA-able, but nothing mobile changed this round.

---

## 9. Key files

| Concern | File |
|---|---|
| Tiers / prices / `tierAllows` | `packages/shared/src/billing/plans.ts` |
| Seat classification | `packages/shared/src/billing/seats.ts` |
| Stripe wrapper + `resolveTierInterval` | `apps/api/auth-service/src/modules/billing/stripe.service.ts` |
| Trial / checkout / webhook / reconcile | `apps/api/auth-service/src/modules/billing/billing.service.ts` |
| Guards | `apps/api/gateway/src/common/guards/{plan,module,subscription}.guard.ts` |
| Decorators | `apps/api/gateway/src/common/decorators/{require-plan,require-module}.decorator.ts` |
| Overtime generation gate | `apps/api/task-service/src/modules/attendance/attendance.service.ts` |
| Web gating | `apps/web-app/src/contexts/auth-context.tsx`, `components/plan-gate.tsx`, `lib/plan-features.ts` |
| Mobile lock | `apps/mobile/src/components/SubscriptionGate.tsx`, `lib/api/billing.ts` |
