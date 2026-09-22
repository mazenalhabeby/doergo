# Home widgets — the full catalogue

> A specification for turning the four hard-coded home screens into one
> registry of blocks, composed per person from what they are entitled to.
>
> Endpoints below are the real ones, taken from `apps/mobile/src/lib/api/`.
> Permission and module keys are the real ones, taken from the `roles` table
> and `packages/shared/src/billing/`.

---

## 1. Why this exists

Today there are four home screens — `admin-dashboard.tsx`, `hybrid-home.tsx`,
`freelancer-home.tsx`, `full-time-home.tsx` — each with its own fetching,
skeletons and error handling. The duplication is not theoretical: **all four
carried the same "one unguarded call kills the whole screen" bug**, because the
logic was written four times and fixed once.

Meanwhile the thing that actually varies between people is not their `Role`.
It is what they *do*: a technician wants to clock in, a sales rep wants their
client book, an admin wants to see the floor. Role is a poor proxy for that,
and since 2026-07-16 it is barely a proxy at all — `Role` is only
`ADMIN | EMPLOYEE | CUSTOMER`, and everything meaningful lives in an
`AccessRole`.

---

## 2. The model

### 2.1 A widget is a registry row

```ts
{
  key:   'shift-clock',
  title: 'widgets.shiftClock',              // i18n key, never a sentence
  requires: {
    module:     'time_tracking',            // per-space module, or null
    permission: 'canViewSpaceAttendance',   // AccessRole permission, or null
    self:       true,                       // or: it is about the viewer
  },
  Component: ShiftClockCard,
}
```

Adding a widget is adding a row. Anyone can read one file and know the whole
set — that property is worth protecting more than any individual feature below.

### 2.2 A layout is an ordered list of keys

```ts
['shift-clock', 'my-tasks', 'my-route']
```

No coordinates, no grid, no per-cell spans. One column, each widget at its
natural height. A positioned grid is an order of magnitude more work, worse on
a phone, and can be corrupted into a state that will not render. An ordered
list cannot.

Stored server-side as `HomeLayout { userId, keys[], hidden[] }` and pulled like
any other record, so it survives a reinstall and works offline. Not
AsyncStorage.

### 2.3 Resolution order

```
registry
  → default order for this profile   (composed server-side)
  → the member's saved order + hidden set
  → filter by entitlement            ← LAST, every render
```

### 2.4 Four rules

1. **Entitlement is asked once.** One `availableWidgets(user)` feeds both the
   home and the picker. Asked separately they drift — which is exactly how the
   clock-in list ended up stricter than the clock-in check it mirrored, hiding
   two of three workspaces from a member assigned to all three.
   `activeAssignmentWhere()` exists because of that.
2. **Filtered last, every render.** A stored key that is no longer allowed is
   skipped silently — never an error, and **never deleted from storage**, so a
   space reassignment that is later undone does not destroy the layout.
3. **Each widget fails alone.** A widget that cannot load renders its own empty
   state and never throws upward. See
   `apps/mobile/src/offline/tasks/list-failure.ts`.
4. **Nothing is visible-then-refused.** A widget checks its module *and* its
   permission itself. The opposite is already in the codebase's history: the
   Workflows tab opened, the builder opened, and the 402 arrived at save.

### 2.5 One row, two faces

The same widget serves opposite roles depending on the permission held.
"Hours" is *my* hours to a worker and *hours waiting on me* to a manager;
"Expenses" is *what I spent* versus *what I must review*. Prefer one registry
row whose permission decides its face over two rows that can drift apart.

---

## 3. The catalogue

Each entry states: the question it answers, who sees it, where the data comes
from, what it renders, its empty state, what happens offline, where a tap goes,
and the build cost.

Cost key: **A** = the component already exists, extract it · **B** = the screen
and endpoint exist, a summary card is missing · **C** = needs backend work.

---

### 3.1 Shift clock — `shift-clock`

**Answers** Am I on the clock, since when, and when is my next rest?

**Who** Module `time_tracking`. About the viewer, so no permission needed —
but only for members who actually clock (a member with no workspace assignment
has nothing to clock into).

**Data** `GET /attendance/status`, `GET /attendance/breaks/status`.
Read through `src/offline/attendance/use-shift.ts`, **not** the response cache
— those two paths are in the `NEVER` list in `response-cache.ts` on purpose: a
kept answer would reply first, older, and pretend to be fresh.

**Renders** Elapsed time since clock-in · the workspace · counted time today ·
next rest due · a single primary action (Clock in / Clock out).

⚠️ **Never the words "paid" or "unpaid".** Say *counted*, *worked*, *approved*.
Two clocks exist — `clockInAt`/`clockOutAt` are evidence, `countedStartAt`/
`countedEndAt`/`paidMinutes` are what payroll reads — and only the counted
figure belongs on a home screen.

**Empty** "Not on the clock" with the clock-in action. Never blank.

**Offline** Fully works. The clock-in queues through the outbox and the card
says so.

**Tap** `/attendance`

**Cost** A — `ShiftClockCard` exists.

---

### 3.2 Today's jobs — `my-tasks`

**Answers** What am I doing today?

**Who** Everyone. What it *shows* narrows by `canViewAllTasks`: without it,
only the viewer's own jobs.

**Data** `GET /tasks` through `useHomeTasks()` — the phone's rows with unsent
changes laid on top, so this and the Tasks tab cannot disagree.

**Renders** Up to 3–5 rows: time · title · address · status chip. A count in
the header.

**Empty** "Nothing scheduled today." — and note this must be *true*, not the
result of a failed fetch. That distinction is the whole reason
`list-failure.ts` exists.

**Offline** Reads the phone's copy with a freshness label.

**Tap** row → `/task/[id]`, header → `/tasks`

**Cost** A

---

### 3.3 My next job — `next-job`

**Answers** Just the one thing — what now?

**Who** Everyone who executes work.

**Data** Same source as `my-tasks`, first row by due time.

**Renders** One job, large: title, address, when, and the action its status
allows (Accept / On my way / Arrived / Start). Deliberately a single decision.

**Empty** Hidden entirely when there is no next job — this is the one widget
that should disappear rather than show an empty state.

**Offline** Works; the status change queues.

**Tap** `/task/[id]`

**Cost** C — the status-action logic exists on the task screen but needs
lifting into a card.

---

### 3.4 Today's route — `my-route`

**Answers** How many stops, how far, when am I back?

**Who** Module `tracking`. About the viewer.

**Data** `GET /routes` (kept offline), `POST /routes/optimize` **never** from a
widget — it is billed per request and must only run on an explicit Optimize.

**Renders** A road-following line with stop pins · stops · distance · expected
return.

⚠️ Pins with no line between them means **no routing engine is configured** —
the nearest-neighbour fallback returns an order and no geometry.

**Empty** "No route planned today."

**Offline** Shows the kept plan; the local nearest-neighbour ordering still
works.

**Tap** `/route-planner`

**Cost** B

---

### 3.5 This week — `week`

**Answers** What does my week look like?

**Who** Anyone with shifts.

**Data** `GET /employees/availability`, plus task dates already in hand.

**Renders** Seven day chips, today emphasised, a dot where there is work.

**Empty** Renders regardless — an empty week is information.

**Offline** Kept.

**Tap** a day filters `/tasks`

**Cost** A — `WeekCalendar` exists.

---

### 3.6 Who is on the clock — `who-is-on`

**Answers** Who is working right now, and where?

**Who** `canViewSpaceAttendance` — the same permission
`GET /attendance/approvals/pending` enforces, so the row, the request and the
server's answer all agree: an admin org-wide, a supervisor in their own space,
nobody else.

**Data** `GET /attendance/active-entries`, `GET /attendance/breaks/active`,
`GET /locations`.

**Renders** "6 of 9" · initials of who is on · a per-workspace split · who is
on a break.

**Empty** "Nobody is on shift right now." — a true and useful statement.

**Offline** Not kept. Presence is a *now* question; stale is wrong, not old.
Shows "needs a connection".

**Tap** `/manage/attendance`

**Cost** A

---

### 3.7 Hours waiting on you — `pending-hours`

**Answers** Whose shifts need a decision from me?

**Who** `canViewSpaceAttendance` (read) and `canApproveOvertime` /
`canReconcileAttendance` to act.

**Data** `GET /attendance/approvals/pending` — asked as a **count** (page 1,
limit 1, total from the envelope), never the rows. A member without the grant
never sees the row and so never pays for the request.

**Renders** A count, then 2–3 names with the shift date and worked time.

**Empty** "Nothing waiting."

**Offline** Not kept — it is a queue that moves.

**Tap** `/manage/attendance`

**Cost** A

---

### 3.8 Nobody clocked in — `no-shows`

**Answers** Who was expected this morning and has not arrived?

**Who** `canViewSpaceAttendance`.

**Data** `GET /attendance/no-shows`.

**Renders** Names, expected start, how late. Severity colour by lateness.

**Empty** Hidden when empty — an all-clear needs no space.

⚠️ Route notifications through the workspace's watchers, not to every org
admin. That mistake put the owner on every late departure once already.

**Tap** `/manage/attendance`

**Cost** B

---

### 3.9 Jobs still open — `open-jobs`

**Answers** How much work is outstanding?

**Who** `canViewAllTasks`.

**Data** `GET /tasks/counts` — the endpoint exists precisely so a summary does
not fetch rows.

**Renders** Open · urgent · unassigned · completed today, as four figures.

**Empty** Renders regardless.

**Offline** Derivable from the phone's copy.

**Tap** `/tasks` with the matching filter

**Cost** A

---

### 3.10 Unassigned jobs — `unassigned`

**Answers** What has nobody picked up?

**Who** `canAssignTasks`.

**Data** `GET /tasks?assignedToId=null` (a filter, not a new endpoint).

**Renders** A count and the oldest 3, with an Assign action.

**Empty** Hidden.

**Tap** `/tasks` filtered

**Cost** B

---

### 3.11 Clients to follow up — `crm-today`

**Answers** Who is owed a call, and whose quote is going cold?

**Who** Module `crm` **and** one of `crmViewOwn` / `crmWork`.

⚠️ CRM permissions resolve off the member's **ORG** role only
(`resolveCrmCaps`), so a space-scoped sales role grants nothing while looking
configured. ⚠️ Never grant a sales role `canViewAllTasks` — the resolver treats
it as the legacy "read every client" and silently hands over the whole book.

**Data** `GET /customers` plus reminders.

**Renders** 3–4 clients: name · why they are surfacing · how long it has been.

**Empty** "Nobody is waiting on you."

**Offline** Kept — `/customers` is in the allow-list.

**Tap** `/customer/[id]`

**Cost** B

---

### 3.12 What I hold — `my-assets`

**Answers** Which van, laptop, equipment is mine right now?

**Who** Module `assets`. **No permission** — the filter *is* the authorization,
which is why `GET /assets/mine` carries none.

**Data** `GET /assets/mine`, `GET /assets/log/due-mine`.

**Renders** Each held item, plus anything due on it (a service, a check).

**Empty** Hidden when the member holds nothing — this is the common case and
an empty card would be noise on most people's home screen.

**Offline** Kept.

**Tap** `/my-assets`

**Cost** B

---

### 3.13 What I spent — `my-expenses`

**Answers** What did I file, and what happened to it?

**Who** Module `assets` + custody. ⚠️ Filing is authorised by **custody on the
receipt's date**, never by `canManageAssets` — a driver is not an asset manager
and never will be.

**Data** `GET /assets/expenses/mine`.

**Renders** This month's total · how many are still submitted (and so counting
for nothing yet) · the last entry.

⚠️ Totals sum `status = RECORDED` only. A submitted expense counts for nothing
until the office accepts it.

**Empty** Hidden unless the member holds an asset.

**Offline** Kept; new entries queue.

**Tap** `/asset-expense`

**Cost** B

---

### 3.14 Expenses to review — `expenses-pending`

**Answers** What is the office's queue?

**Who** read `canViewAllTasks`, act `canManageAssets`.

**Data** `GET /assets/expenses/pending`.

**Renders** Count, total value, oldest.

**Empty** Renders nothing at all when the queue is empty.

**Tap** the review queue

**Cost** B

---

### 3.15 Proposals waiting — `proposals-pending`

**Answers** Which pages have members sent in to become records?

**Who** `canManageAssets`, org-wide or in a space, narrowed by
`mayReviewProposal`.

**Data** `GET /assets/proposals/pending`.

⚠️ Routing here has a **fallback**, unlike attendance: a proposal reaching
nobody is work that stops, and the member waits forever and stops sending
pages in.

**Renders** Count and who sent what.

**Empty** Hidden.

**Cost** B

---

### 3.16 Documents needing you — `documents-due`

**Answers** What must I hand in, and what of mine is expiring?

**Who** Everyone, about themselves.

**Data** `GET /documents/requirements`, `GET /documents/pending`.

**Renders** What is required and not yet sent · what expires soon, with days
remaining · what awaits my signature.

⚠️ The **subject exemption** is load-bearing: a member always sees what is
required *of them*, even for a document type restricted to other roles.
Otherwise restricting a type leaves somebody unable to hand in their passport
while a screen goes on chasing them for it.

**Empty** Hidden when nothing is due.

**Offline** Kept.

**Tap** `/documents`

**Cost** A — `DocumentsReminderCard` exists.

---

### 3.17 Credentials expiring — `credentials`

**Answers** Whose licences lapse soon, across the team?

**Who** `canViewMemberDocuments`, **and** the document type must be visible to
the viewer's role (`DocumentType.visibleToRoleIds`; empty = no restriction).

⚠️ Refusals here are **404, not 403** — a 403 confirms a document exists for
that person on that date.

**Data** `GET /documents/compliance`.

**Renders** Count by urgency, the three nearest.

**Empty** Hidden.

**Cost** B

---

### 3.18 Time off — `time-off`

**Answers** What leave have I booked, and who is away?

**Who** Everyone, about themselves; the team view needs rota permission.

**Data** `GET /employees/time-off`.

**Renders** My next booked leave · balance · who else is off this week.

**Empty** "No leave booked."

**Offline** Kept; requests queue.

**Tap** `/time-off`

**Cost** B

---

### 3.19 Leave to approve — `leave-pending`

**Answers** Which requests wait on me?

**Who** `canManageRota` / `canApproveOvertime`.

**Data** `GET /employees/time-off?status=PENDING`.

⚠️ Cover verdicts are computed **server-side**; do not recompute them in a
widget. ⚠️ `minCover = 0` means **not set**, not "nobody needed".

**Renders** Count, and whether approving would break cover.

**Empty** Hidden.

**Tap** `/manage/time-off-requests`

**Cost** B

---

### 3.20 Overtime — `overtime`

**Answers** What is waiting for a decision or a signature?

**Who** Option `overtime`. Two faces: mine to sign, versus mine to approve
(`canApproveOvertime`).

**Data** `GET /overtime/active`, `GET /overtime/pending-approvals`,
`GET /attendance/extra-time/pending`.

⚠️ Approving **moves `expectedClockOutAt`**, which is why no special case is
needed to count it — the same `min()` applies. ⚠️ One row per round: the flow
loops, and `OvertimeRequest.timeEntryId` used to be `@unique`, so a shift could
hold one record ever.

**Renders** Count, the round's state, the action.

**Empty** Hidden.

**Tap** `/overtime/[id]`

**Cost** B

---

### 3.21 Join requests — `join-requests`

**Answers** Who is asking to join?

**Who** `canManageUsers`.

**Data** `GET /join-requests`.

**Renders** Count and the newest names.

**Empty** Hidden.

**Tap** `/manage/join-requests`

**Cost** B

---

### 3.22 Messages — `messages`

**Answers** Who is waiting on a reply?

**Who** Option `live_chat`.

**Data** `GET /chat/conversations`.

⚠️ Cross-org chat is authorised by a **shared space, re-resolved on every
send** — unsharing freezes the thread. A widget must not cache who is
reachable.

**Renders** Unread count, the last two senders.

**Empty** Hidden.

**Tap** `/chat`

**Cost** B

---

### 3.23 Sync — `sync`

**Answers** What is still on this phone, and does anything need me?

**Who** Offline mode on for the org.

**Data** Local only — the outbox. **No request at all.**

**Renders** Waiting · needs attention · last synced. Uses the existing
freshness and long-offline wording.

**Empty** Hidden when the queue is empty and the last sync is recent.

**Tap** `/sync`

**Cost** A

---

### 3.24 Invoices — `invoices`

**Answers** What is outstanding, and what is ready to issue?

**Who** Option `invoicing` + `canViewReports`.

**Data** the invoice list endpoint, as counts.

⚠️ A draft's PDF is watermarked; only `ISSUED` produces a clean document. Do
not offer "send" from a widget on a draft.

**Renders** Outstanding total · overdue count · drafts ready.

**Empty** Hidden.

**Cost** B

---

### 3.25 Portal requests — `portal-requests`

**Answers** What have clients raised?

**Who** Module `client_portal`.

**Data** `GET /portal/requests` (staff side).

**Renders** New and unanswered counts.

**Empty** Hidden.

**Cost** C

---

### 3.26 Saved report — `saved-report`

**Answers** The one number I check.

**Who** Option `reports_builder` + `canViewReports`.

**Data** the analytics endpoint with a saved report id held in the layout row.

⚠️ Report dataset and column names come from `REPORT_LABELS` in five
languages; organization-authored names and row values stay as written.

**Renders** One figure with its label and a trend.

**Empty** "Pick a report."

**Cost** C — the only widget needing per-instance configuration, which is why
it is last.

---

### 3.27 Quick actions — `quick-actions`

**Answers** Start something in one tap.

**Who** Each action carries its own gate: New job (`canCreateTasks`), Add
client (CRM + `crmEditInfo`), Log expense (custody), Scan card (CRM),
Send document (`canIssueDocuments`).

**Renders** Up to four tiles — only the ones the viewer can actually use.

**Empty** Hidden when fewer than two remain.

**Cost** A

---

## 4. Deliberately excluded

| Not a widget | Why |
|---|---|
| **Live map** | Stale location is wrong, not merely old. It belongs on a screen that refreshes, not a card that is glanced at. |
| **Billing / what you pay** | A monthly admin errand, not a daily question. |
| **Full activity feed** | A summary line is a widget; a feed is a screen. |
| **Anything that writes on render** | A widget must never cause a proration, a route optimization, or a notification. |

---

## 5. Build order

1. **Registry + the nine cost-A widgets**, rendering the current four homes
   through it with fixed defaults. **No user-facing change.** If the homes
   render identically, the architecture is sound.
2. **Server-composed defaults per profile**, replacing the four hard-coded
   variants.
3. **The picker** — a list with toggles and up/down arrows. Not a drag canvas.
4. **Cost-B widgets**, in the order real users ask for them.
5. **Cost-C widgets**, last.

⚠️ Do not start at step 3. Letting people assemble their own home hands the
design problem back to the people who reported the app was hard to use.

---

## 6. Traps worth restating

- **Never pass a module key to `hasPlanFeature` / `PlanGate`.** It opens with
  `if (!isAddOn(key)) return false`, so it answers no for everybody —
  *including buyers*. Custom fields were invisible in the New Task dialog on
  exactly this.
- **An Option change must invalidate the cached user** (`orgAddOns` rides on
  the gateway's Redis-cached user, indexed by organization), or the widget set
  takes up to a minute and a hard refresh to change.
- **Count production before gating anything.** Before every gate added so far,
  the existing usage was counted first and nothing in use lost access.
- **Data fetching fragments.** The homes currently batch into one
  `Promise.all`. Eight independent widgets each fetching their own turns one
  request into eight on every home open. Decide up front: one batched read, or
  off the offline store.
