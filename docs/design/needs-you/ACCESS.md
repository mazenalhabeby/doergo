# Access — four guards, two scoping models

The hardest part of this widget, and the reason `REGISTRY.md` exists.

---

## What the controllers actually say

Read off the gateway, not the catalogue:

| Endpoint | Guard |
|---|---|
| `GET /assets/expenses/pending` | `@RequirePermission('canViewAllTasks')` |
| `GET /assets/proposals/pending` | `@RequirePermissionInSpace('canManageAssets')` |
| `GET /employees/time-off?status=PENDING` | `@RequirePermissionInSpace('canViewAllTasks')` |
| `GET /join-requests` | `@RequirePermission('canManageUsers')` |

**Two decorators.** `@RequirePermission` is org-wide; `@RequirePermissionInSpace`
narrows to the spaces the caller holds it in.

And `canViewAllTasks` appears under **both**, on two different rows of this one
widget. A member can hold it in one space and not org-wide, in which case they
get the leave queue for their spaces and **not** the expenses queue at all.

---

## So: two questions, not one

### Does the card exist?

`anyOf: ['canViewAllTasks', 'canManageAssets', 'canManageUsers']` — see
`REGISTRY.md`. Any one of them, and the card is offered.

### Does this row exist?

Each row asks its own grant, with its own scoping. Four independent answers.

⚠️ **A row that is not yours is absent.** Never greyed out, never shown as
`0`. A zero is a claim about a queue the viewer has been told nothing about,
and it invites the reading *"nothing is waiting"* when the truth is *"this is
not yours to know"*.

⚠️ **A row that is not yours makes no request.** §2.4 rule 4 — *nothing is
visible-then-refused* — applied before the network rather than after it. The
member never pays for a call whose answer they may not have.

---

## The doc is wrong about leave, and it matters

§3.19: *"Who: `canManageRota` / `canApproveOvertime`."*

The controller: `@RequirePermissionInSpace('canViewAllTasks')`, with a comment
explaining the history:

> "Leave belongs to a person and `TimeOff` has no space column, so this read
> looked impossible to scope and stayed org-wide — a supervisor could not see
> their own crew's leave, which is half of running a rota. The claim is over
> the PEOPLE though, so the service narrows through the roster."

The doc is describing the **approve** action; the **read** is a different
grant. A widget gated on `canManageRota` would be missing from the home screen
of every supervisor who can already see the queue.

---

## Seeing and acting

There are **no actions on this card**. Every verb is on the screen behind the
row, behind its own permission:

| Row | Read | Act |
|---|---|---|
| Expenses | `canViewAllTasks` | `canManageAssets` |
| Leave | `canViewAllTasks` in space | `canManageRota` / `canApproveOvertime` |
| Proposals | `canManageAssets` in space | narrowed further by `mayReviewProposal` |
| Join requests | `canManageUsers` | `canManageUsers` |

That split is what made the fold possible. Four queues with four action models
could not share a card; four *doorways* can.

---

## ⚠️ One thing not to assume

Holding a grant does **not** mean the queue is non-empty, and an empty queue
means the row is absent. So **the card's row count is not a permission
readout** — a viewer with all four grants and three empty queues sees one row,
same as a viewer with one grant.

The header says `1 QUEUE` in both cases, and that is correct: it counts what is
waiting, not what you may see.
