# Shift clock — design handoff

Everything needed to rebuild the shift card and the issue flow. Written to be
handed to an implementer with no other context.

> **Scope.** Widget ① of the 27 in `docs/home-widgets.md`, plus the two sheets
> its discs open. Nothing else on the home screen changes.

---

## The files

| | |
|---|---|
| **`FINDINGS.md`** | What is wrong today, measured off screenshots of the shipping app. Read this first — it is the argument for the rest. |
| **`SPEC.md`** | The card: eight states, the data behind each, the copy, the discs. |
| **`ISSUES.md`** | Report an issue and My issues: three sheets and the thread. |
| **`TOKENS.md`** | The palette used, one token to add, and two bugs in the design system itself. |
| **`../icons/`** | The whole icon system — 43 marks in one folder, with the construction law and the five that already exist in `glyphs.tsx`. |

Visual reference — every state and both flows drawn at 390pt:
**https://claude.ai/artifact/9GcjYhxdrUEaL7NAVstB7U**
(private; the boards are titled `① Shift clock — …` and `① Report / My issues — …`)

---

## Build in this order

### 1. Palette and glyphs — nothing visible changes yet

- Add `warn` / `warn-tint` / `warn-ink` (`TOKENS.md` §2).
- Fix the light primary gradient (`TOKENS.md` §3) — this is a **live
  accessibility bug**, white on `#14a586` measures 3.11:1.
- Move `../icons/` (the whole folder — see its README) into `apps/mobile/src/components/home/` and
  export it from that folder's index. **No edits needed** — its
  `import … from './glyphs'` is already written for the destination, which is
  also why it does not compile where it currently sits.

### 2. The card

Rebuild `shift-clock-card.tsx` against `SPEC.md`. States ①–⑥ and ⑧ use data
the card already has. State ⑦ needs a decision (below).

Drop `Activity` from the card. It belongs to the `needs-action` row.

### 3. Two fields on the payload

`scheduleType` and `monthlyHourBudget` onto the mobile `User` type and the
login/validateToken payload, beside `allowRemote` and `orgAddOns`. **No new
endpoint.** Then `SPEC.md` §3 — FIXED / FLEXIBLE / NONE.

Until this lands, every member gets the FIXED card, including the ones on an
hour budget and the ones with no schedule at all — which is the default.

### 4. The issue sheets

`ISSUES.md`. The form and the list are restyles. The **sent** state and the
**thread** are new.

---

## Three decisions that are not mine

**1. Who owns `unconfirmedClockOut`?**
A shift auto-closed at a temporary time cannot be approved until somebody says
when they actually left. The field exists, the reader returns it, and no widget
in the catalogue claims it. `SPEC.md` ⑦ shows it on this card. It could equally
be its own widget or a banner. It should not stay nowhere.

**2. Does the issue thread know who is looking?**
Acknowledge is the responsible person's action; the reporter acknowledging
their own issue means nothing. One sheet serving both roles needs the
distinction. `ISSUES.md` §5.

**3. Is "open hours" the person or the site?**
`SPEC.md` §3 assumes the *person* has no fixed schedule — `scheduleType` on the
User row. If it means a **workspace** with opening hours that people clock into
whenever, that is a different model and it is not in the schema.

---

## Rules that are not style

These are in the spec files where they apply, collected here so they are hard
to miss:

- **Never the word "paid"** on this card. `clockInAt`/`clockOutAt` are evidence;
  `countedStartAt`/`paidMinutes` are what payroll reads. Say *counted*.
- **Never read the shift from the response cache.** `/attendance/status` and
  `/attendance/breaks/status` are in the `NEVER` list on purpose.
- **Derive elapsed from `clockInAt`,** never count up from mount — a phone that
  slept through lunch must be right the instant it wakes.
- **The card itself is not a tap target.** Only its parts.
- **Exactly one filled disc**, and its glow is what marks it primary — not its
  size, not its position.
- **Every disc keeps its label.** Icons never carry meaning alone.
- **`contrast` on a glyph must be the exact surface it sits on.** Wrong value
  does not error; it draws a grey ghost across the mark.
- **Touch targets ≥ 44px.** The discs are 58, because gloves.
- **No status bar is ever drawn.** Content starts at `space-14` = 56.
- **A widget never writes on render** — no proration, no route optimization, no
  notification.

---

## How to check it worked

- White on every filled control measures **≥ 4.5:1** against the fill, sampled
  from a screenshot, not assumed from the token.
- The card is the **same shape** clocked in and clocked out.
- With no signal, clocking in still works and the card says it is queued.
- A member with no workspace assignment sees **no card at all**.
- Switching a member to `FLEXIBLE` changes the hero from a start time to a
  budget, with no other change to the screen.
