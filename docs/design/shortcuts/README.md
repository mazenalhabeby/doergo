# Shortcuts — design handoff

**§3.27 `quick-actions`**, absorbing the three catalogue rows that are really a
badge and a destination: **§3.22 `messages`**, **§3.17 `credentials`**,
**§3.23 `sync`** — and later **§3.18 `time-off`**, **§3.24 `invoices`** and
**§3.26 `saved-report`**, which turned out to be the same thing.

> **Scope.** One widget — and **one table**, which is the larger half of the
> work. See `DESTINATIONS.md`.

---

## The one idea

**A badged doorway and a verb are the same object:** one tap to somewhere,
carrying its own gate.

§3.27 already says *"Up to four tiles — only the ones the viewer can actually
use."* Three of the remaining catalogue rows render a count and a destination
and nothing else. They are tiles.

The second half is less obvious and matters more:

**There are twenty-five destinations that are not tabs, and fifteen of them
have no registry entry anywhere.** `apps/mobile/src/lib/manage-rows.ts` already
holds the other ten, in exactly the shape a tile rail needs. So the rail is not
a new list — it is a **third surface on an existing one**.

---

## The files

| | |
|---|---|
| **`DESTINATIONS.md`** | **Read first.** The table that already exists, the twelve rows missing from it, and the two fields to add. |
| **`FINDINGS.md`** | Six things measured in the repo, including a permission the catalogue gets wrong and a widget with no screen. |
| **`SPEC.md`** | The tile, the rail, which four survive, the badge rules, the copy. |
| **`STATES.md`** | Five states — and the fifth is "not drawn". |
| **`ACCESS.md`** | Every tile's gate, and the three kinds of gate that are not interchangeable. |
| **`../icons/`** | The whole icon system — 43 marks in one folder, with the construction law and the five that already exist in `glyphs.tsx`. |

Visual reference — every state, plus all twenty-two destinations:
**https://claude.ai/artifact/9GcjYhxdrUEaL7NAVstB7U**
(private; board `⑥ Shortcuts — the widgets that are really buttons`)

---

## Build in this order

### 1. Extend the table — no widget work

`DESTINATIONS.md`. Add the twelve member-facing rows to the same array, plus
`home?: boolean` and `badge?: string`.

Nothing on screen changes: the Manage tab and the More sheet filter on
permission exactly as they do today, and the new rows are member screens that
Manage never showed anyway.

**Do this first and alone.** It is the only part that touches something already
shipping.

### 2. The glyphs — still nothing visible

Move `../icons/` (the whole folder — see its README) into `apps/mobile/src/components/home/` and export
it from that folder's index. **No edits needed** — its
`import … from './glyphs'` is already written for the destination, which is
also why it does not compile where it currently sits.

### 3. The rail, verbs only

`destinationsFor(user).filter(r => r.home)`, no badges. Ordering is registry
order; the cut is four; fewer than two hides the card.

At this point the widget is complete for a field technician, who has no badges
most days.

### 4. Badges from counts already on screen

`SPEC.md` §5. Read them from whatever already fetched them — `crew` has the
not-arrived count, `needs-you` has the pending queues, the sync queue is local.

⚠️ **A badge must never be the only reason a request happens.** No source, no
badge.

### 5. Badge ordering

Step 2 of the selection rule: badged tiles first, by badge age. This is last
because it is the only part that makes the rail move during the day, and it is
worth watching the static version for a week first.

**Stop after step 3 if you need to.** A rail of verbs is a real widget; badges
make it better and can follow.

---

## Rules that are not style

1. **One table, three surfaces.** The rail never owns a copy of a gate. If the
   rail and the Manage list disagree about who may open Clients, the bug is in
   `manage-rows.ts`.
2. **Never a tile for a tab.** A second door to the same room, one of which
   moves.
3. **No fifth tile and no scroll.** A toolbar you have to swipe is a menu.
4. **Fewer than two, hide the card.** One tile is a button that has learned to
   look like a widget.
5. **A badge is a count, never a dot.** And it caps at `9+`.
6. **`crit` for people, `warn` for things.** A red badge on Sync would put a
   queued photo on the same footing as somebody who has not turned up.
7. **An unknown count draws no badge.** Never a `?`. The rail must not invent a
   reason to worry.
8. **The rail makes no request of its own.** It is the only widget in the
   catalogue that cannot show an error state.

---

## How to check it worked

- Sign in as a field technician with no modules. Four verbs, no numbers, and
  the network tab shows **nothing** from this widget.
- Grant `canViewSpaceAttendance` in one space only. The Attendance tile should
  appear; Members and Invitations should not — they are `orgWide: true`.
- Revoke every module but one. The card should **disappear**, and come back
  when a second is restored — without the member touching the picker.
- Break the count source behind a badge. The tile renders plainly. No `?`, no
  dot, no error.
- Switch to German. *"My equipment"* should wrap to two lines, not truncate —
  the tile is sized for two lines from the start.
- Compare the rail against the Manage list. Any destination in one and refused
  by the other is a bug in the table, not in either surface.
