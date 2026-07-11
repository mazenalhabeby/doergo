# HBCField — Billing & Subscriptions Plan

> Status: **built, not deployed** (on `main` behind Stripe keys). Nothing deployed.
> Last updated: 2026-07-11.
>
> **See also:** `billing-architecture.md` (Stripe flows) · `billing-feature-gating.md`
> (how a tier becomes enforced access — guards, tier map, security audit, go-live + backfill).

## Pricing model (matches the marketing site)

| Line | Price | Who |
|------|-------|-----|
| Office seat | **€29 / €59 / €99** per seat/mo (by tier) | ADMIN + any member with **web access** |
| Field seat | **€19** flat per technician/mo | member with **mobile-only** access |
| Enterprise | from **€199/mo** or custom | large / bespoke |

- Annual billing = **2 months free** (monthly × 10 / yr).
- **14-day trial, no card.**

## Roles & the "dynamic member" (the control mechanism)

Product has **2 roles: ADMIN + MEMBER**. A MEMBER is dynamic — capabilities come from
a per-user **Access Profile** (`User.enabledModules`), not a fixed role (there is **no
dispatcher role**). So seat type is derived from **access, not role**:

- `classifySeat(user)` → `office` if ADMIN or web-reachable (`getAccessPlatforms ∈ {web, both}`), else `field` (mobile-only).
- Org billed quantities = `countSeats(members)` → `{ office, field }`.
- When a member's Access Profile changes (web access granted/revoked) their seat type
  flips → **re-count + re-sync Stripe quantities (proration)** on every member
  create / access-profile update / deactivate, plus a nightly reconcile job.

Implemented in `packages/shared/src/billing/` (`plans.ts`, `seats.ts`) — the single
source of truth for tiers, prices, per-tier feature modules and seat classification,
used by web + mobile + backend.

## Two enforcement layers

1. **Feature gating (org-wide, by tier):** `modulesForTier(tier)` → set
   `Organization.enabledModules` → existing `@RequireModule` / `hasModule` enforce it in
   API, web, mobile. Downgrade removes modules above the tier.
2. **Seat/billing gating:** new `SubscriptionGuard` (after `PermissionsGuard`) blocks
   writes when `subStatus ∈ {PAST_DUE past grace, CANCELED}`. Seat counts auto-sync to
   Stripe (proration), not hard-blocked.

## Provider: Stripe

- Checkout (hosted — we never touch card data) + Customer Portal + Stripe Tax (EU VAT,
  reverse charge) + SEPA + card + send-invoice (Enterprise).
- Subscription carries **2 line items**: office price (by tier) × officeSeats, field
  price (€19) × fieldSeats.
- Price IDs live in backend env (`STRIPE_PRICE_ENV_KEYS` maps them); shared stays env-agnostic.

## Data model (new — auth-service schema, where Organization lives)

- `Organization +=` stripeCustomerId, planTier, subStatus, billingInterval, trialEndsAt,
  currentPeriodEnd, cancelAtPeriodEnd, vatId, billingEmail.
- `Subscription { orgId, stripeSubscriptionId, planTier, status, interval, officeSeats,
  fieldSeats, currentPeriodStart/End, trialEndsAt, canceledAt }`.
- `BillingEvent { orgId, type, stripeEventId(unique), payload }` — webhook idempotency/audit.
- Keep existing `Invoice` (customer invoicing) separate.

## Backend architecture

- **auth-service `BillingModule`**: owns state + Stripe SDK; `@MessagePattern({cmd:'billing_*'})`
  for checkout-session, portal-session, get-subscription, change-plan, cancel,
  webhook-process, reconcile-seats.
- **gateway `BillingModule`**: `POST /billing/checkout`, `GET /billing/subscription`,
  `POST /billing/portal`, `POST /billing/change-plan`, `POST /billing/cancel`, and
  `@Public() POST /billing/webhooks/stripe` (verify signature on the raw body already
  enabled in `gateway/main.ts`).
- **Seat sync**: hook user-create / access-profile-update / deactivate → enqueue
  `RECONCILE_SEATS` on `QUEUE_NAMES.BILLING` (reuse `BaseQueueService`) → update Stripe qty.

## Web UI

- Onboarding: **"Choose plan"** step after create-org → start trial (no card) or Checkout.
- **`/settings/billing`** (ADMIN): current plan/status, office/field seat counts + live
  monthly total, interval toggle, upgrade/downgrade, Manage payment/invoices (Customer
  Portal), cancel; trial countdown banner in dashboard layout.
- Feature-lock UX with "Upgrade" CTA; new `billingApi` following `organizationsApi`.
- Enterprise: "Contact sales" → office@hbcfield.com + manual setup.

## Mobile — app-store rule

B2B SaaS billed to the org via web → **IAP-exempt** (like Slack/Asana), **but the mobile
app must contain NO purchase UI/prices** (Apple/Google) or it gets rejected. Mobile only
**reads subscription status** to gate features + shows "billing managed on the web".

## Compliance

EU/AT VAT via Stripe Tax + VAT-ID (reverse charge), compliant invoice numbering/retention,
GDPR (billing email/VAT are personal data). Currency EUR.

## Build order (each phase shippable)

1. **Charge money (MVP):** schema + Stripe products + trial + Checkout + webhook + status
   field + `SubscriptionGuard`.  ← *lets you actually bill.*
2. **Self-serve billing:** `/settings/billing` + Customer Portal + `billingApi` + trial banner.
3. **Seats + tier gating:** `classifySeat`/reconcile job/Stripe qty sync + `modulesForTier`
   → `enabledModules` + feature-lock UX.
4. **Onboarding plan step + dunning + annual + proration polish.**
5. **Enterprise / SEPA-invoice / VAT + mobile status gating.**

## Open decisions

1. Seat model: office = ADMIN + members with web; field = mobile-only. Field flat €19 (not tiered). — confirm
2. Over-seat: auto-add w/ proration (recommended) vs hard-block. — confirm
3. Payment methods at launch: card only vs card + SEPA + send-invoice. — confirm
4. Annual billing at launch or later. — confirm
5. Trial end w/o card: lock read-only vs free tier. — confirm

## Stripe setup YOU must do (blocks backend wiring)

1. Create/confirm a **Stripe account** (EUR, business/tax details, EU VAT via Stripe Tax).
2. Create **Products + Prices**: Starter/Pro/Business office (monthly+annual) + Field
   (monthly+annual). Enterprise handled manually.
3. Provide the **secret key**, **publishable key**, **webhook signing secret**, and the
   **Price IDs** → I wire them into env (`STRIPE_PRICE_ENV_KEYS`). I never handle live card data.
4. For local dev: `stripe listen --forward-to localhost:4000/api/v1/billing/webhooks/stripe`.

## Progress

- [x] Shared foundation: `packages/shared/src/billing/{plans,seats}.ts` (tiers, prices,
      `classifySeat`, `countSeats`, tier→modules, totals). Builds clean.
- [ ] Prisma schema + migration
- [ ] auth-service BillingModule + Stripe SDK
- [ ] gateway BillingModule + webhook
- [ ] Web billing page + onboarding step
- [ ] Mobile status gating
