# The Cleaning Pack: full plan

> **Goal:** a building-cleaning company (HBC Service included) can run on HBCField instead of PlanD.
> **Status:** PLAN ONLY (16 Oct 2026). Nothing built. Mockup approved for direction:
> https://claude.ai/artifact/UnaHPfHFkKXKnFpqYqVmiv (source `docs/design/cleaning-pack/`).
> **Research behind it:** `docs/design/pland-compare/` (page + `research/notes-*.md`: 242 site pages,
> 155 Help Center articles, 31 customer stories read in full).
> **Working rules that apply:** mockup before code, web reviewed on :3000 before any deploy, phone
> previewed in the Expo dev app before any OTA, deploys batched only when you say so, no
> "paid/unpaid" wording in app text, every action audited.

---

## 0. Why, in one paragraph

PlanD wins cleaning companies on **paperwork**: tariff payroll, quotes, invoices, e-invoices. It also wins on **languages**.
It loses on **technology and flexibility**, as its own manual shows:
- Chrome/Firefox only, one session per licence, 3 custom fields.
- Public holidays typed in by hand; stand-ins picked by hand.
- Partial offline mode; bank link for Germany and Austria only.

HBC Service's Rheinland branch runs on PlanD and uses seven things. We have four of them (rota on the phone, time capture, leave, chat). We are missing **payroll** and **material orders**, and we have **complaints with photos** only partly. This plan closes those gaps and beats PlanD where its manual shows weakness.

---

## 1. Decisions needed from you (defaults used until you say otherwise)

| # | Question | Default in this plan |
|---|---|---|
| C1 | Which countries' agreements first? | **Germany (Gebäudereinigung RTV + LTV 2026)** first, Austria (KV Denkmal-, Fassaden- und Gebäudereinigung) second |
| C2 | Do we calculate net pay (taxes, social insurance)? | **No.** We compute gross pay items and export to the payroll office/DATEV, as PlanD does. Net payroll stays with DATEV, Relog or the tax adviser |
| C3 | Payroll export formats, in order | **DATEV Lohn und Gehalt (ASCII import)** → **DATEV LODAS** → CSV with your own column map |
| C4 | Is the Cleaning Pack an Option (org add-on) or modules? | **One Option "Cleaning payroll"** (org-wide, €19 like the other options) + **"Quotes & receivables"** folded into the existing `invoicing` option. Languages, stand-ins, materials are for everyone |
| C5 | Quote pricing model | **Per area × frequency × soiling factor**, with free lines too. No room-by-room cleaning-plan generator in v1 |
| C6 | E-invoice library | Generate **XRechnung (UBL 2.1, CIUS 3.0)** and **ZUGFeRD 2.3 (EN 16931 profile)** ourselves from one model. Validate in tests against the KoSIT validator (offline jar in CI) |
| C7 | Bank payments in v1 | **CAMT.053 / CAMT.054 file import** (any bank). A live bank link (finAPI or similar) only later, and only if customers ask |
| C8 | Chat translation engine | **DeepL API** (EU servers, GDPR contract). Messages are translated on display, cached per language and never stored as the message |
| C9 | New app languages, in order | Turkish, Polish, Romanian, Arabic (RTL), Ukrainian, Bosnian/Croatian/Serbian (one Latin catalogue to start) |
| C10 | AI assistant | **Not in this plan** (the decision to remove AI stands). Listed as P3 only if you change it |

---

## 2. Principles: how we stay stronger than PlanD

1. **One source of truth for time:** every amount comes from counted time (`packages/shared/src/attendance/counted-time.ts`) and dated rates (`rate_history` via `writeRateChange`). Nothing is typed twice.
2. **Recompute until locked; frozen after.** PlanD fixes surcharges at approval, so a late rule change means re-approving everything. Ours recompute whenever their inputs change, until the month is locked. A lock is final and audited.
3. **The calendar decides days off.** Public holidays, regions and half-days come from `packages/shared/src/calendar/holidays.ts`, never typed by hand.
4. **Shared rules, both apps:** every rule lives in `packages/shared` (pure, tested) and is read by the server, the web and the phone. No copies.
5. **Money in cents.** New money columns are `Int` cents. The legacy `Float` amounts on `Invoice` / `InvoiceItem` get cent columns alongside (see §5.0) and are migrated, never mixed.
6. **Refusals are coded** (`code` + `params`) and translated in all app languages.
7. **Offline where workers are:** ordering material, signing a work slip and taking a shift offer all queue in the phone's outbox. Taking a shift is the exception: it is online-only, because a queued take would promise a place somebody else got.
8. **Every write is audited** (audit interceptor), and every approval goes through the **Approvals inbox** (no new decision pages).

---

## 3. Phases at a glance

| Phase | What | Size | Unlocks |
|---|---|---|---|
| **A** | Payroll pack (DE), with travel time and absence pay rules | L | HBC's #5; the main reason to buy PlanD |
| **B** | Quotes → orders → recurring jobs; invoice lines from real work; signed work slip → invoice | L | Office paperwork |
| **C** | E-invoices (XRechnung/ZUGFeRD), dunning, CAMT import + matching, accounting export | L | Getting paid; e-invoice law |
| **D** | Languages + chat translation | M | Multilingual crews |
| **E** | Automatic stand-in | M | Beats PlanD outright |
| **F** | Material cupboard per site | M | HBC's #6 |
| **G** | Priority 2: client QR page, quality scores, approval by exception, half-day absences | M | HBC's #7; polish |
| **H** | Priority 3: device maintenance + keys, public API/Zapier, Austria payroll | M–L | Later |

Suggested order: **A → B → D → E → C → F → G → H**. D and E are smaller and visible to every worker, so they ship between the big office phases. C waits for B, because quotes and lines shape the invoice model C extends.

---

## 4. Phase A: Payroll pack (Germany)

### 4.1 What it must do (the bar PlanD sets)

- Wage groups LG 1–9 with **dated** hourly rates. From 1 Jan 2026: LG1 15,00 · LG2 15,46 · LG3 15,95 · LG4 16,66 · LG5 17,47 · LG6 18,40 · LG7 19,39 · LG8 20,42 · LG9 21,64 €.
- Surcharges:
  - night 30 %
  - Sunday 80 %
  - public holiday 80 %
  - 1 May, New Year and Christmas 200 %
  - 24 and 31 Dec 150 %
  - load surcharge 25 % above 8 h/day or 40 h/week

  By default only the highest applies. Each surcharge is split into its tax-free part (§3b EStG) and its taxable part.
- Absence pay per absence type: contract hours · planned hours · 3-month average · unpaid · daily rate.
- Travel time between sites counts as work when the gap is ≤ 3 h (agreement rule; configurable).
- Monthly **lock** (customs-proof: nothing changes after it) and **export**.

### 4.2 Where we are stronger (acceptance criteria)

- A rule or rate changed mid-month **recomputes** every unlocked day. No re-approval.
- Holidays come from the workspace's region automatically. A half holiday (24/31 Dec) is handled.
- "Highest wins" vs "stack" is **a setting per agreement**, not fixed.
- Several absences per day (half days) work.
- Exports run as a **background job** (BullMQ). They never time out, and a link arrives when ready.
- Contract hours, absences per day with dates, and cost centres are all **in the same export**.

### 4.3 Data model (migration `…_payroll_pack`, additive)

```
PayAgreement        { id, organizationId, country, code ('DE_GEBREIN_2026'), name, stacking (HIGHEST|STACK), active }
PayGroup            { id, agreementId, code ('LG1'), name }
PayGroupRate        → reuse rate_history: target 'PAY_GROUP', targetId, cents, effectiveFrom (ONE writer: writeRateChange)
SurchargeRule       { id, agreementId, kind (NIGHT|SUNDAY|HOLIDAY|SPECIAL_DAY|LOAD_DAY|LOAD_WEEK|CUSTOM),
                      percent, fromTime?, toTime?, days? (dates for SPECIAL_DAY, e.g. 05-01, 12-25),
                      thresholdMinutes?, taxFreePercent?, payNumber, taxablePayNumber?, effectiveFrom }
AbsencePayRule      { id, organizationId, timeOffType, basis (CONTRACT|PLANNED|AVERAGE_3M|UNPAID|DAILY_RATE), payNumber }
MemberPayProfile    { userId, agreementId, payGroupId, contractMinutesPerWeekday Json, costCentre?, payrollNumber?, travelTimeCounts bool }
PayDay              { id, organizationId, userId, day (Date), spaceId, minutes Json (worked, night, sunday, holiday,
                      special, loadDay, loadWeek, travel, absence), amounts Json (cents per pay number),
                      inputsHash, computedAt, lockedMonth? }      -- one row per person per day: the cache
PayrollMonth        { id, organizationId, month (YYYY-MM), status (OPEN|LOCKED), lockedAt?, lockedById? }
PayrollExport       { id, organizationId, month, format (DATEV_LUG|DATEV_LODAS|CSV), status, fileKey?, createdById, createdAt }
```

`PayDay` is a **derived cache**, rebuilt from its inputs (time entries, breaks, rota, holidays, absences, rules, rates). `inputsHash` decides whether a recompute is needed. Locking a month copies nothing and simply refuses recomputes for that month.

### 4.4 Shared rules (pure, tested; `packages/shared/src/payroll/`)

- `classifyMinutes(entry, rota, holidays, zone)` → night / Sunday / holiday / special minutes per entry, in the **workspace's zone** (reuse `zoned-time.ts`).
- `loadMinutes(daysOfWeek)` → minutes above 8 h/day and 40 h/week.
- `applySurcharges(minutes, rules, stacking)` → `{ payNumber: cents }`, tax-free split included.
- `absencePay(absence, basis, history)` → minutes and cents.
- `travelMinutes(entries, maxGap)` → travel between consecutive sites.
- `payDay(inputs)` → the whole day. **The spec table test** covers every rule in §4.1, with examples from the agreement.

### 4.5 Server (task-service `modules/payroll/`)

- `PayrollComputeService`: recomputes `PayDay` rows for (user, day range) when their inputs change. It is triggered by time-entry close/edit, break edits, absence decisions, rule or rate changes, and holiday overrides, through one `payroll_recompute` queue, coalesced per user per day. A nightly sweep catches anything missed (under the cron lease).
- `PayrollMonthService`: overview, lock (refuses while entries are open or not yet decided in Approvals), audit row.
- `PayrollExportService`:
  - a BullMQ job writes DATEV LuG ASCII / LODAS / CSV
  - the file is stored privately and fetched through a **minted link** (like documents)
  - the format writers live in `packages/shared/src/payroll/export/` with golden-file tests

### 4.6 Gateway

`/payroll/agreements`, `/payroll/rules`, `/payroll/members/:id/profile`, `/payroll/months/:month` (GET overview, POST lock), `/payroll/exports` (POST start, GET list, POST `:id/download-url`).
- **Gate:** a new key `canRunPayroll` (org-wide), with labour figures following the existing `canViewLabourCost` rules.
- `@DenyExternal`.
- Behind the **"Cleaning payroll" Option** (`PlanGuard`).

### 4.7 Web

- Settings → Payroll:
  - agreement wizard (pick DE 2026 → groups, rates and rules filled in)
  - rules editor
  - absence pay rules
  - pay numbers
- Member → Pay profile: group, contract hours per weekday, payroll number, cost centre, whether travel counts.
- **Payroll page**: the month table per person (worked, night, Sun/hol, load, travel, absence, surcharge €, tax-free €), drill-down to days, the "recomputed" notice, Lock, Export (mockup §01).

### 4.8 Phone

The worker sees their **own** month: hours and surcharge minutes, no money unless the office switches that on. They can open the statement PDF. Read-only, kept offline.

### 4.9 Tests

- shared spec table
- golden export files
- recompute triggers
- the lock refuses changes
- no labour cost reaches a reader without `canViewLabourCost`
- an e2e `tools/payroll-e2e.py` (LOCAL) that builds a month with a night shift, a Sunday, 3 Oct and a sick day, and checks every figure

---

## 5. Phase B: Quotes, invoice lines from real work, signed work slips

### 5.0 Money first

`Invoice` and `InvoiceItem` store `Float` euros today. Add `…Cents Int` columns alongside, backfill them (rounded half-up), switch reads to cents, and keep the floats written in step for one release. Then drop the floats in a later migration. **No new code reads the float columns.**

### 5.1 Quotes

```
Quote      { id, organizationId, number (per legal entity series 'ANG-YYYY-0001'), customerId, spaceId?, legalEntityId?,
             status (DRAFT|SENT|ACCEPTED|DECLINED|EXPIRED|WITHDRAWN), validUntil, startsOn, currency,
             acceptToken (hashed), acceptedAt?, acceptedName?, acceptedIp?, createdById }
QuoteItem  { id, quoteId, kind (AREA|FLAT|TEXT), description, areaM2?, frequency (DAILY|WEEKLY_N|MONTHLY_N|QUARTERLY|ONCE),
             soilingFactor?, unitPriceCents, monthlyCents, taskTemplate? Json }
```

- Price = area × €/m² for the service × soiling factor × visits per month, or a flat line. The rule lives in `packages/shared/src/billing/quote-price.ts`.
- **Acceptance page:** a public, signed link (pattern of `customer-sign-link` / calendar feed: hashed token, rate-limited, same 404 for every failure), in the **client's language** (`clientEmailLocale`). Accept records name, time and IP (audited).
- **Accepted →**
  - (a) recurring task templates are created in the quote's workspace, starting on `startsOn` (**any day**)
  - (b) a recurring billing plan (below), with the first month pro-rata

### 5.2 Billing plan on the client (the "order")

```
BillingPlan     { id, organizationId, customerId, spaceId, quoteId?, cadence (MONTHLY|QUARTERLY|YEARLY), anchorDay, startsOn,
                  endsOn?, mode (DRAFT|AUTO_SEND), nextRunOn }
BillingPlanLine { id, planId, source (FIXED|COUNTED_TIME|VISITS_DONE|VISITS_MISSED|DAYS), description, unitPriceCents,
                  quantity?, taskFilter? Json }
```

- A sweep creates invoices on `nextRunOn` (claimed by a conditional update; cron lease), as DRAFT or ISSUED + SENT.
- **Never a 0 € invoice.**
- A manual invoice never moves the cycle.

### 5.3 Lines from real work (extends `billing/invoice-lines.ts`)

- `COUNTED_TIME`: per person, using each person's `hoursBasis`. The crew's own time, not a team lump.
- `VISITS_DONE` / `VISITS_MISSED`: from the recurring occurrences in the period. Missed ones get a negative price.
- **Billed-so-far tracking:** each line remembers `billedFrom/To` and the quantity already billed (the DAYS lines already prevent double billing), and partial invoices show "billed X of Y".

### 5.4 Signed work slip → invoice

```
WorkSlip      { id, organizationId, taskId, customerId, signedAt?, signerName?, signature (data URL, safeSignatureDataUrl),
                items Json (done + extra items, NO prices), invoiceId?, createdById }
```

- **Phone (worker):** the slip at the end of a job, extra items added, the client signs on the pad (native signature pad already exists), and it works offline in the outbox.
- **Web:** "Signed slips" list, "Make invoice" one by one or bundled per client.
- The client gets the **job report client copy** (`toClientCopy`) as proof.

### 5.5 Tests and e2e

- quote price
- the acceptance link (expired, wrong token, replay)
- accepted → templates and plan created once (idempotent)
- the plan sweep (no 0 €, pro-rata)
- visits done/missed counts
- billed-so-far
- a slip queued offline then signed
- `tools/quotes-e2e.py`

---

## 6. Phase C: E-invoices, dunning, payments, accounting export

- **E-invoice:** a shared model `packages/shared/src/billing/einvoice/` maps an ISSUED invoice to EN 16931 data. The writers are XRechnung UBL (with **Leitweg-ID** on the client: `Customer.leitwegId`) and ZUGFeRD (PDF/A-3 with embedded XML, from the existing PDF pipeline). The choice is per client: PDF / ZUGFeRD / XRechnung. KoSIT validation runs in CI.
- **Dunning:**

  ```
  DunningLevel { organizationId, step, afterDays, feeCents, templateKey }
  ```

  A sweep marks invoices OVERDUE → REMINDED (step n) and sends in the client's language (all five languages and more). The fee is a new line on the reminder, never edited into the invoice.

  New statuses come after SENT: OVERDUE and REMINDED. PAID and CANCELLED stay. A **Storno** (cancellation document) replaces in-place edits after issue.
- **Payments:**

  ```
  BankStatementImport { id, legalEntityId, accountIban, fileKey, importedAt, entries }
  Payment { id, invoiceId?, amountCents, valueDate, counterparty, reference, matchKind (EXACT|DISCOUNT|TOLERANCE|MANUAL), confirmedById? }
  ```

  - A CAMT.053/054 parser lives in shared.
  - Matching order: invoice number in the reference → exact amount → amount with early-payment discount → within tolerance (asks a person).
  - Several accounts per legal entity (bank accounts already exist, up to 5).
- **Accounting export:** a DATEV booking batch (Buchungsstapel CSV) with revenue accounts per tax rate or product. Cancellations are written in the **correct** fields (PlanD's documented bug).
- **Tests:** golden XRechnung/ZUGFeRD files validated, a CAMT fixture matched, the dunning sweep, Storno.

---

## 7. Phase D: Languages and chat translation

- **Catalogues:** add `tr, pl, ro, ar, uk, bs` to `apps/web-app/src/i18n/locales` and `apps/mobile/src/i18n/locales`, plus `packages/shared` email/push catalogues. Professional translation of the existing keys: export JSON → translator → import. The approvals and email catalogue specs already enforce "all languages present", so they extend automatically.
- **Arabic RTL:**
  - web: `dir="rtl"` from the locale, logical CSS (`ms-/me-`, `start/end`), and icons that point a direction get mirrored
  - phone: `I18nManager.forceRTL` needs a restart, so offer it with an explanation
  - an audit pass of the screens most used by workers first: Home, Jobs, Clock, Chat, Leave
- **Chat translation:**
  - `GET /chat/messages/:id/translation?to=xx` returns `{ text, from }`
  - cached in Redis per (message, language) and **never stored on the message**
  - deleted messages are refused
  - the per-org setting `chatTranslation` (on/off) and DeepL usage show as a line on the bill if we charge for it
  - the app shows the reader's language with "Show original"
  - search stays on the original text
- **Tests:** RTL snapshot of key screens, translation cache, refusal for a message the caller can't read (membership rule), every new catalogue complete.

---

## 8. Phase E: The automatic stand-in

- **Shared rule** `packages/shared/src/scheduling/stand-in.ts` → `rankStandIns(slot, candidates)`. Each candidate gets a score and **visible reasons**:
  - has worked at this site (count, last time)
  - same trade (work role)
  - distance from home or the last site
  - free in the rota / not on leave / under weekly hours
  - cover verdict (`CoverService`)
- **Server:** when an absence is approved (or a no-show is excused) and visits are uncovered, the office sees a **stand-in card** on the absence in Approvals, and on the planner.
  - "Offer to top N" uses the **role-pool offer** mechanics: a conditional take, first wins, `task_role_offer` push, waves.
  - The client is told through a template in **their language** (`clientEmailLocale`), per client on/off (not one global switch).
- **Phone:** the "Shift offered to you" screen with Take / Not this time. Online only, as role tasks are.
- **Tests:** ranking spec, the race (two takers, one wins), client notice language, a person on leave never offered.

---

## 9. Phase F: Material cupboard per site

```
MaterialArticle { id, organizationId, name, unit, supplierId?, priceCents?, groupId? }
SiteCupboard    { id, spaceId, monthlyBudgetCents (0 = unlimited) }
CupboardStock   { cupboardId, articleId, quantity, minQuantity }
MaterialOrder   { id, organizationId, spaceId, requestedById, status (REQUESTED|APPROVED|DECLINED|ORDERED|DELIVERED),
                  lines Json, totalCents, deliveredAt?, receivedById?, signature?, deliveryNoteKey?, invoiceItemId? }
```

- **Phone:**
  - order from the site's article list
  - budget bar
  - **works offline** (outbox)
  - delivery confirmed with a signature
- **Approvals:** a new kind `material_order`, decided through its own route; office rules (amount thresholds) apply, as for expenses.
- **Web:**
  - articles and suppliers
  - cupboards per workspace
  - orders, with a delivery note PDF e-mailed to the supplier
  - optionally "bill to client" as a line
- Stock moves on delivery, with a low-stock warning at the minimum.
- **Gate:** reuse `canManageAssets` for the catalogue. Ordering needs only being rostered at the site (the same idea as expenses, authorised by custody).

---

## 10. Phase G: Priority 2

- **Client QR page per site:** a renewable signed link (calendar-feed pattern) showing recent completed work (first names only, by setting). A complaint with photos becomes a **task** in that workspace (workflow, crew, time) and the client is told when it's done. Rate-limited, no login.
- **Quality checks:** a checklist "inspection" type with 1–5 scores per item and photos. A site score and trend appear on the workspace and in the client report.
- **Approval by exception:** a tolerance per workspace (± minutes, %) auto-approves matching entries in a nightly pass (audited as automatic). Only the rest reach the Approvals inbox, with bulk approve and a map of the check-in and check-out points.
- **Absences:** half days (`TimeOff.portion` AM/PM/FULL), several per day, and the pay basis from §4.

---

## 11. Phase H: Priority 3

- **Device maintenance:** an interval on the asset kind and due dates generated as recurring tasks (DGUV V3 checks as a kind template). **Keys** are an asset kind held through custody, with the hand-over history we already keep.
- **Public API:** scoped API keys built from the shared endpoint catalogue, with outgoing webhooks and a Zapier/Make app.
- **Austria payroll:** the KV agreement template (surcharge rules differ). Same engine, a new agreement.
- **AI assistant:** only if you decide.

---

## 12. Cross-cutting

- **Options/billing:** "Cleaning payroll" Option (C4), and dunning/CAMT/e-invoice inside `invoicing`. The surfaces are registered in `option-surfaces.ts` so the navbar, tabs and settings hide them when not bought.
- **Permissions:** new keys `canRunPayroll` (org-wide) and `canManageReceivables` (quotes, dunning, payments; space-capable for quotes). They go on `ACCESS_PERMISSION_SCHEMA`, are NOT external, and built-in roles catch up add-only.
- **External-reach sweep:** every new route on the reviewed list or behind a permission, enforced by `external-reach.spec`.
- **Offline:** work slip, material order and delivery signature go through the queued-writes guard. Shift offer and search stay online only.
- **Audit:** lock, export, acceptance, payment confirmation, dunning sent, stand-in offer taken.
- **Performance:** `PayDay` cache plus recompute queue. The payroll month page is **one query** over `PayDay`, never a scan of time entries.

---

## 13. Rollout

- Each phase is one batched deploy, after your approval on :3000 and in the Expo dev app.
- Migrations are additive, with a backup and a table count before each (`pg_dump -U doergo doergo`).
- **HBC pilot:** the payroll pack is run in parallel with PlanD for one month on one branch. Our export is compared with PlanD's, line by line, before anyone relies on it.
- **Phone:** JS-only phases ship by OTA (1.0.8 train). Arabic RTL forcing and any new native module (none planned) need a build.

---

## 14. Risks

| Risk | Mitigation |
|---|---|
| Payroll numbers wrong = real people underpaid | The shared spec table built from the agreement text, golden exports, a parallel month against PlanD before going live |
| DATEV format details | Golden files from a real DATEV import test with a tax adviser; LODAS second |
| E-invoice validity | KoSIT validator in CI on every writer change |
| Agreement changes yearly | Rates and rules are **dated** rows; a new year is a new row, never an edit |
| Translation costs | Translate on display, cache, per-org switch, show on the bill |
| RTL breaks layouts | Logical CSS, a screen-by-screen audit, Arabic behind a switch until the audit passes |

---

## 15. First steps when you say go

1. Confirm C1–C10 (or keep the defaults).
2. Phase A mockup detail pass: settings wizard, member pay profile, month page, export dialog.
3. Write `packages/shared/src/payroll/` with the spec table first (tests before screens).
4. Migration, compute service, month page on :3000 for your review.
