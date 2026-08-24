# HBCField — Web Audit Structure

> One repeatable procedure, run **one area at a time**, in the order below.
> An area is not "done" because it works — it is done when it passes all six passes with evidence.

---

## 0. How an area is audited

Every area goes through the **same six passes, in this order**. The order matters: you cannot judge
whether code is DRY until you know what the feature actually *is*, and you cannot judge performance
until you know which reads are authorised.

| # | Pass | Question it answers |
|---|------|--------------------|
| **A** | **Feature truth** | What does this area *actually* do, according to the code? |
| **B** | **Security** | Can someone see or change what they must not? |
| **C** | **Performance** | What does it cost — round-trips, payload, queries, render? |
| **D** | **Live sync** | Does the screen tell the truth without a refresh? |
| **E** | **DRY / SOLID** | Is this written once, in the right place? |
| **F** | **Surface** | i18n, design system, accessibility, error copy. |

### The evidence rule

**No finding without a citation.** Every finding names `file:line` and either a reproduction
(steps → observed → expected) or the exact query/response that proves it. A suspicion is written
as a *question* in the report, never as a finding. This is what keeps the audit from turning into
a list of opinions.

### Severity

| | Meaning | Deadline |
|---|---|---|
| **C** — Critical | Cross-tenant data exposure, privilege escalation, data loss, auth bypass | fix before moving on |
| **H** — High | Wrong data shown, a mutation that can silently fail, an unbounded query, a missing guard on a mutation | fix in the same pass |
| **M** — Medium | Needs a refresh to be correct, N+1, duplicated logic that has already drifted once | batch into the area's fix commit |
| **L** — Low | Hardcoded string, spacing, inconsistent label, missing empty state | batch, or backlog with a reason |

---

## Pass A — Feature truth (what the code says the feature is)

Produce, from the code only — **not** from CLAUDE.md, not from memory:

1. **Routes** in the area (`page.tsx` paths) and which are server vs `"use client"`.
2. **Reads** — every `useQuery`: key, endpoint, `staleTime`, pagination, who is allowed to call it.
3. **Writes** — every `useMutation`: endpoint, guard chain on the server, what it invalidates,
   whether it is optimistic.
4. **Server surface** — controller methods, the full guard chain each one carries, and the
   microservice pattern behind it.
5. **The one-paragraph truth**: what this area does, in the words a customer would use.

> This pass exists because most bugs in this codebase have been a gap between what a screen
> *appears* to do and what it *does* — e.g. a toast saying "Email sent" on a code-based invitation
> that never sends one.

## Pass B — Security

- **Tenant scope**: every read and write filters on `organizationId` **from the token**, never from
  the body or a query param. Prove it at the service layer, not the controller.
- **Guard chain**: Throttler → JwtAuth → CustomerConfinement → Roles → OnboardingComplete →
  Permissions → Subscription → Plan → Module. For each endpoint, name which guards apply and which
  are skipped by `@Public()` / `@SkipOnboardingCheck()` / `@AllowCustomer()`, and why that is correct.
- **IDOR**: fetch a sibling org's id on every `:id` route. Expect 403/404, never 200.
- **Privilege**: can a non-admin reach the mutation by calling the API directly? The UI hiding a
  button is not a control.
- **Self-targeting**: can a user escalate themselves, demote the last admin, or remove themselves
  in a way that orphans the org?
- **Leakage**: does the response carry fields the caller should not see (hashes, tokens, other
  members' emails, internal ids)? Does an error message leak a raw Prisma/driver string?
- **Rate limiting** on anything that sends mail, creates an account, or validates a code.

## Pass C — Performance

- **Waterfalls**: queries that depend on a previous query's result — can they be one endpoint?
- **N+1**: on the server, a `findMany` followed by a per-row query. Read the Prisma call, count the
  round-trips.
- **Unbounded**: any `findMany` with no `take`. Any list endpoint with no pagination cap.
- **Over-fetching**: `select` narrowed to what the screen renders; no `include` of a whole relation
  for one field.
- **Cache policy**: `staleTime` set deliberately per query — reference data long, live data short.
  A default of 0 on a list that changes hourly is a bug.
- **Bundle**: is the page `"use client"` in full when only a widget needs interactivity? Are heavy
  deps (maps, charts, PDF) dynamically imported?
- **Render**: list rows memoised, keys stable, no filtering of a large array inside render on
  every keystroke (debounce exists at `hooks/use-debounced-value.ts` — use it).

## Pass D — Live sync (the "no refresh" pass)

This is a **three-part** check. Failing any one of them means the screen can lie.

1. **My own tab** — after create / edit / delete, does the list, the counter, *and* any detail view
   update without a reload? (Local `invalidateQueries` in the mutation's `onSuccess`.)
2. **Another admin's tab** — does the same change reach a second logged-in session?
   This requires **three things that must all exist**:
   - the server **emits** an event (`emitToOrganization(orgId, '<event>', …)`),
   - the event name is in `Events` **and** in `EVENT_INVALIDATIONS` in
     `apps/web-app/src/hooks/use-realtime-sync.ts`,
   - the query keys listed there are the **real** keys the pages use.
   > A key that matches no query is silent — it looks wired and does nothing. This has already
   > happened once (`attendance-today`).
3. **The payload carries ids only** — each client re-reads through its own scoped endpoint, so a
   broadcast can never widen what a viewer is allowed to see.

Also check: does the mutation give **immediate** feedback (optimistic update or a pending state),
or does the row sit unchanged for a full round-trip?

## Pass E — DRY / SOLID

- **Check `packages/shared` first.** If a helper, type, or constant is being redefined in the web
  app, that is a finding. (Web reads the built `dist/` — rebuild after editing shared.)
- **One source of truth per rule**: role labels, status colours, permission checks, date/time
  formatting, currency. If the same `switch` appears twice, it has already drifted or will.
- **File size is a symptom, not the finding.** A 900-line page is only a defect when it mixes
  responsibilities — fetching, permission logic, formatting, and five dialogs in one component.
  Split by responsibility: `_lib/use-*-data.ts` for the data layer, `_components/*` for the views.
- **Server**: controller thin, service owns the rule, DTO owns validation. A controller containing
  business logic is a finding.
- **Open/closed**: new roles, statuses, or modules should be added by extending a map/registry,
  not by adding another `if` to five files.

## Pass F — Surface

- **i18n**: zero hardcoded user-visible strings; keys present in **all five** locales
  (en, de, es, fr, it). A missing key renders **the key string itself** — there is no
  `parseMissingKeyHandler` — so check the JSON, not the screen.
  > ⚠️ When diffing key sets, strip the i18next plural suffixes (`_zero _one _two _few
  > _many _other`) before comparing. `t("x.memberCount", { count })` resolves to
  > `memberCount_one` / `memberCount_other` at runtime, so a naive leaf-key diff reports
  > every pluralised key as missing. This produced five false positives in Area 03 before
  > it was caught.
- **Design system**: tokens only (no literal hex), shared `components/ui/*`, correct status/priority
  badge colours, consistent spacing scale.
- **States**: loading (skeleton, not a spinner on a full page), empty (explains what to do),
  error (says what went wrong and how to fix it — never a raw Prisma string;
  `packages/shared/src/api/prisma-error.ts` exists for this).
- **A11y**: keyboard reachable, visible focus, labelled inputs, dialog focus trap.
- **Both themes** render correctly; **RTL not required** (no RTL locale shipped).

---

## Report format (one file per area, `docs/audit/<nn>-<area>.md`)

```
# Area <nn> — <name>

## A. What this feature is (from the code)
<one paragraph> + routes / reads / writes / server surface tables

## Findings
| ID | Sev | Pass | Title | Evidence | Status |
|----|-----|------|-------|----------|--------|
| M1-C1 | C | B | ... | members/page.tsx:544 + repro | open |

## Open questions
<suspicions that lack evidence — never listed as findings>

## Verdict
PASS / PASS WITH FIXES / FAIL — and the commit that closed it
```

---

## Area inventory (audit order)

Ordered by blast radius: identity and access first, because everything downstream trusts it.

| # | Area | Routes | Why here |
|---|------|--------|----------|
| **01** | **Members & Access** | `/members`, `/members/[id]`, `/members/invite`, `/settings` roles | Every other area's authorisation is decided here |
| 02 | Invitations & Join Requests | `/invitations`, `/join-requests`, `/onboarding/*` | The other door into an org |
| 03 | Spaces (Locations) | `/locations`, `/locations/[id]`, `/shared/[id]` | Scopes modules, rosters, billing |
| 04 | Tasks & Task Types | `/tasks`, `/tasks/[id]`, `/task-types`, `/tasks/recurring`, `/sprints` | Largest surface, heaviest pages |
| 05 | Attendance & Time | `/attendance`, `/my/attendance`, `/schedule`, `/overtime`, `/my/time-off` | Most real-time, most money-sensitive |
| 06 | CRM & Clients | `/clients`, `/customers/[id]` | Per-record access rules |
| 07 | Portals (B2B2C) | `/locations/[id]/portals/[portalId]` | External users — hardest tenancy |
| 08 | Assets | `/assets`, `/assets/[id]` | Usage-billed |
| 09 | Invoicing | `/invoices*` | Money |
| 10 | Reports & Analytics | `/reports` | Query engine, data exposure |
| 11 | Billing & Settings | `/settings/*`, `/settings/billing`, `/settings/audit-log` | Server-authoritative pricing |
| 12 | Dashboard & Team | `/dashboard`, `/team`, `/issues` | Aggregates everything above |
| 13 | Public & Auth | `/`, `/pricing`, `/blog`, `/help`, `(auth)/*` | Unauthenticated surface |

---

## Exit gate for an area

1. Zero **C** and zero **H** open.
2. Pass D part 2 demonstrated in **two browser sessions** — not reasoned about.
3. Every fix has a test or a documented reason it has none.
4. `pnpm tsc --noEmit` clean, and `next build` clean (it type-checks the whole app and catches what
   dev hides).
5. The report file committed with the fix commit hash.

**Deploys are batched.** Fixes land locally and are committed per area; nothing goes to production
until you say "ready".
