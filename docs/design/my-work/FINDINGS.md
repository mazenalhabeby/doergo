# What is wrong today — `my-work`

---

## 1. A clock-only member is shown an empty card forever

§3.2 gates `my-tasks` on **"Who: Everyone."**

A member with the `clock` module and no `tasks` module has no jobs and never
will. They get a card that says *"Nothing scheduled today"* every day it is on
their screen, about work they cannot be assigned.

**Fix:** `hasModule('tasks') || hasModule('clock')`, with the shape following
which — see `ACCESS.md` §1. Merged, that member gets their shifts instead of
nothing.

---

## 2. §3.2 describes one of four visibility paths

The doc: *"narrows by `canViewAllTasks`."*

`canAccessTask()`: the boundary, the assignee check, `canViewAllTasks`, **and
`viewAllSpaceIds`** — the same grant held by a space role.

Path 4 has its own bug history, in its own comment:

> *"a member granted 'view all tasks' in their workspace fell through to 'only
> what is assigned to me' — and could create a task in that workspace and then
> not be allowed to open it."*

Anything re-deriving visibility from `canViewAllTasks` alone reproduces it.

---

## 3. The two widgets are in the wrong order

`week` is context for `my-tasks`. Below it, the reader gets the detail and then
has to scroll past it to find the frame.

**Free fix:** move `week` above `my-tasks` in the default order, whether or not
they merge. One line.

---

## 4. The strip cannot change the list

Two registry rows that do not know about each other. Tapping a day navigates
out to `/tasks` filtered — leaving the home screen to answer a question the
home screen was already holding the data for.

---

## 5. `week` is unavailable to the people who would use it

§3.5 is *"anyone with shifts."* A tasks-only member has jobs spread across a
week and no way to see that shape — the one widget that would show it is gated
on something they do not have.

Its own data section already reads *"plus task dates already in hand"*, so the
capability is there; only the gate is wrong.

---

## 6. §3.3 describes a ladder that is not hardcoded

*"the action its status allows (Accept / On my way / Arrived / Start)"* —
those four verbs are `FIELD_SERVICE_FLOW`, which
`packages/shared/src/types/task-flow.ts` describes as the **fallback**:

> *"Built-in field-service flow — used when a task has no custom workflow so
> the existing technician experience is byte-for-byte preserved."*

A task's real flow is a `StatusWorkflow` row with arbitrary
`WorkflowStatus[]`, each carrying its own `label` and `transitions`. An
`office` workflow has no `gps` capability and therefore no *On the way* and no
*Arrived* — **three rungs, not six**.

Anything that hardcodes the five verbs is wrong for every organization that
configured its own flow.

---

## 7. Two statuses have two transitions, not one

```ts
ASSIGNED     transitions: ['ACCEPTED', 'CANCELED']
IN_PROGRESS  transitions: ['COMPLETED', 'BLOCKED']
```

§3.3 calls the widget *"deliberately a single decision"*. It is a single
decision four times and a fork twice — and `transitions` is an array of
arbitrary length, so a custom workflow can fork wider.

The rule that survives that: **primary = the next transition by `position`,
everything else in the overflow.** One button plus one link handles exactly
two and breaks at three.

---

## 8. The contact is two screens deep

`assignedTo` and the site contact are on the task, and only the task **detail**
screen shows them. A blocked technician's first move is usually a phone call,
and the app makes them navigate to find the number.

The active row carries it as a disc — jade before accepting, because at that
point the useful act is often a question rather than a commitment.
