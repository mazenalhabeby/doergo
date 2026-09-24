# The boards — and which files say the same thing

> **Claude Code cannot see the canvas.** It is a page on claude.ai, not a file
> in this repository. Asking an implementer to *"build ① Shift clock — the
> marks"* gives them a title and nothing else.
>
> **The files are the source of truth.** Every board below is fully specified
> in this folder. This page is the map between them.

Canvas: **https://claude.ai/artifact/9GcjYhxdrUEaL7NAVstB7U** (private — open it
yourself to look; do not expect an implementer to.)

---

## How to ask for one of these

❌ *"Build ① Shift clock — FIXED / FLEXIBLE / NONE, ① Shift clock — the marks,
and ① Report / My issues — the whole flow."*

Those are board titles. They appear nowhere in the repository.

✅ Paste this instead:

```
Read docs/design/README.md and docs/design/shift-clock/ in full.

Build, in this order:
  1. docs/design/shift-clock/TOKENS.md §2 — add the `warn` token
  2. docs/design/shift-clock/TOKENS.md §3 — fix the two contrast bugs
  3. docs/design/shift-clock/SPEC.md §1–2 — the card, all eight states
  4. docs/design/shift-clock/SPEC.md §3 — FIXED / FLEXIBLE / NONE
  5. docs/design/shift-clock/ISSUES.md — the report form, the sent state,
     the list and the thread

The marks are already in apps/mobile/src/components/glyphs/shift-glyphs.tsx.
Follow every ⚠️ line literally — each one is a bug that has happened.
Do not invent states that are not in SPEC.md §2.
```

Every instruction there points at a path and a section number. **Nothing
depends on seeing a picture.**

---

## The widget boards

| Board | What it draws | Specified in |
|---|---|---|
| `① Shift clock — FIXED / FLEXIBLE / NONE` | The same card for a member on a fixed shift, on an hour budget, and on neither | `shift-clock/SPEC.md` **§3** |
| `① Shift clock — the marks` | The six shift glyphs at 4 sizes, and why the first outline set failed | `shift-clock/SPEC.md` **§4** · the code is `shift-glyphs.tsx` · the law is `icons/README.md` |
| `① Report / My issues — the whole flow` | Report form → sent → list → thread, four screens | `shift-clock/ISSUES.md` **§2–5** |
| `② My work — ②+⑤+③ in one row` | The week strip, the active row, three reaches, eight marks | `my-work/SPEC.md` · `my-work/ACCESS.md` · `my-work/STATES.md` |
| `③ Today's route — five states, and why` | Planned, two empties, degraded, offline, mid-day | `my-route/STATES.md` · `my-route/FINDINGS.md` |
| `③ Today's route — the full face, no page` | Nine states, the two verbs, the ⋯ menu, the height cost | `my-route/SPEC.md` · `my-route/DATA.md` |
| `④ Crew — who is on, who is late…` | Six states, the four tile faces, scale at 23 and 148 | `crew/SPEC.md` · `crew/SCALE.md` · `crew/STATES.md` |
| `⑤ Needs you — four queues in one row` | Four queues, one grant, the registry problem | `needs-you/SPEC.md` · `needs-you/REGISTRY.md` |
| `⑥ Shortcuts — every destination…` | The rail, all 25 destinations, the selection rule | `shortcuts/SPEC.md` · `shortcuts/DESTINATIONS.md` |
| `⑨ Documents needing you` | Eight states, the two new second lines | `documents-due/SPEC.md` · `documents-due/STATES.md` |
| `⑩ Clients — owed, going cold, and the book` | Seven states, the dynamic headline, the All row | `clients/SPEC.md` · `clients/ENDPOINT.md` · `clients/OPEN.md` |
| `⑦ The icon system` | Every mark, the construction law, the collisions | `icons/README.md` |
| `★ The catalogue, closed — 27 → 9` | Where all 27 rows went | `README.md` **§1** |
| `★ The whole home screen` | Three profiles, every widget assembled, the rail | `README.md` **§6** · every widget's `SPEC.md` |

---

## ⚠️ The screen boards have NO files yet

These are drawn and argued only on the canvas. **There is no specification for
them in this repository**, and an implementer given their titles will invent
something.

| Board | Status |
|---|---|
| `Home — on the clock` · `Home — owner` | drawn only |
| `Jobs` · `Job` | drawn only |
| `My time` · `Approvals` · `Crew` · `My route` | drawn only |
| `Customers` · `Documents` · `Messages` · `You` | drawn only |
| `Foundations` | drawn only — **the token set and every contrast measurement** |
| `Home / Jobs / Approvals / Crew — light` | drawn only |
| `Widget flow` · `Widget anatomy` · `Three profiles` | drawn only |
| `Doing the work` · `Watching the floor` · `Records and money` | drawn only — all 27 widgets at true size |

Findings that exist **only** as notes on those boards, and nowhere in any file:

- **Jobs** had five stacked control rows before the first job — 45% of the
  screen on chrome.
- **Approvals** showed 31 shifts each with its own Reject/Approve pair and no
  way to clear the ordinary ones.
- **The route planner opened on the North Atlantic** while the only stop was in
  Wiener Neudorf.
- **Four screens had four different empty states**, one reading *"You do not
  have this one."*
- **`ink-onglass` over the Home gradient's brightest stop measures 4.14:1** —
  a dark-only accessibility failure.

⚠️ Until `foundations/` and `screens/` exist, **do not ask an implementer to
build any screen board.** Ask for a widget, or write the spec first.

---

## If an implementer really must see a board

They need the Artifact tool and the canvas link, then:

```
action: "read_file", url: "<the canvas link>", path: "project/ScheduleKinds.dc.html"
```

That returns the board's `.dc.html` source — a design-component page, not a
picture. It is readable but it is not a substitute for the spec, and nothing in
this folder assumes anybody does it.
