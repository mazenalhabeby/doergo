# Findings — measured in the repo

All read off the source, not the catalogue.

---

## 1. `minCover <= 0` means no opinion — and the code already enforces it

§3.19: *"⚠️ Cover verdicts are computed **server-side**; do not recompute them
in a widget. ⚠️ `minCover = 0` means **not set**, not 'nobody needed'."*

Both true. `packages/shared/src/attendance/cover.ts`:

```ts
/** How a live headcount compares to the floor. Shared by the "right now" panel. */
export function floorStatus(here: number, minCover: number): 'ok' | 'tight' | 'short' {
  if (minCover <= 0) return 'ok';
  if (here < minCover) return 'short';
  if (here === minCover) return 'tight';
  return 'ok';
}

/** Does this level warrant a mark on the bar itself? */
export function coverNeedsAttention(level: CoverLevel): boolean {
  return level !== 'ok';
}
```

**So the rule is already a function.** The widget calls it and renders the
cover line only when the answer is not `'ok'`. It never compares a headcount to
a number itself, and it never treats `0` as a floor.

---

## 2. ⚠️ The leave read is a different grant from the one §3.19 names

§3.19 says *"Who: `canManageRota` / `canApproveOvertime`"*.

`apps/api/gateway/src/modules/technicians/technicians.controller.ts`:

```ts
@Get('time-off')
/*
  Space-aware. Leave belongs to a person and `TimeOff` has no space column, so
  this read looked impossible to scope and stayed org-wide — a supervisor
  could not see their own crew's leave, which is half of running a rota. The
  claim is over the PEOPLE though, so the service narrows through the roster.
*/
@RequirePermissionInSpace('canViewAllTasks')
```

The doc is describing the **approve** action. The **read** is
`canViewAllTasks`, space-scoped.

This matters: a widget gated on `canManageRota` would be missing from the home
screen of every supervisor who can see the queue perfectly well.

---

## 3. ⚠️ Two decorators, not one

Read off the gateway controllers:

| Endpoint | Guard |
|---|---|
| `GET /assets/expenses/pending` | `@RequirePermission('canViewAllTasks')` — **org-wide** |
| `GET /assets/proposals/pending` | `@RequirePermissionInSpace('canManageAssets')` |
| `GET /employees/time-off?status=PENDING` | `@RequirePermissionInSpace('canViewAllTasks')` |
| `GET /join-requests` | `@RequirePermission('canManageUsers')` — **org-wide** |

Two org-wide, two space-scoped — and `canViewAllTasks` appears under **both
decorators**, on two different rows of this same widget.

**Any code that treats the four as one scope will be wrong for two of them.**
See `ACCESS.md`.

The expenses guard is confirmed by its own test:
`apps/api/gateway/src/modules/assets/__tests__/expense-authorization.spec.ts`
— `it.each(['custody', 'custodyForMember', 'pendingExpenses'])('%s requires
canViewAllTasks')`.

---

## 4. ⚠️ §2.1's registry row cannot express this widget

`docs/home-widgets.md` §2.1:

```ts
requires: {
  module:     'time_tracking',
  permission: 'canViewSpaceAttendance',   // ONE key
  self:       true,
}
```

This card appears when the viewer holds **any one** of four unrelated grants,
and each row appears independently of the others.

See `REGISTRY.md`. It is the first widget in the catalogue that needs this, so
it is worth deciding with one case in hand rather than when a fifth queue
arrives and somebody reaches for a predicate.

---

## 5. The proposal fallback is real, and it is the reason this row exists

§3.15: *"⚠️ Routing here has a **fallback**, unlike attendance: a proposal
reaching nobody is work that stops, and the member waits forever and stops
sending pages in."*

The controller's own comment is in the same spirit:

> "`?spaceId=` is a workspace's Assets tab asking for its OWN — narrowed in the
> service by `proposalInSpace`, ANDed with the scope above, never widening."

The fallback stops a proposal vanishing. Nothing stops it *sitting*. That is
exactly what a home-screen queue is for, and it is why this row shows **who
sent it** rather than how many there are — a name is harder to leave alone than
a number.

---

## 6. Four rows, four different reasons to open them

Not a finding in the code so much as the reason the fold works: every one of
these is a queue with a count, hidden when empty, tapping through to its own
screen. They differ only in the one fact that decides urgency.

| | The number that matters |
|---|---|
| Expenses | **Money and age** — somebody is out of pocket |
| Leave | **Cover** — the only second line that is a warning |
| Proposals | **Who** — a name is harder to ignore |
| Join requests | **How new** — somebody is at a door |
