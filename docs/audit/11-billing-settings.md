# Area 11 — Billing & Settings

Routes: `/settings`, `/settings/billing`, `/settings/audit-log`, `/billing/*`,
plus the secret-gated operator routes.

Status: **All six passes run. 1 finding fixed.** 0 Critical, 0 High, 1 Medium.

---

## Findings

| ID | Sev | Pass | Title | Status |
|----|-----|------|-------|--------|
| B-B1 | M | B / E | The operator secret was compared three different ways, two of them not constant-time | **fixed** |

### B-B1 — one secret, three implementations

`PLATFORM_ADMIN_KEY` is the credential for the most powerful routes in the product. It is
checked in three places:

| Where | How | Guards |
|---|---|---|
| `PlatformAdminGuard` | SHA-256 both sides → `timingSafeEqual` | the `/platform/*` operator console |
| `billing.controller` | inline `provided !== expected` | **list every organization**, **grant an org every paid capability** |
| `support.controller` | inline `provided !== expected` | **read any support thread, including internal notes** |

The correct implementation existed, was documented, and explained itself — "hash both to a
fixed length before comparing so neither the length nor the byte-by-byte match time reveals
anything about the secret". The two copies that skipped it were the ones on the routes that
matter most.

A byte-by-byte comparison over HTTP is a hardening concern rather than a practical break —
network jitter buries the signal. What makes it worth fixing is not the timing channel; it is
that **the same check existed three times and the two copies drifted to the weaker form**.

**Fixed** by extracting `assertKey(req)` from the guard so it is callable mid-handler, and
pointing both controllers at it. **Fixed durably** by a test that walks every controller and
fails if any of them reads `PLATFORM_ADMIN_KEY` at all — a fourth copy cannot appear.

All three still fail closed when the key is unconfigured; the test asserts that too.

---

## Verified good (checked, no finding)

- **Every billing mutation is `@Roles(Role.ADMIN)`** — add-ons, checkout, portal, cancel.
- **The operator routes are `@Public()` deliberately**, so the JWT guard is skipped and the
  secret header is the only credential — the guard's own comment says this is the intended
  pairing. Both are additionally throttled (30/min and 10/min).
- **`organizationId` is never taken from a billing request body**; the Stripe webhook is
  signature-verified with a raw body and idempotency.
- The billing read routes (`subscription`, `bill`) are open to any org member — visible to
  employees, not just admins. Recorded rather than filed: it is a defensible product choice.

## Verdict

**PASS WITH FIXES.**
