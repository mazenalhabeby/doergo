# What you can see, and what shape it takes

> The whole widget is driven by access, on **two independent axes**. They do not
> interact — resolve the shape, then fill it — which is the only reason twelve
> combinations are tractable.

---

## The two axes

```
       WHICH MODULES YOU HOLD                WHICH JOBS YOU CAN SEE
       decides the SHAPE                     decides the CONTENT
       ─────────────────────                 ──────────────────────
       tasks + clock   → strip + jobs        assignee        → only yours
       tasks only      → strip + jobs        space grant     → yours + the site's
       clock only      → strip + shifts      org-wide        → yours + a summary
                                             shared space    → another org's site
```

Three shapes × four reaches. **Resolve the shape first.** A clock-only member
never reaches the second axis at all, because the list under their strip is
shifts, and shifts have no visibility rule beyond "they are yours".

---

## Axis 1 — modules decide the shape

| Holds | Strip shows | The active row is | Under it |
|---|---|---|---|
| `tasks` **and** `clock` | bars **and** dots | the first job | the rest of the day's jobs |
| `tasks` only | dots | the first job | the rest of the day's jobs |
| `clock` only | bars | **the shift** | the week's other shifts |
| neither | — | — | **the widget does not render** |

### ⚠️ This is the bug the merge fixes

§3.2 says `my-tasks` is **"Who: Everyone."** A member with the clock module and
no tasks module therefore gets a jobs card **every day, forever, empty** —
"Nothing scheduled today" about work they will never be assigned.

Whatever else is decided, the entitlement must become
`hasModule('tasks') || hasModule('clock')`, and the shape must follow which.

---

## Axis 2 — grants decide the content

From `canAccessTask()` in `packages/shared/src/access/task-access.ts`. Four
paths, checked in this order:

```
1. isWithinTaskBoundary()     same org, OR a space another org shared with yours
                              ⚠️ checked FIRST. A relationship grants access
                              within the boundary; it never crosses it.

2. isTaskAssignee()           lead assignee OR co-assignee
                              returns null when the rows were not loaded —
                              it never guesses

3. userRole === ADMIN
   || canViewAllTasks         the org-wide grant

4. viewAllSpaceIds            the SAME grant held by a SPACE role
                              narrower by construction: nothing outside the
                              spaces you were given
```

### The four faces

| Face | Holds | The list shows |
|---|---|---|
| **Executor** | nothing extra | only jobs they are on. Nothing is marked "mine", because everything is |
| **Space supervisor** | `viewAllSpaceIds` | **two groups** — `MINE · 2`, then `BILLA AG · 7`. The only face that needs them |
| **Org-wide** | ADMIN / `canViewAllTasks` | mine, then a three-figure strip. Not a list |
| **Shared space** | `sharedSpaceIds` | another org's site, and it says whose |

### ⚠️ Path 4 is missing from §3.2

The doc names only `canViewAllTasks`, which is path 3. Path 4 is a separate
field with its own bug history, recorded in its own comment:

> *"a member granted 'view all tasks' in their workspace fell through to 'only
> what is assigned to me' — and could create a task in that workspace and then
> not be allowed to open it."*

Anything that re-derives visibility from `canViewAllTasks` alone reproduces
that bug.

---

## Two rules that fall out

### The active row only exists when the first job is yours

The first row grows into a decision — the verb its status allows, and a way to
reach the person — **only when the reader is on that job.**

A shared-space supervisor sees rows and no verb. An org-wide viewer whose first
row is somebody else's job gets no verb either. Access does not only decide
what the button says; it decides **whether there is a button.**

### Mine always leads

Every face that shows other people's work shows the reader's first, grouped and
labelled. The widget is about *your* work; the reader is the subject of that
sentence, whatever else is on screen.

### Reach changes the form, not the length

At org-wide, the list stops being a list. Forty-seven rows is not a bigger
version of three — it is a different question, and §3.9 `open-jobs` already
answers it in counts. A home screen that tries to list an organization is a
home screen nobody reads.

---

## The verb is a third thing access does not decide

The button's label comes from the task's own `StatusWorkflow`
(`FlowStatus.label`), not from the reader's grants. Two members with different
access looking at the same job see the **same verb** — what differs is whether
they see it at all.

Keep that separate in the code. Grants decide *whose jobs and whether a
decision is offered*; the workflow decides *what the decision is called*.

---

## ⚠️ Never visible-then-refused

§2.4 rule 4. The widget checks its module **and** its grant itself, before it
draws anything. The alternative is already in the codebase's history: the
Workflows tab opened, the builder opened, and the 402 arrived at save.

## ⚠️ Entitlement is asked once

§2.4 rule 1. One `availableWidgets(user)` feeds both the home and the picker.
Asked separately they drift — which is how the clock-in list once came to be
stricter than the clock-in check it mirrored, hiding two of three workspaces
from a member assigned to all three.
