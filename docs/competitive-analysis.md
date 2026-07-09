# Competitive Analysis & Differentiation Roadmap

> **Purpose:** Track where doergo/HBCField stands vs competitors, and grow a backlog of
> features that make us **hard to compare** (i.e. not a like-for-like swap for any single
> incumbent). Revisit and expand the "Differentiation Roadmap" section over time.
>
> Last updated: 2026-06-19

---

## Positioning in one line

One platform that overlaps **three** normally-separate categories:
**Field Service Management (FSM)** + **Workforce Time & Attendance** + **Project Management**,
with a web (dispatch) + mobile (field) split.

The pitch: *"One tool that replaces an FSM tool + a time-tracking tool + a GPS tracker."*

Competitive tiers we sit against:
- **FSM incumbents** — ServiceTitan, FieldEdge ($125–398/user/mo, custom)
- **FSM SMB** — Jobber, Housecall Pro, Workiz (~$45–65/user), Service Fusion (flat/unlimited)
- **Deskless workforce** — Connecteam, Skedulo
- **Time & attendance** — Deputy, When I Work, Hubstaff, Jibble ($2.50–10/user, commoditized)

**Pricing rule:** breadth = price in the FSM world (~$40–69/user), NOT the attendance world ($2–10).

---

## 3. Our wins (genuine differentiators)

1. **Three tools in one.** A customer otherwise buying Jobber (~$50) + Deputy (~$5) +
   Hubstaff (~$8) ≈ **$60–90/user**. We can undercut that AND be one login.
2. **Background exact-route GPS** — premium even in FSM; many gate it behind top tiers.
3. **Real overtime engine** (policies, detection source, approval) + geofenced auto-clock-out
   — more sophisticated than most SMB FSM tools' bolt-on.
4. **Multi-tenant cross-org delegation** — franchises, subcontractors, staffing agencies,
   "agency manages many client orgs." Rare and enterprise-grade; a wedge most SMB tools
   can't touch.
5. **Granular dynamic per-user access** — lets one product fit very different org shapes.
6. **Modern realtime stack** (Socket.IO, BullMQ exactly-once, PostGIS) — reliability story.
7. **Configurability** (custom fields, workflows, task types) — moves us toward "platform,"
   not "app."

---

## 4. Our weak points (be honest — these cap our price)

### Monetization blockers (fix before charging)
1. **No SaaS billing layer at all** — no Stripe/subscription/seat metering. We literally
   can't charge yet. Build-item #1.
2. **No online payment collection on invoices** — Jobber/Housecall make huge margin on card
   processing. We have invoices but not "get paid." Big missed revenue + a sales gap.

### Feature gaps vs FSM incumbents
3. **No customer/CRM + booking/quotes.** FSM sales centers on "manage your customers, send
   quotes, let them book online." We have orgs/members/locations but no end-customer
   database, estimates, or customer portal. **Biggest competitive hole for the FSM buyer.**
4. **No accounting/integration ecosystem** (QuickBooks, Xero, Zapier) — table stakes;
   deals die without it.
5. **No offline mode** for the field app — field workers lose signal; FSM buyers ask first.
6. **Reporting/BI is shallow** (attendance + technician only) vs incumbents' dashboards.
7. **Localization:** only EN/DE.

### Maturity / trust (caps enterprise pricing)
8. Single-server, manual deploy, prod schema drift, no HA, no SOC2/ISO, no support org,
   unproven scale. Enterprises won't pay enterprise prices for this yet.

**Net:** Feature-breadth says "price like FSM." Maturity says "price at the low end of FSM
and climb as you close gaps 1–8."

---

## 5. Pricing recommendation

> Competitor prices are directional (≈ early-2026 training knowledge) — verify live before
> setting yours. Strategic guidance, not financial advice; real number depends on infra
> cost/user, CAC, churn.

### Model: hybrid tiers + per-seat, with a **seat split** (FSM standard)
Field-service buyers hate paying full price for 20 field workers who just tap a phone. Split:
- **Office/Dispatcher seat** (web: create, assign, dispatch, report) — the value seat
- **Field seat** (mobile: execute, clock, track) — cheaper, where the headcount is

### Suggested launch pricing (EU market, €; ≈ same number in $)

| Plan | Price | Includes | Target |
|---|---|---|---|
| **Starter** | **€19/user/mo** (min €99/mo) | Tasks, attendance, GPS, schedules, mobile | 5–15 person crews |
| **Professional** ⭐ | **€39/user/mo** | + service reports, assets, invoicing, overtime engine, recurring, custom fields | core FSM SMB |
| **Business** | **€69/user/mo** | + multi-org delegation, audit log, workflows, SSO, priority support | franchises/agencies |
| **Enterprise** | Custom | SLA, HA, dedicated, on-prem option | later, once mature |

**Seat-split alternative** (often converts better): **Office €49/user + Field €15/user**, Pro tier.

### Pricing rules that matter more than the number
- **Annual billing = 2 months free** (~17% off) — pulls cash forward, cuts churn.
- **Floor of ~€99/mo** — filters out 1–2 person accounts that cost more in support than they pay.
- **14-day free trial, no card** — need logos and case studies more than early margin.
- **Land low (Starter €19 / blended ~€30), raise later.** Every gap closed in §4 (payments,
  CRM, integrations, SOC2) is a documented price increase.

### Why these numbers
- **Anchored above commoditized attendance** (€2–10) so we don't signal "time clock."
- **At the low end of FSM SMB** (Workiz €45–65, Housecall €49+): breadth matches them,
  but maturity/CRM/payments don't yet.
- **Value framing for the buyer:** "Replaces Jobber + Deputy + Hubstaff (~€60–90/user) for
  €39." That line sells — cheaper *and* consolidated.

### Reality check on the math
At **€39/user blended**, a 25-person field company = **~€975/mo / ~€11.7k/yr ACV**.
50 such customers ≈ **€585k ARR** — a healthy SMB-FSM trajectory, *if* we ship the billing
layer and start closing the CRM/payments/integration gaps.

---

## 6. What to do in order

1. **Build the billing/seat-metering layer** (Stripe) — nothing else matters until we can charge.
2. **Add online invoice payments** — fastest revenue + closes an FSM gap.
3. **Add a lightweight Customer + Quote module** — unlocks the FSM buyer.
4. **One accounting integration** (QuickBooks or Xero) — removes a common deal-blocker.
5. Then **raise prices** with each milestone.

---

## Differentiation Roadmap — "make us not comparable"

> Goal: features that mean no single competitor is a 1:1 replacement for us. Add ideas here
> over time; promote the strongest into the product backlog.

### Build-to-monetize (prerequisites, not differentiators)
- [ ] Stripe billing + seat metering (office vs field seats)
- [ ] Online invoice payments (get-paid flow)

### Candidate differentiators (to expand later)
- [ ] Customer + Quote/Estimate + booking portal (closes the FSM hole, then extend past it)
- [ ] Offline-first mobile field execution (sync queue) — turns a gap into a strength
- [ ] _add ideas here..._

### Ideas parking lot
- _capture raw ideas here before they're shaped_

---

## Related docs
- `docs/map-ideas.md` — map/GPS feature backlog
