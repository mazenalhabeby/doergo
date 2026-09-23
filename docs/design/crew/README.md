# Crew — design handoff

Widgets **§3.6 `who-is-on`**, **§3.7 `pending-hours`** and **§3.8 `no-shows`**
of `docs/home-widgets.md`, folded into one registry row. The catalogue goes
**25 → 23**.

> **Scope.** One widget. Nothing else on the home screen changes.
> Two server-side bugs are worth landing first — see steps 1 and 2.

---

## The one idea

**The card's height tracks how much is happening, not how many people there
are.**

A tile exists only when there is something to *decide* about that person —
late, finishing inside the hour, past the shift end, break over its allowance.
Everyone steady is a chip with a count.

```
200 people, calm morning   →  a short card
  9 people, 3 problems     →  a long card
```

That is the right way round, and it is the only version of this card that
survives a customer who grows.

The second half of the same idea: **the unit is derived from the scope.** One
workspace shows people. Four or more shows workspaces, because `62 of 148` is
not a number anybody can act on and *"three sites are short"* is.

**Read `SCALE.md` first.** Everything else assumes it.

---

## The files

| | |
|---|---|
| **`FINDINGS.md`** | Six things measured in the repo, two of them live bugs. Read second — it is the argument for several decisions below. |
| **`SCALE.md`** | The two rules that keep the card finite, and what it costs at 9, 23 and 148 people. |
| **`SPEC.md`** | The card: why one row, the anatomy, the tile's six lines, the four faces, the copy. |
| **`STATES.md`** | Six states and the per-tile ring across all of them. |
| **`ACCESS.md`** | Three grants, and the one thing `canViewSpaceAttendance` does *not* imply. |
| **`../icons/`** | The whole icon system — 43 marks in one folder, with the construction law and the five that already exist in `glyphs.tsx`. |

Visual reference — every size and state drawn at 350pt:
**https://claude.ai/artifact/9GcjYhxdrUEaL7NAVstB7U**
(private; one board, titled `④ Crew — who is on, who is late, what is waiting`)

---

## Build in this order

### 1. Bound `getActiveEntries` — no widget work at all

`FINDINGS.md` §2. `prisma.timeEntry.findMany` with an `orderBy` and **no
`take`**, on a route documented "org-wide". At twelve sites that is ~148 rows
on every home render to draw one number.

The pattern exists twice in the same codebase — `listNoShows` right beside it
uses `take: 200`, and §3.7 asks `page=1&limit=1` and reads the total off the
envelope. Ships alone, fixes the existing admin home too.

### 2. Fix the collapsing denominator

`FINDINGS.md` §1. `if (rostered.size === 0)` makes "6 of 9" into "6 of 6", so
the presence bar is full forever for every supervisor granted attendance but
not sites. Drop the `/n` when there is no roster in scope.

Also ships alone, and also fixes the current admin home.

### 3. The glyphs — nothing visible changes yet

Move `../icons/` (the whole folder — see its README) into `apps/mobile/src/components/home/` and export
it from that folder's index. **No edits needed** — its
`import … from './glyphs'` is already written for the destination, which is
also why it does not compile where it currently sits.

`CallGlyph` and `MoreGlyph` are not in this set; the card uses the ones already
in `work-glyphs.tsx`.

### 4. The card at one workspace — states ①②③

`SPEC.md` §2–3 and `STATES.md`. Hero, the rail with its four bands, the steady
chip, the exception rows. This is extraction from `admin-dashboard.tsx`, which
already computes most of it.

At this point the widget is useful for every single-site customer.

### 5. States ④⑤⑥ and the honest ring

The quiet ones, offline, the no-roster modifier, and the two cases where a
progress arc would lie (`FINDINGS.md` §3).

### 6. The workspace unit

`SCALE.md` rule 2. Site rows, sorted by trouble, and the drill-in. Only worth
building once a customer has four or more spaces — but design step 4 so this
is a `useMemo` over `scopeSpaceIds.length`, not a second component.

**Stop after step 4 if you need to.** A single-site customer never reaches
step 6, and steps 1 and 2 are worth shipping whatever happens to the rest.

---

## Rules that are not style

1. **A tile means a decision.** If nothing is to be decided about somebody,
   they are part of a count. This is the whole design.
2. **The rail scrolls sideways, never wraps.** Nine tiles and three tiles are
   the same height.
3. **No arc when `expectedClockOutAt` is null or `endIsDailyLimit` is true.**
   A cut-off is not a finish.
4. **Presence is never cached.** §3.6: stale is wrong, not old. No "last
   updated" line — it invites the reader to treat an old number as roughly
   true.
5. **Drop the `/n` when there is no roster.** A number with no denominator is
   honest; a denominator equal to the numerator is not.
6. **`listNoShows(1)`, not the default 7.** A week never empties, so §3.8's own
   "hidden when empty" stops working.
7. **One verb on the card: Call.** Everything that changes a record lives
   behind the exception rows, where its own permission is checked.

---

## How to check it worked

- Open it on a calm morning. The card should be visibly **shorter** than on a
  bad one, with no tiles at all. If calm and broken look the same, the central
  idea did not land.
- Add ten people to a site. The card's height must not change.
- Sign in as a supervisor with attendance but **no** location assignments. The
  hero must read `6`, not `6/6`.
- Put the phone in airplane mode. The hero goes to `—` and the card says why —
  it must not show this morning's count.
- Point it at a task/none space where `expectedClockOutAt` is null. Every ring
  should be a plain jade circle, no arcs.
- Sign in as an org admin with twelve spaces. The card should show **sites**,
  not 148 people, and the network tab should not be pulling 148 rows.
