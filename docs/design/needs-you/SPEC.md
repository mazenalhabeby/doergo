# Spec — Needs you

Widgets §3.14 `expenses-pending`, §3.15 `proposals-pending`, §3.19
`leave-pending` and §3.21 `join-requests`, folded into one registry row.
The catalogue goes **21 → 18**.

Visual reference: board **⑤ Needs you — four queues in one row** at
https://claude.ai/artifact/9GcjYhxdrUEaL7NAVstB7U

---

## 1. Why one row and not four

They are the same widget four times:

| | a queue | a count | hidden when empty | taps to its own screen |
|---|---|---|---|---|
| §3.14 | ✓ | ✓ | ✓ | ✓ |
| §3.15 | ✓ | ✓ | ✓ | ✓ |
| §3.19 | ✓ | ✓ | ✓ | ✓ |
| §3.21 | ✓ | ✓ | ✓ | ✓ |

Only the permission differs — and since each is *"hidden when empty"*, four
separate rows means four registry entries that are individually absent most of
the time. That is four things to keep consistent for a screen that shows one
of them.

**Read `REGISTRY.md` before building.** The row cannot be written under §2.1 as
it stands.

---

## 2. Anatomy

```
┌─ well, radius 28 ─────────────────────────┐
│  NEEDS YOU                      4 QUEUES  │
│                                           │
│  15                                       │  56pt, weight 200
│  waiting on you                           │
│  OLDEST HAS WAITED 11 DAYS                │  mono 11pt
│                                           │
│  [€]  4 expenses                11d   ›   │
│       €1,240 · oldest 11 days             │
│  [▤]  7 leave requests        2 short ›   │
│       2 would break cover                 │  ← warn
│  [⇩]  2 proposals                4d   ›   │
│       Karim Bauer · Lisa Sommer           │
│  [+]  2 join requests          today  ›   │
│       Newest today                        │
└───────────────────────────────────────────┘
```

**The hero is the sum across the queues this viewer holds**, and the line under
it is the age of the oldest item anywhere in them. Those two numbers together
say whether to open the card at all.

Height scales with the number of *grants*, not the size of the queues: one row
per queue, at most four, ~86pt each.

---

## 3. The rows

Every row is a count, a second line, an age and a chevron. What changes is the
second line — the one fact that decides whether you open it now.

| Row | Second line | Why that and not a size |
|---|---|---|
| **§3.14 Expenses** | total value, oldest | "Four" means nothing. "€1,240, eleven days" means somebody is out of pocket |
| **§3.19 Leave** | how many break cover | The only second line that is a **warning** rather than a measurement |
| **§3.15 Proposals** | who sent them | A page nobody reviews stops a person working. A name is harder to leave alone than a number |
| **§3.21 Join requests** | how new the newest is | The one queue where fast beats big — somebody is sitting at a door |

**Ordering: oldest item first, not biggest count first.** A queue of two that
has waited eleven days is worse than a queue of seven from this morning.

---

## 4. The cover line

The only row whose second line is a verdict rather than a figure.

```ts
// packages/shared/src/attendance/cover.ts
floorStatus(here, minCover)   // 'ok' | 'tight' | 'short'
coverNeedsAttention(level)    // level !== 'ok'
```

⚠️ **Call them. Never re-derive.** §3.19 says cover is computed server-side, and
`FINDINGS.md` §1 shows the rule is already a function that handles the
`minCover <= 0` case correctly.

Render the cover line **only** when `coverNeedsAttention()` is true. Otherwise
the second line is the ordinary one: how many, oldest.

---

## 5. Data

| Row | Endpoint | Asked as |
|---|---|---|
| Expenses | `GET /assets/expenses/pending` | `?limit=` small — count plus the oldest |
| Leave | `GET /employees/time-off?status=PENDING` | count plus cover verdicts |
| Proposals | `GET /assets/proposals/pending` | count plus the senders |
| Join requests | `GET /join-requests` | count plus the newest |

⚠️ **Four requests, and a viewer only pays for the rows they hold.** A row
whose grant is absent makes no request at all — §2.4 rule 4, *nothing is
visible-then-refused*, applied before the network rather than after it.

⚠️ Each request fails alone. One queue erroring hides **its** row, not the
card. `apps/mobile/src/offline/tasks/list-failure.ts` is the model.

---

## 6. Offline

Not kept. Every one of these is a queue that moves, and §3.14/§3.15/§3.19/§3.21
all say so or imply it. A stale count invites somebody to think they have
already dealt with something.

With no connection the card is **absent**, not empty — the same as having no
grants. There is nothing useful to say.

---

## 7. Copy

| | |
|---|---|
| Header | `NEEDS YOU` · `{n} QUEUES` |
| Hero | `{total}` · `waiting on you` |
| Hero sub | `OLDEST HAS WAITED {age}` |
| Expenses | `{n} expenses` · `{total} · oldest {age}` |
| Leave | `{n} leave requests` · `{n} would break cover` |
| Proposals | `{n} proposals` · `{names}` |
| Join | `{n} join requests` · `Newest {age}` |

No empty strings are needed: **the card is not drawn when every queue is
empty.** See `STATES.md` ③.
