# My work — design handoff

**Three** rows of `docs/home-widgets.md` folded into one: §3.2 *Today's jobs*,
§3.5 *This week* and §3.3 *My next job*. The catalogue goes **27 → 25**, and
this is still one sentence.

> **Scope.** One widget. Nothing else on the home screen changes.

---

## The one idea

**Access decides this widget three times, and only two of them are the same
question.**

```
WHICH MODULES YOU HOLD   →  the SHAPE     strip + jobs, or strip + shifts
WHICH JOBS YOU CAN SEE   →  the CONTENT   yours, your site's, or the org's
WHOSE THE FIRST JOB IS   →  the DECISION  a verb, or no verb at all
```

Resolve the shape, fill it, then decide whether the first row grows. Three
shapes × four reaches, and they do not interact — which is the only reason
twelve combinations are tractable.

**Read `ACCESS.md` first.** Everything else assumes it.

---

## The files

| | |
|---|---|
| **`ACCESS.md`** | The three axes. The four paths through `canAccessTask()`, the three module shapes, and when there is no verb. **Start here.** |
| **`SPEC.md`** | The widget: the strip, the active row, the verb, the data — and the alternative that was considered. |
| **`STATES.md`** | Seven states, three of them empty and not interchangeable. What the strip and the active row do in each. |
| **`FINDINGS.md`** | Eight things wrong today, with what the code actually says. |
| **`../icons/`** | The whole icon system — 43 marks in one folder, with the construction law and the five that already exist in `glyphs.tsx`. |

Visual reference — every shape, face, state and mark on one page:
**https://claude.ai/artifact/9GcjYhxdrUEaL7NAVstB7U**
(private; the board is `② My work — ②+⑤+③ in one row`)

---

## Build in this order

### 1. Fix the entitlement — on its own, first

`my-tasks` is gated **"Who: Everyone."** A member with `clock` and no `tasks`
is shown an empty jobs card every day, forever. Change it to
`hasModule('tasks') || hasModule('clock')`.

Worth landing alone, before anything else here. It is a live bug and the fix is
one condition.

### 2. Move `week` above `my-tasks` in the default order

One line. Context belongs above detail, and this is true whether or not
anything merges.

**Stop here and reassess.** Steps 1 and 2 deliver most of the value for almost
no risk.

### 3. Fold ⑤ in — the strip drives the list

One row, `my-work` — `SPEC.md` §2–3. `week` retires.

### 4. Fold ③ in — the active row

The first row grows and carries the verb. `SPEC.md` §4. `next-job` retires
without ever being built.

Move `../icons/` (the whole folder — see its README) into `apps/mobile/src/components/home/` and
export it from that folder's index. **No edits needed** — its
`import … from './glyphs'` is already written for the destination, which is
also why it does not compile where it currently sits.

### 5. Visibility by all four paths

`ACCESS.md` §2. The space-scoped face is the one that does not exist today.

---

## The question that decides steps 3 and 4

**How many members hold exactly one of `tasks` / `clock`?**

- **Almost none** → stop after step 2. Reorder-only is genuinely fine, costs
  nothing, and keeps the registry flat — the property §2.1 says to protect
  above any single feature.
- **A real number** → fold. Those members are the ones currently getting a
  broken screen.

§6 of `home-widgets.md`: *count production before gating anything*. The same
rule applies to un-gating.

---

## Two decisions that are not mine

**1. Does the strip drive the list, or navigate away?**
This is the whole argument for step 3. If tapping a day still goes to
`/tasks`, folding ⑤ in buys about 60px and costs a registry row — do not do it.

**2. Does `week` widen to tasks-only members?**
§3.5 is *"anyone with shifts."* Its own data section already reads *"plus task
dates already in hand"*, so the capability exists and only the gate is wrong.
Required for step 3, sensible without it.

---

## Rules that are not style

- **Never `tasksApi.list()` directly.** Go through `useHomeTasks()` — the
  phone's rows with unsent changes on top.
- **⑤ and ⑦ are different sentences.** "Nothing scheduled today" is a fact the
  server confirmed. A phone with no copy and no signal knows nothing and must
  not claim otherwise. A member who reads it wrong at 06:40 goes home.
- **The verb is data.** `FlowStatus.label`, organization-authored. Never
  hardcode Accept / On my way / Arrived / Start.
- **Primary = the next transition by `position`; everything else in the `⋯`.**
  `transitions` is an arbitrary-length array.
- **No verb when the job is not yours.** Access decides whether there is a
  decision, not only what it says.
- **The verb stays live offline.** The transition queues and the row shows
  `SENDING`. A greyed button on a phone with no signal is the app refusing work
  it can do.
- **`BLOCKED` opens the Report sheet**, pre-filled. Not a second way to say the
  same thing.
- **Mine always leads.** Every face showing other people's work shows the
  reader's first, grouped and labelled.
- **Reach changes the form, not the length.** At org-wide the list becomes a
  figure strip; `open-jobs` already owns the board question.
- **Selecting a day is a read.** §4 forbids writing on render.
- **The card itself is not a tap target.** Only its parts.
- **`contrast` on a glyph is the surface it sits on.** Wrong value does not
  error; it draws a grey ghost across the mark.

---

## How to check it worked

- A member with `clock` and no `tasks` sees **shifts**, not an empty jobs card.
- A member with `tasks` and no `clock` sees **the strip**, dots and no bars.
- Tapping Thursday changes the list **without leaving the screen**.
- A space supervisor sees **two groups** — theirs, then the site's.
- A shared-space supervisor sees rows and **no verb**.
- A task on a custom three-status workflow shows **that workflow's labels**,
  not Accept / On my way / Arrived / Start.
- Airplane mode mid-session keeps the rows, adds an age chip, and **the verb
  still works**.
- A fresh install with no signal says **"not on this phone yet"**, never
  "nothing scheduled".
