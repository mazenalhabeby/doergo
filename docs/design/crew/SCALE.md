# Scale — the two rules that keep this card finite

This is the part that was designed last and matters most. Without it the card
works for a nine-person site and falls apart at anything larger.

---

## Rule 1 — The rail is not a roster

**A tile exists only when there is something to decide about that person.**

| Band | Condition | Why it earns a tile |
|---|---|---|
| **Late** | scheduled shift, no clock-in | Somebody has to ring them |
| **Free soon** | `expectedClockOutAt − now ≤ 60 min` | The next job can go to them |
| **Over** | `now > expectedClockOutAt` | Overtime is accruing right now |
| **Break over** | break longer than its allowance | A decision, and a payroll consequence |

Everyone else — steady, mid-shift, nothing to decide — collapses into **one
chip**:

```
┌──────────┐
│ (AM)(NA)(TW)
│ +15
│ steady
│ Nothing to decide.
└──────────┘
```

**So the card's height tracks how much is happening, not how many people there
are.** Two hundred people on a calm morning is a short card. Nine people with
three problems is a long one. That is the right way round, and it is the only
version of this card that survives a growing customer.

⚠️ This also corrects the first draft of the design, which showed six tiles
because it *could* — not because six people needed anything.

**Ordering** within the rail: late → free soon → over → break over. The tile
you need is always the one already on screen; the rail is for the rest.

---

## Rule 2 — The unit is derived from the scope, never chosen

Nobody picks a mode. The card counts the workspaces in scope and that settles
what it shows.

| Workspaces in scope | Unit | Why |
|---|---|---|
| **1** | People | You know all their names |
| **2–3** | People, with the site on each tile | Still small enough that a person is what you act on |
| **4+** | **Workspaces** | `62 of 148` is not a number anybody can act on. *"Three sites are short"* is |

At 4+ workspaces the card renders **site rows**, sorted by trouble first:

```
●  Wien — Landstraße     3 late    4/9   ▓▓▓▓░░░░░   ›
●  Graz — Nord           2 late    6/11  ▓▓▓▓▓▓░░░░░ ›
●  Linz — Zentrum   1 break over   9/12  ▓▓▓▓▓▓▓▓▓░░ ›
   Wien — Simmering              12/12   ▓▓▓▓▓▓▓▓▓▓▓▓ ›
   +7 workspaces, all full
```

A site row is **the same card in miniature** — a count, a presence bar, and
what is wrong. Tap one and the people come back, scoped to it.

**The widget never becomes a different widget.** One registry row, one
component, one state machine; the unit is a `useMemo` over
`scopeSpaceIds.length`.

---

## What this costs at each size

| Shape | Height | Notes |
|---|---|---|
| 1 site, 9 people, calm | ~300pt | No tiles at all. Count, faces, one quiet line |
| 1 site, 9 people, busy | ~500pt | 3–4 tiles and a chip |
| 1 site, 23 people, calm | ~300pt | Identical. Headcount does not move it |
| 1 site, 23 people, busy | ~500pt | Identical. 4 tiles, `+15 steady` |
| 12 sites | ~460pt | 3 trouble rows, the rest as name pills |
| 12 sites, drilled into one | ~440pt | People again, scoped |

⚠️ The rail scrolls **sideways**. Nine tiles and three tiles are the same
height. Never let it wrap.

---

## Caps, so nothing is unbounded on screen

| | Cap | Overflow |
|---|---|---|
| Tiles in the rail | 8 | `+n` chip at the end |
| Site rows shown | 5 | `+7 workspaces, all full` |
| Names on an exception line | 2 | `· 5 more` |
| Steady chip avatars | 3 | the number does the rest |

---

## And the matching cap on the server

`FINDINGS.md` §2. `getActiveEntries` has **no `take`** — at twelve sites the
phone pulls ~148 rows on every home render to draw one number.

The card cannot fix that from the client. **Bound the endpoint first**, or this
rule only makes the *drawing* cheap while the *fetch* still scales linearly
with the customer.
