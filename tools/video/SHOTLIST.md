# Shot list — the remaining tours

One row per video worth making, in the order they earn their place. Each names
the tour(s) it answers, what the flow has to do, and the thing that will bite
whoever builds it.

`clock-in-out` is built (`myAttendanceTour` + `attendanceTour`). Everything
below is a script and a flow away.

---

## Tier 1 — the ones a trial user needs in week one

### 1. `create-a-job` → `tasksTour`, `taskDetailTour`
**~2:00.** Create a job, assign it, watch it move.

Beats: the board → New Job dialog → title, client, workspace, due date →
assign a technician → open the job → the activity timeline → a comment.

- ⚠️ **Pick the client from the CRM picker**, which is the differentiator: the
  task takes the client's address as its GPS destination. Only offered where
  the workspace runs the `crm` module — the seeded depot does.
- ⚠️ The status pills come from the space's workflow. The seed attaches the
  Field Service template, so expect `ASSIGNED → ACCEPTED → EN_ROUTE → …`.
  Do not narrate a status name; narrate what the step *is*, or the video dates
  the moment somebody edits their workflow.
- The seed already has 14 jobs, so the board is not an empty state.

### 2. `set-up-your-team` → `membersTour`, `pageInvitations`, `memberDetailTour`
**~2:00.** Invite somebody, decide what they can reach.

Beats: Members → Invite → the role → the invitation code → the member record →
the Access profile (which modules, which platforms) → workspaces.

- ⚠️ **Never show a real invitation code that still validates.** `Invitation`
  stores the plaintext and the code is a bearer credential: whoever types it
  joins the organisation. Either revoke it in the same flow, or blur it. This
  is the single highest-risk frame in any planned video.
- ⚠️ The access profile's `platforms` is a **string** (`'both'|'web'|'mobile'`),
  not an array — see the comment in `seed-video.ts`. Getting it wrong 403s
  every request and the app bounces to the login page.

### 3. `workspaces` → `spacesTour`
**~1:45.** What a workspace is and why the product is organised around them.

Beats: Workspaces list → open one → its modules → the geofence map → make it
the default.

- ⚠️ The boundary editor **opens in a dialog of its own** and the radius slider
  is **logarithmic** — three attempts to grow the map in place failed. Do not
  try to film it inline.
- The seed has three spaces: two COMPANY, one CUSTOMER. The CUSTOMER one makes
  the "a customer site is a workplace" point without a word of narration.

---

## Tier 2 — the modules people pay for

### 4. `who-has-the-van` → `pageAssets`
**~2:00.** Custody, and what a van costs while somebody has it.

Beats: Assets → a vehicle → the Custody tab (timeline + cost per period) → hand
it over, showing the plan dialog before agreeing → the member's Custody tab.

- ⚠️ The strongest beat is that **the holder is never stored on a cost** — every
  entry carries the date the money moved, and who held it that day is a lookup.
  Say it as "correct a handover date and the whole ledger re-attributes itself",
  not as a data-model sentence.
- The seed gives 4 vans and 4 instruments, each with an open custody period and
  four months of fuel and servicing.

### 5. `getting-paid` → `pageInvoices`
**~1:45.** Job → invoice → issued → paid.

Beats: Invoices list (draft/sent/overdue/paid) → open a draft → the watermark →
Issue → the clean PDF → mark paid.

- ⚠️ **A draft's PDF is watermarked on purpose.** Without the ISSUED step the
  only clean document meant recording a delivery that never happened — that IS
  the story, so show the watermark rather than cutting round it.
- Needs the `invoicing` option. The seed grants every option.

### 6. `the-rota` → `pageAvailability`, `pageOvertime`
**~2:00.** Who is working, who is off, who is owed.

Beats: Schedule & Time Off → the wallchart → a leave request → the cover
verdict → Overtime → approve a round.

- ⚠️ **`minCover: 0` means NOT SET**, not "nobody needed". The seeded depot
  has `minCover: 2` so the cover verdicts render.
- ⚠️ Approving overtime **moves `expectedClockOutAt`**, which is what makes the
  counted hours change on screen. Film the hours before and after.
- ⚠️ Needs a `workModel: 'SHIFT'` space with a rota. The recording depot is
  deliberately `NONE` — see the comment in `seed-video.ts` — so this video
  needs the seed extended with a shift space, not reused as-is.

### 7. `the-personnel-file` → (no tour yet)
**~2:00.** Issue a contract, have it signed, chase what expires.

- ⚠️ **Refusals here are 404, not 403**, and a type names who may see it, where
  **empty means no restriction**. Do not narrate "only HR can see this" over a
  type with an empty list — it is the opposite.
- ⚠️ Never film a real document. Seed one that is obviously a sample.

---

## Tier 3 — orientation

### 8. `first-five-minutes` → `welcomeAdmin`
**~2:30.** The signup-day tour: create the org, the first workspace, the first
member, the first job.

- ⚠️ Needs a **fresh org mid-recording**, which the current seed deliberately
  does not do (it builds a mature one). Either a second seed with an empty org,
  or register a throwaway account in-flow.

### 9. `what-am-i-doing-today` → `welcomeEmployee`, `tasksEmployeeTour`
**~1:30.** The field view. **Best as a MOBILE video** — this is the one that
most justifies building the Maestro half.

### 10. `build-a-report` → `reportsTour`
**~1:45.** Pick a dataset, filter, group, export, schedule.
- Needs `reports_builder`. Report column names are translated; organisation-
  authored names are not — avoid narrating a column label.

### 11. `requests-from-clients` → `pageJoinRequests`, portal
**~1:45.** A client raises a request, it lands in triage, becomes a job.

### 12. `settings-and-options` → `pageSettings`, `pageManage`
**~1:30.** What is bought once for the organisation vs per workspace.
- ⚠️ Say **"Options"**, never "add-ons" — the customer-facing word changed on
  2026-09-04 and only the column and the API route still say `addOns`.

---

## Rules for every one of them

- **Never narrate a number the seed produces.** "Thirty-two hours" is wrong the
  next time the jitter changes. Say "her hours for the week".
- **Never narrate a status or module name** that an organisation can rename.
- **Wait on selectors, never on time.** A `waitForTimeout` standing in for "the
  page is probably ready" passes here and fails on a cold dev server, mid-take.
- **Warm the routes** the flow visits (`warmRoutes` in `render.ts`) or the first
  visit to each spends its narration on a `next dev` compile, in silence.
- **Check the frames before shipping.** `ffmpeg -ss <t> -i out.mp4 -frames:v 1`
  is faster than watching, and catches an empty state the narration describes
  as full — which is exactly the bug the first `clock-in-out` render had.
- **Nothing real.** See `demo-data.ts`. If a video needs data the seed does not
  have, extend the seed; never point a flow at another organisation.
