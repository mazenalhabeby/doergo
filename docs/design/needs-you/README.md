# Needs you — design handoff

Widgets **§3.14 `expenses-pending`**, **§3.15 `proposals-pending`**,
**§3.19 `leave-pending`** and **§3.21 `join-requests`** of
`docs/home-widgets.md`, folded into one registry row. The catalogue goes
**21 → 18**.

> **Scope.** One widget. Nothing else on the home screen changes —
> **except one change to the registry**, which this widget cannot be built
> without. See `REGISTRY.md`.

---

## The one idea

**They were the same widget four times.** A queue, a count, hidden when empty,
tapping through to its own screen. Only the permission differed.

Four registry rows that are each absent most days is four things to keep
consistent for a screen that shows one of them.

So: one card, one row per queue you hold a grant for, **sorted by oldest item
rather than biggest count** — because a queue of two that has waited eleven
days is worse than a queue of seven from this morning.

---

## The files

| | |
|---|---|
| **`REGISTRY.md`** | **Read first.** The one change to the widget system this needs, and why a predicate is the wrong answer. |
| **`FINDINGS.md`** | Six things measured in the repo, including a permission the catalogue gets wrong. |
| **`SPEC.md`** | Why one row, the anatomy, the four second lines, the data, the copy. |
| **`STATES.md`** | Three states — and the third is "not drawn", which is the normal one. |
| **`ACCESS.md`** | Four guards, two scoping models, and why a row you cannot see is absent rather than zero. |
| **`../icons/`** | The whole icon system — 43 marks in one folder, with the construction law and the five that already exist in `glyphs.tsx`. |

Visual reference — every state drawn at 350pt:
**https://claude.ai/artifact/9GcjYhxdrUEaL7NAVstB7U**
(private; board `⑤ Needs you — four queues in one row`)

---

## Build in this order

### 1. `anyOf` on the registry row — no widget work

`REGISTRY.md`. Three words in a type, one branch in `availableWidgets(user)`.
Nothing on screen changes, and every existing row keeps working because
`permission` is untouched.

Do this first and alone. It is the only part of this widget that can break
something else.

### 2. The glyphs — nothing visible changes yet

Move `../icons/` (the whole folder — see its README) into `apps/mobile/src/components/home/` and
export it from that folder's index. **No edits needed** — its
`import … from './glyphs'` is already written for the destination, which is
also why it does not compile where it currently sits.

### 3. The card with two rows — leave and join requests

The two simplest: one endpoint each, counts on the envelope. This proves the
per-row entitlement model with the least surface.

At this point the widget is already useful to most managers.

### 4. Expenses and proposals

They need a second figure each — a total, and the senders' names.

### 5. The cover line

`floorStatus()` / `coverNeedsAttention()` from
`packages/shared/src/attendance/cover.ts`. Last because it is the only row
whose second line is a verdict, and the only one that can be subtly wrong.

**Stop after step 3 if you need to.** Two rows is a working widget; steps 4–5
add figures to rows that already exist.

---

## Rules that are not style

1. **A row you cannot see is absent, not zero.** A zero is a claim about a
   queue the viewer has been told nothing about.
2. **A row you cannot see makes no request.** Entitlement before the network,
   not a refusal after it.
3. **Oldest first, not biggest first.** Age is the thing that makes a queue a
   problem.
4. **Never re-derive cover.** Call `floorStatus()`. `minCover <= 0` means *not
   set*, and the function already knows.
5. **Nothing is kept offline.** These are queues that move; a stale count
   invites somebody to think they have already dealt with something.
6. **No actions on the card.** Every verb lives behind its row, behind its own
   grant. That split is what made the fold possible.
7. **The card is not drawn when every held queue is empty** — but the stored
   key stays in the layout (§2.4 rule 2).

---

## How to check it worked

- Sign in holding only `canManageUsers`. One row, header reads `1 QUEUE`, and
  the network tab shows **one** request, not four.
- Hold all four grants with three queues empty. Still one row, still
  `1 QUEUE` — the header counts what is waiting, not what you may see.
- Empty every queue. The card should be **gone**, and reappear when something
  arrives — without the member re-adding it in the picker.
- Set a workspace's `minCover` to `0`. No cover warning should appear, ever.
- Break one endpoint. That row disappears; the other three still render.
- Hold `canViewAllTasks` in a space but not org-wide. Leave appears, expenses
  does not. That is correct, and it is the case the two decorators create.
