# Areas 12 & 13 — Dashboard / Team, and Public / Auth

Routes: `/dashboard`, `/team`, `/issues`; `/`, `/pricing`, `/blog`, `/help`, `/industries`,
`(auth)/*`, `/onboarding/*`, and every `@Public()` endpoint in the gateway.

Status: **All six passes run. No findings.** Both areas pass.

---

## Area 12 — Dashboard & Team

**What it is:** the dashboard aggregates everything the other twelve areas own — task counts,
presence, attendance, approvals, pending actions — into one screen. `/team` is a thin roster.

**No findings.** This is the area the rest of the audit kept citing as the good example:

- `dashboard/page.tsx` is **16 lines**, with the data layer in `_lib/use-dashboard-data.ts` —
  the pattern I extracted the member-detail page into (MD-E2) already existed here.
- It is already `dynamic()`-split, unlike every other heavy page found in Areas 03–07.
- It subscribes through `useRealtimeSync`, so the invalidation fixes from Areas 01–07 land on
  it without further work; `presence-directory.spec.ts` covers the roster logic.
- `/team` is 65 lines over one query key.

Its correctness now depends on the phantom-key guard added in Area 06 — the dashboard reads
`["orgMembers","dashboard"]`, `["attendance-active"]`, `["locationAttendanceBatch"]` and
`["pending-approvals"]`, all of which the test now proves are real.

---

## Area 13 — Public & Auth

**What it is:** everything reachable without a session — marketing pages, the pricing page and
its calculator, blog and help, plus the auth endpoints and the onboarding flow.

**No findings.** The unauthenticated surface is the smallest and most deliberately built part
of the product:

- **Every public auth route is individually throttled**, tighter than the global tiers:
  register 5/min, login 5/min, **forgot-password 3/min**, reset-password 5/min,
  change-password 5/min.
- **`/auth/refresh` is the one public route left at the default limit, and that is correct.**
  Tightening it would break the documented concurrent-refresh design — a 60-second grace
  period and atomic token claiming exist precisely so several tabs can refresh at once. A
  refresh token is a 128-bit random value looked up by SHA-256 digest, so the rate limit is
  not what protects it. Verified rather than "fixed".
- **Forgot-password cannot be used as an oracle** — it checks mail deliverability *before*
  looking up the account, so a missing user and a dead mail server are indistinguishable, and
  it always returns success.
- **The operator surfaces that are `@Public()` are secret-gated and fail closed** — audited in
  Area 11, where all three key comparisons were unified onto one constant-time
  implementation.
- **i18n across both areas**: 368 distinct keys, **0 missing** in de/es/fr/it.

## Open question (carried from Area 02, unchanged)

The Throttler has **no shared storage** — every limit above is per replica, in process
memory. With one gateway that is exactly right. The moment it scales horizontally — which the
cron-lock work made possible — every one of these numbers multiplies by the replica count,
login and forgot-password included. This is the single largest piece of unfinished business
the audit found, and it is infrastructure rather than code.

## Verdict

**PASS** — both areas.
