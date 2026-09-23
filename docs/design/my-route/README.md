# Today's route — design handoff

Widget §3.4 `my-route` of `docs/home-widgets.md`, built as a **full face**:
the whole driving day on the home screen.

> **Scope.** One widget. Nothing else on the home screen changes.
> One bug in `route-planner.tsx` is worth fixing first — see step 1.

---

## The one idea

**`/route-planner` has exactly one job that needs a page: choosing which stops.**

Everything else in that 755-line screen is a list, three numbers and two
buttons — and all of it fits on a card. So the card does the day, and the page
is opened once, when the set of stops itself is wrong.

```
THE PAGE   →  which stops          (needs a map you pan and tap)
THE CARD   →  the order            the totals
              per-stop navigation  resume
              the degraded notice  the app chooser
```

---

## The files

| | |
|---|---|
| **`FINDINGS.md`** | Eight things measured in the repo, including one live bug. Read first — it is the argument for the rest. |
| **`DATA.md`** | Where every number comes from, the state-selection logic, what `engine` changes, and offline. |
| **`SPEC.md`** | The card: anatomy, the two verbs, the ⋯ menu, height, and the copy table. |
| **`STATES.md`** | Seven states and one modifier, each with its condition and its verb. |
| **`../icons/`** | The whole icon system — 43 marks in one folder, with the construction law and the five that already exist in `glyphs.tsx`. |

Visual reference — every state drawn at 350pt:
**https://claude.ai/artifact/9GcjYhxdrUEaL7NAVstB7U**
(private; boards `③ Today's route — five states, and why` and
`③ Today's route — the full face, no page`)

---

## Build in this order

### 1. Fix `supportsMultiStop` — no widget work at all

`FINDINGS.md` §4. The function is exported and never called. A driver on Apple
Maps or Waze presses **Start navigation**, is told it opens the whole route,
and gets turn-by-turn to stop one. `navApp` defaults to `'apple'` on iOS, so
this is the default path on every iPhone in the fleet.

Gate the label in `route-planner.tsx` on `supportsMultiStop(navApp)`. This
lands alone, ships alone, and is worth doing whether or not the widget
happens.

### 2. Persist the nav-app choice

`DATA.md` §8. `navApp` is component state today. In a widget you scroll past
at every stop, that is an "Open with" sheet eight times before lunch. Also a
small improvement to the existing screen.

### 3. The glyphs — nothing visible changes yet

Move `../icons/` (the whole folder — see its README) into `apps/mobile/src/components/home/` and
export it from that folder's index. **No edits needed** — its
`import … from './glyphs'` is already written for the destination, which is
also why it does not compile where it currently sits.

`NavigateGlyph`, `CallGlyph` and `MoreGlyph` are not in this set. They already
exist in `work-glyphs.tsx` and the route card uses those.

### 4. The card, states ② ③ ⑦

The three that need no plan-in-progress logic. `stops` from
`isMyRouteStop`, `plan` from `restoreRoute`, and the map strip.

At this point the widget is already useful: it shows the day and it plans.

### 5. States ① ④ ⑤ ⑥

`stopsAheadOf` + `arrivedIds` gives ① and ④ together. ⑤ and ⑥ are notices
over shapes that already exist.

### 6. The ⋯ menu, the fold, `+n more`

The three menu items, and the two rules that keep the card's height bounded
(`SPEC.md` §7).

**Stop here if steps 1–4 land.** Steps 5–6 are worth doing, but a card that
shows the day and plans it is the whole difference between opening a screen
and not.

---

## Rules that are not style

1. **`POST /routes/optimize` is billed per request**, at Google's "Advanced"
   tier for waypoint optimization. It runs on an explicit press and never on
   render. Replan lives in the ⋯ menu for this reason alone.
2. **Never re-optimize on Continue.** Re-read the position, recompute what is
   left, leave the order alone. The planner's own comment says why.
3. **`engine` is a field. Read it.** Do not infer "no road data" from missing
   geometry.
4. **Never render a clock time on `nearest-neighbour`.** Those seconds come
   from a 45 km/h constant that calls itself "never a promise".
5. **The row arrows stay live in every state that has rows** — including no
   plan, no GPS and offline. An address is enough.
6. **`tracksLocation` absent means yes.** An older gateway must not take the
   route away from every field worker at once.

---

## How to check it worked

- Turn off `OSRM_URL` and `GOOGLE_PLACES_API_KEY`. Every route is state ⑥. It
  should look like a finished design, not a warning. (`FINDINGS.md` §3 — for
  some customers this is the only state they will ever see.)
- Select Waze. The big button should say **Drive to …**, not *Start
  navigation*.
- Put the phone in airplane mode at 07:00 and press **Plan route**. It should
  plan, locally, and land in ⑥.
- Sign in as a site supervisor with 54 visible jobs and none assigned. The
  widget should not appear at all.
- Add a sixth stop after planning. `restoreRoute` returns `null`, and the card
  drops to ③ offering a fresh plan. It must not show yesterday's order with a
  new job missing from it.
- Count the card at nine stops. It should be the same height as at five.
