# The registry change this widget needs

> This is the only file in any of the design folders that asks for a change to
> the widget **system** rather than to a widget. Read it before building.

---

## The problem

`docs/home-widgets.md` §2.1:

```ts
{
  key:   'shift-clock',
  title: 'widgets.shiftClock',
  requires: {
    module:     'time_tracking',
    permission: 'canViewSpaceAttendance',   // ← one key
    self:       true,
  },
  Component: ShiftClockCard,
}
```

One permission. Every widget so far has fitted, because every widget so far
answered one question for one kind of viewer.

**This one appears when the viewer holds any ONE of four unrelated grants**,
and each of its rows appears independently:

| Row | Grant |
|---|---|
| Expenses | `canViewAllTasks` (org) |
| Leave | `canViewAllTasks` (in space) |
| Proposals | `canManageAssets` (in space) |
| Join requests | `canManageUsers` (org) |

A viewer with only `canManageUsers` gets the card, with one row in it. A viewer
with none of the four does not get the card at all — and so never pays for any
of the four requests.

---

## The change

```ts
requires: {
  anyOf: ['canViewAllTasks', 'canManageAssets', 'canManageUsers'],
}
```

`availableWidgets(user)` returns the row when **any** listed key is held.
`permission` stays for the rows that have one; `anyOf` is an alternative to it,
not an addition.

---

## Why not a predicate

The obvious alternative is a `canShow(user)` function on the row. It would
work, and it is worse.

§2.1, in its own words:

> "Adding a widget is adding a row. Anyone can read one file and know the whole
> set — **that property is worth protecting more than any individual feature
> below**."

`anyOf: string[]` is still a row you can read. A function is not: it moves the
answer out of the registry and into a closure, and the first one makes the
second one easy.

⚠️ And §2.4 rule 1 — *"Entitlement is asked once. One `availableWidgets(user)`
feeds both the home and the picker. Asked separately they drift"* — only holds
if the entitlement is **data**. A predicate that the picker forgets to call is
precisely the drift that rule exists to prevent, and the rule names a real
incident: *"which is exactly how the clock-in list ended up stricter than the
clock-in check it mirrored."*

---

## Why decide it now

This is the **first** widget in the catalogue that needs it. There is one case
to design against, and the shape of the answer is three words.

The alternative is discovering it when a fifth queue arrives, with four rows of
working code to retrofit and somebody under time pressure reaching for the
predicate.

---

## What it does not change

- **Rows are still filtered per-row.** `anyOf` decides whether the card exists.
  Each row still checks its own grant — see `ACCESS.md`. They are two different
  questions and both are asked.
- **§2.3's resolution order is untouched.** `anyOf` is evaluated in the same
  *filter by entitlement, last, every render* step as `permission`.
- **§2.4 rule 2 still holds.** A stored key that is no longer allowed is skipped
  silently and never deleted from storage.

---

## If the change is refused

The widget still works, with one compromise: register it under
`canViewAllTasks` alone. That covers expenses and leave — the two biggest
queues — and loses it for a viewer who holds only `canManageAssets` or only
`canManageUsers`.

⚠️ Do **not** ship it as four registry rows to avoid the change. That is the
catalogue this fold exists to shrink, and §3.14 / §3.15 / §3.19 / §3.21 are
already four rows that nobody will keep consistent.
