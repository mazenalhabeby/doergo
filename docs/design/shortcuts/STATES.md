# States

Five, and the last one is a decision rather than a rendering.

| # | State | Tiles |
|---|---|---|
| ① | Mixed | badges and verbs |
| ② | Everything waiting | four badges |
| ③ | Nothing waiting | four verbs |
| ④ | Two tiles | two, either kind |
| ⑤ | **Not drawn** | fewer than two |

---

## ① Mixed

Two doorways with numbers on them, two verbs. The common case for anybody who
runs a site.

Badges take the front slots, so the pattern a manager learns is *"left is
what's waiting, right is what I start."*

---

## ② Everything waiting

Four badges, no verbs. A bad morning.

⚠️ The verbs have not gone away — they are in the Manage list and on the
screens themselves. The rail is not the only door, which is why it can afford
to be ruthless.

---

## ③ Nothing waiting

Four verbs, no numbers. A field technician on a normal day.

**The card is a toolbar**, and that is the right reading. Nothing about it
suggests anything is wrong, because nothing is.

---

## ④ Two tiles

A member with one module and one grant. Still a card — two tiles side by side
with two empty columns of air beside them.

⚠️ Do **not** stretch two tiles to fill the width. They are 71pt because that
is what a 26px mark needs, and a 150pt tile with a 26px mark in it looks like
a mistake. Left-aligned, at their real size.

---

## ⑤ One tile — not drawn

§3.27: *"Hidden when fewer than two remain."*

**One tile is a button that has learned to look like a widget.** It belongs on
the screen it opens, or in the Manage list, not occupying a home-screen slot
to offer a single destination.

⚠️ Hidden is not removed. §2.4 rule 2 — *"never deleted from storage"*. A
member who gains a second module gets their rail back without touching the
picker.

---

## The badge, across states

| | |
|---|---|
| count is 0 | **no badge**, and the tile drops to the verb group for ordering |
| 1–9 | the number |
| 10+ | `9+` |
| count unknown (request failed, not fetched) | **no badge** — never a `?`, never a dot |

⚠️ The last row is the one to get right. A tile whose count failed to load
looks exactly like a tile with nothing waiting, and that is correct: the rail
must not invent a reason to worry.

---

## Offline

Every tile still works — they are routes, not requests.

Badges fall back to their last known value **only where the source is local**
(the sync queue), and are otherwise absent. §3.23's own freshness wording lives
on the Sync screen, not on the tile.

---

## Failure

The rail cannot fail as a unit: it renders from a local table. A badge whose
source errors simply does not draw.

§2.4 rule 3 holds trivially here, which is worth saying out loud — this is the
only widget in the catalogue that cannot show an error state, because it never
asks anyone anything.
