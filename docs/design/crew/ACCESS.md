# Access — seeing and acting are three grants

One registry row, one permission to see it, and two more that decide whether
anything on the screen behind it can be done.

---

## The three

| Grant | What it unlocks | Where |
|---|---|---|
| `canViewSpaceAttendance` | **The whole card.** Read only. | the widget |
| `+ canReconcileAttendance` | **Excuse** on a not-arrived row | `/manage/attendance` |
| `+ canApproveOvertime` | **Approve** on an over-run shift | `/manage/attendance` |

Verified on `apps/api/gateway/src/modules/attendance/attendance.controller.ts`:

```ts
@Get('active-entries')     @RequirePermissionInSpace('canViewSpaceAttendance')
@Get('no-shows')           @RequirePermissionInSpace('canViewSpaceAttendance')
@Get('approvals/pending')  @RequirePermissionInSpace('canViewSpaceAttendance')
@Patch('no-shows/:id')     @RequirePermissionInSpace('canReconcileAttendance')
```

The row, the three requests behind it and the server's answers all agree: **an
admin org-wide, a supervisor in their own space, nobody else.**

`admin-dashboard.tsx` already states this as the rule:

> "The same question `GET /attendance/approvals/pending` asks … so the row, the
> request behind it and the server's answer all agree."

---

## Almost no verbs are on the card

Exactly one: the **Call** disc on a late tile. Calling somebody needs no
permission — you are dialling a phone.

Everything that changes a record — excusing a no-show, approving overtime,
editing an entry — lives behind the exception rows, in `/manage/attendance`,
gated separately.

**This is why the card could be simplified without losing anything.** It was
only ever a doorway. A version that put Excuse and Approve on the widget would
have had to carry two more permission checks and two more confirm flows, for
actions that are better done next to the evidence.

---

## Scope, not just permission

`this.scope(req, 'canViewSpaceAttendance')` returns the space ids this viewer
may see. That value does two jobs:

1. **filters the data** — which entries, no-shows and approvals come back;
2. **chooses the card's unit** — `SCALE.md` rule 2. One space shows people;
   four or more shows workspaces.

So access decides not only *what* the card shows but *what kind of thing* it
shows. Same pattern as `my-work`, where access decides the shape, the content
**and** whether there is a decision at all.

---

## The member who holds none of it

Never gets the row — and so **never pays for the three requests behind it**.

§2.4 rule 1: entitlement is asked once, by `availableWidgets(user)`, feeding
both the home and the picker. Asked separately they drift, which is exactly how
the clock-in list once ended up stricter than the clock-in check it mirrored.

§2.4 rule 4: a widget checks its module **and** its permission itself. Nothing
is visible-then-refused.

---

## ⚠️ One grant this card must not assume

`canViewSpaceAttendance` does **not** imply access to the roster
(location assignments). They are separate, and `FINDINGS.md` §1 is what happens
when the card forgets: the denominator quietly becomes the numerator and the
presence bar is full forever.

**Treat the roster as optional data**, not as something the permission
guarantees.
