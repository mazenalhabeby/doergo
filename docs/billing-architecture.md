# HBCField — Billing System: Complete Build Plan (flows · security · performance)

> Companion to `docs/billing-plan.md` (product decisions). This is the technical
> spec we build against. Branch `feat/billing`. Nothing deploys until Stripe keys
> exist and we test end-to-end.

## 0. Principles

- **Stripe is the source of truth for money/state.** Our DB mirrors it via webhooks; the client never sets paid state.
- **We never touch card data.** Stripe Checkout/Portal (hosted) → PCI scope SAQ-A. No card fields anywhere in our apps.
- **Server derives everything sensitive.** Price IDs, amounts, seat counts, tier — all computed server-side from enums + DB; the client only sends *intent* (tier, interval).
- **Fast path never hits Stripe or extra DB.** Per-request guard checks read the cached user (JWT/Redis), not the DB or Stripe.

---

## 1. End-to-end flows

### 1.1 Signup → Trial (no card)
```
register (ADMIN) → create-org → Subscription{status:TRIALING, planTier:PROFESSIONAL,
   trialEndsAt:+14d}, Organization.subStatus=TRIALING, enabledModules = modulesForTier(PRO)
   (best trial experience = top self-serve tier for 14d)
→ Stripe Customer created lazily (no card) so we have an id ready
→ onboarding "Choose plan" is optional during trial; full access meanwhile
```

### 1.2 Choose plan → Checkout → Active
```
admin picks {tier, interval} → gateway POST /billing/checkout
→ auth-service: resolve Stripe price IDs from env (STRIPE_PRICE_ENV_KEYS[tier]),
   build line items [office × officeSeats, field × fieldSeats] from LIVE seat counts,
   create Checkout Session (mode=subscription, customer=stripeCustomerId,
   allow_promotion_codes, automatic_tax, idempotencyKey)
→ redirect to Stripe → user pays
→ webhook checkout.session.completed + customer.subscription.created
→ mark Subscription ACTIVE, store stripeSubscriptionId, currentPeriodEnd,
   set enabledModules = modulesForTier(tier), invalidate auth cache for org users
```

### 1.3 Seat change (add member / grant-revoke web access / deactivate)
```
member mutation in auth-service → enqueue RECONCILE_SEATS{orgId} (debounced/deduped by orgId)
→ worker: countSeats(activeMembers) → if changed, Stripe subscriptions.update items
   [office qty, field qty] with proration_behavior=create_prorations, idempotencyKey
→ webhook customer.subscription.updated → persist officeSeats/fieldSeats + period
```
Rapid successive changes coalesce into ONE Stripe update (debounce) → no API hammering.

### 1.4 Change tier (upgrade/downgrade)
```
POST /billing/change-plan {tier, interval} → Stripe update subscription prices (proration)
→ webhook → set planTier + enabledModules=modulesForTier(tier). Downgrade strips modules
   above the new tier at period end (or immediately, per decision).
```

### 1.5 Dunning (payment fails)
```
invoice.payment_failed → subStatus=PAST_DUE, email admin (notification-service),
   Stripe Smart Retries run for N days (grace) → invoice.paid → ACTIVE
   OR retries exhausted → subscription.status=unpaid → LOCK (read-only)
```

### 1.6 Trial end
```
customer.subscription.trial_will_end (3d before) → reminder email
trial ends with no card → INCOMPLETE → LOCK (read-only, data preserved)
```

### 1.7 Cancel
```
Customer Portal / POST /billing/cancel → cancelAtPeriodEnd=true (keep access to period end)
→ at period end customer.subscription.deleted → CANCELED → LOCK
```

### 1.8 Enterprise
```
"Contact sales" (from €199/custom) → lead to office@hbcfield.com → manual Stripe
subscription or send-invoice → set planTier=ENTERPRISE, status=ACTIVE, custom seats.
No self-serve checkout for enterprise.
```

---

## 2. Security architecture

| Threat | Control |
|--------|---------|
| Card data breach / PCI | Never handle cards — Stripe Checkout/Portal only. Publishable key client-side; **secret key server-only, never logged**. |
| Forged/replayed webhooks | Verify `stripe-signature` HMAC on the **raw body** (Stripe SDK, timing-safe). Reject unsigned. **Idempotency** via `BillingEvent.stripeEventId @unique` — dedupe replays. Only `@Public() POST /billing/webhooks/stripe`. |
| Price/amount tampering | Client sends only `{tier, interval}` enums. Server resolves Stripe **Price IDs from env**; amounts/line-items computed server-side. Client-supplied prices are ignored. |
| Seat-count tampering | Seats always computed server-side via `countSeats(DB members)`. Client never sends counts. |
| Cross-org access (IDOR) | Every billing op scoped to `user.organizationId`; never accept an orgId from the client. |
| Privilege escalation | Billing mutations require **ADMIN** (`@Roles(ADMIN)`) + org-owner check. Members can at most view status. |
| Double-charge on retries | **Idempotency keys** on all Stripe write calls (checkout, subscription update). |
| State spoofing | Paid/active state set **only** by verified webhooks, never by client responses. Reconcile job catches Stripe↔DB drift. |
| Internal RPC exposure | Billing `@MessagePattern`s are Redis-internal (gateway→auth-service), never public HTTP. |
| Secrets management | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, price IDs in per-service `.env` (gitignored). Restricted key scope if feasible. Redacted from logs (extend existing audit redaction). |
| Trial abuse | One trial per org; flag duplicate signups (same email/domain) for review. |
| Read-only lock bypass | Enforced in **`SubscriptionGuard` server-side**, not just hidden UI. Applies to all write routes. |
| PII / GDPR | `billingEmail`, `vatId` minimal; card/PII live in Stripe (DPA in place). Purge on org deletion; include in data-export/erasure. |
| Rate abuse | Throttle checkout/portal creation (existing `@Throttle`); webhook route tuned to allow Stripe retries. |
| Audit | `BillingEvent` (raw) + `ActivityLog` (plan change, cancel, seat change) for traceability. |

---

## 3. Performance architecture

1. **Zero-DB fast path for the guard.** `subStatus`, `planTier`, `orgModules` are already carried on the JWT-enriched, Redis-cached user object (see `auth.service` login/refresh + JwtAuthGuard cache). `SubscriptionGuard` reads these from the cached `user` — **no extra DB/Stripe call per request**.
2. **Cache invalidation on change.** Webhook/seat/tier changes → invalidate the org's auth cache (reuse the existing invalidation used for join-approval so `orgModules`/`subStatus` refresh within the 60s focus-refresh window, or immediately for the acting admin).
3. **Async webhooks.** Gateway verifies signature, persists `BillingEvent`, **enqueues** to `QUEUE_NAMES.BILLING`, returns **200 fast** (Stripe requires a quick 2xx). Worker does the heavy DB/Stripe work → no webhook timeouts.
4. **Debounced seat reconcile.** Member mutations enqueue `RECONCILE_SEATS` keyed by `orgId` with a short debounce; rapid edits coalesce into **one** Stripe `subscriptions.update`. BullMQ `jobId=orgId` + `delay` dedupes.
5. **Minimize Stripe calls.** Persist `stripeCustomerId`/`stripeSubscriptionId`; sync via webhooks not polling; plan/price config lives in `@hbcfield/shared` (no DB/Stripe roundtrip to price a plan or render the table).
6. **Indexes** on `subscriptions.status`, `billing_events(stripeEventId, orgId+createdAt)` (in migration).
7. **Nightly full reconcile** (low-priority cron job) as a backstop for missed webhooks — not on the request path.
8. **Idempotent, retried jobs** via BullMQ (exponential backoff) — already standard in the stack.

---

## 4. Components & files (build order)

**Shared (`packages/shared`)** — done: `billing/plans.ts`, `billing/seats.ts`. To add:
- `queues/constants.ts`: `QUEUE_NAMES.BILLING`, `BILLING_JOB_TYPES` (RECONCILE_SEATS, PROCESS_WEBHOOK, NIGHTLY_RECONCILE, DUNNING_NOTIFY).
- `types/billing.ts`: API DTO/response shapes (`SubscriptionView`, `CheckoutRequest`, `ChangePlanRequest`), `SubStatus` string union, `isBillingActive()`/`isLocked()` helpers.

**auth-service (`apps/api/auth-service/src/modules/billing`)**
- `stripe/stripe.service.ts` — Stripe SDK wrapper (customer, checkout session, portal session, subscription update/cancel, webhook `constructEvent`), reads env price IDs.
- `billing.service.ts` — start-trial, ensure-customer, create-checkout, get-subscription, change-plan, cancel, reconcile-seats, apply-webhook (idempotent via BillingEvent).
- `billing.controller.ts` — `@MessagePattern({cmd:'billing_*'})`.
- `billing.module.ts`; wire into `app.module.ts`; hook member mutations → enqueue reconcile.

**gateway (`apps/api/gateway/src/modules/billing`)**
- `billing.controller.ts` — `POST /billing/checkout`, `GET /billing/subscription`, `POST /billing/portal`, `POST /billing/change-plan`, `POST /billing/cancel` (ADMIN); `@Public() POST /billing/webhooks/stripe` (raw-body verify → enqueue → 200).
- `billing.service.ts` (RPC proxy), DTOs, `billing.queue.service.ts` (BILLING queue), `common/guards/subscription.guard.ts` (read-only lock, global after PermissionsGuard).

**web (`apps/web-app`)**
- `lib/api.ts` → `billingApi`.
- `/settings/billing` tab (plan, status, office/field counts + live total from `subscriptionTotalCents`, monthly/annual toggle, upgrade/downgrade, Manage payment/invoices → Portal, cancel).
- Onboarding "Choose plan" step; dashboard **trial/past-due banner**; feature-lock CTA; sidebar/nav "Billing" (ADMIN).

**mobile (`apps/mobile`)** — read `subStatus` from `/auth/me`; gate features; **no purchase UI**; "billing managed by your admin on the web" notice when locked.

---

## 5. Env (per service `.env`, gitignored)
```
STRIPE_SECRET_KEY=sk_...            # auth-service (+ gateway for webhook verify)
STRIPE_WEBHOOK_SECRET=whsec_...     # gateway
STRIPE_PUBLISHABLE_KEY=pk_...       # web (NEXT_PUBLIC_)
STRIPE_PRICE_STARTER_OFFICE_MONTHLY=price_...
STRIPE_PRICE_STARTER_OFFICE_ANNUAL=price_...
STRIPE_PRICE_PRO_OFFICE_MONTHLY=... / _ANNUAL=...
STRIPE_PRICE_BUSINESS_OFFICE_MONTHLY=... / _ANNUAL=...
STRIPE_PRICE_FIELD_MONTHLY=... / _ANNUAL=...
BILLING_TRIAL_DAYS=14
BILLING_DUNNING_GRACE_DAYS=7
```

## 6. Deploy-time notes
- Migration is additive; **backfill existing prod orgs → subStatus=ACTIVE (grandfather)** so nobody is locked.
- Make the prod migration idempotent (`IF NOT EXISTS`) per the repo's drift history.
- Stripe: switch test→live keys; register the live webhook endpoint; verify webhook secret.
- Mobile release only after the read-only status gating (no purchase UI) is in.

## 7. Progress
- [x] Shared plans + seats (`bff3878`), schema + migration (`fa515bb`)
- [ ] Shared queue/types  ← next
- [ ] auth-service BillingModule + Stripe wrapper
- [ ] gateway BillingModule + webhook + SubscriptionGuard
- [ ] Seat auto-sync hooks
- [ ] Web billing page + onboarding step + banner
- [ ] Mobile status gating
- [ ] Stripe account/products (YOU) → end-to-end test → deploy
