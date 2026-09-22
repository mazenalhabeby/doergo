# `my-work` — the widget

> **Three** catalogue rows folded into one: §3.2 *Today's jobs*, §3.5 *This
> week* and §3.3 *My next job*. The catalogue goes **27 → 25**.
>
> Read `ACCESS.md` first — everything here assumes it.

---

## 1. Why three rows and not three

**⑤ folded in** because half the merge already happened in the data: §3.5 reads
`/employees/availability` **plus task dates already in hand**. The strip and
the list were always drawing from one pool. What the merge adds is the thing
two separate cards structurally cannot do — **tapping a day changes the list
underneath it.**

**③ folded in** because the alternative was worse. Keeping `next-job` as its
own card means the first row of the list is the same job, shown twice. The fix
for that — having the list drop its first row when `next-job` is present —
makes **two registry rows know about each other**, and §2.1 protects registry
legibility above any single feature.

Folding the decision into the first row removes the problem instead of managing
it. There is no second widget, so there is nothing to coordinate.

> ⚠️ **If the strip stays a read-only ribbon that navigates out to `/tasks`,
> do not fold ⑤ in.** It then buys about 60px and costs a registry row. The
> interaction is the argument, not the tidiness.

---

## 2. The shape

One **well** — `surface-well`, `radius-panel` 26px, `space-5` padding. Not
glass: this is a list, and a list over a gradient is what dies in sunlight.

```
┌──────────────────────────────────────┐
│ My work                     All 3 ›  │  h3 + pill
│                                      │
│  M    T    W   [T]   F    S    S     │  the strip — 54px, radius-full
│  ▬    ▬    ▬    ▬    ▬               │  a bar is a shift
│  ••   •   •••  •••                   │  dots are jobs, max 3
│                                      │
│ TODAY · 8H AT BILLA AG               │  eyebrow, accent
│ ┌──────────────────────────────────┐ │
│ │ ● ASSIGNED TO YOU                │ │  the active row — surface-raised
│ │ Replace compressor valve         │ │  radius 20, one step up from the well
│ │ 09:30 · 11 km · Anna Müller      │ │
│ │ [ Accept ]        (call) (⋯)     │ │
│ └──────────────────────────────────┘ │
│ ● Quarterly filter service   13:00   │  plain rows
│ ● Site handover — REWE       16:15   │
└──────────────────────────────────────┘
```

### The strip

Seven days, Monday first, `radius-full` capsules 54px tall.

| Mark | Means |
|---|---|
| A bar | a shift that day |
| Dots, up to 3 | jobs that day |
| Jade fill + 1.5px ring | the day being shown |
| Nothing | no work — still drawn, still tappable |

**An empty week is information** (§3.5), so the strip renders regardless.

### The active row

The **first job of the selected day, when it is the reader's own**, raised one
step out of the well and carrying its decision.

Everything below it stays a plain row. There is no second card.

> ⚠️ **No active row when the first job is not yours.** A shared-space
> supervisor sees rows and no verb — none of those jobs are theirs to act on.
> Access decides whether there is a decision at all, not only what it says.

---

## 3. Interaction

| Tap | Does |
|---|---|
| A day in the strip | **changes the list in place.** No navigation |
| The verb | performs the transition |
| A disc | calls, navigates, or opens the overflow |
| A plain row | `/task/[id]` |
| The header pill | `/tasks` |
| The card itself | nothing. It is not a target |

Selecting a day is a **read**. §4 forbids writing on render and this does not.

Today is selected on mount, always.

---

## 4. The verb

**The ladder is data, not code.** A task's flow is a `StatusWorkflow` row;
`FIELD_SERVICE_FLOW` in `packages/shared/src/types/task-flow.ts` is only the
fallback when it has none.

```
ASSIGNED     → [ACCEPTED, CANCELED]    Accept
ACCEPTED     → [EN_ROUTE]              On my way
EN_ROUTE     → [ARRIVED]               I have arrived
ARRIVED      → [IN_PROGRESS]           Start work
IN_PROGRESS  → [COMPLETED, BLOCKED]    Finish
```

⚠️ **Labels come from `FlowStatus.label`** — organization-authored, so they
stay as written, the way report names do. Never hardcode the five verbs.

⚠️ **An `office` workflow has no `gps` capability**, so no *On the way* and no
*Arrived*. Three rungs, not six. Read `transitions` and offer them.

⚠️ **Two transitions, never two buttons.** §3.3 calls it "deliberately a single
decision"; the flow says otherwise twice. The rule:

> **The primary is the next transition by `position`. Everything else goes in
> the `⋯`.**

That survives a workflow with four onward transitions, which a hardcoded
one-button-plus-one-link does not. Two equal buttons is how somebody declines
a job by accident.

⚠️ **`BLOCKED` is Report an issue.** Same act as the Report disc on the shift
card. It opens that sheet pre-filled with this job — not a second, parallel
way to say the same thing.

### The discs re-rank with the state

| State | Jade disc | Ink disc |
|---|---|---|
| `ASSIGNED` | **Call** — before accepting, the useful act is often a question | `⋯` |
| `EN_ROUTE` | **Navigate** | Call |
| `IN_PROGRESS` | **Call** | `⋯` |

The meta line changes too: distance → an ETA once they are moving → a timer
and an evidence count once they are working. Same slot, different fact.

---

## 5. Data

```
GET /tasks                     through useHomeTasks()
GET /employees/availability    the rota — only for members who hold `clock`
```

⚠️ Never `tasksApi.list()` directly. It was the one unguarded call on every
home variant and it took whole dashboards down.

⚠️ Week dots come from task **dates already in hand**. No per-day fetch.

---

## 6. The three shapes

Full detail in `ACCESS.md` §1.

**tasks + clock** — bars and dots; the active row is a job, with the shift
named above it.

**tasks only** — dots, no bars; the active row is a job.

**clock only** — bars, no dots; **the active row is the shift.** This is the
member who is shown an empty jobs card today, forever.

---

## 7. The alternative, recorded

**Reorder only.** Keep `my-tasks` and `week` as two rows and move `week` above
`my-tasks` — one line.

| | Reorder | Fold |
|---|---|---|
| Context above detail | ✅ | ✅ |
| A day changes the list | ❌ | ✅ |
| Works for tasks-only | ❌ `week` is *"anyone with shifts"* | ✅ |
| Works for clock-only | ❌ empty jobs card forever | ✅ shows shifts |
| The decision lives with the job | ❌ | ✅ |
| Registry stays flat | ✅ | ❌ one row is three sentences |

Reorder-only is genuinely fine **if almost everybody holds both modules**.
Count the members holding exactly one before choosing — §6 of
`home-widgets.md`: *count production before gating anything*.
