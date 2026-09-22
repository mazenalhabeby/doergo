# Findings — measured in the repo

Everything here was read out of the codebase, not inferred from screenshots.
File and line references are to `origin/main` as of this writing.

---

## 1. The catalogue's data source does not exist

`docs/home-widgets.md` §3.4 says:

> **Data** `GET /routes` (kept offline), `POST /routes/optimize` **never** from
> a widget

There is no `GET /routes`. `apps/api/gateway/src/modules/routes/routes.controller.ts`
declares exactly one endpoint, and its own doc comment says why:

> "Optimize a multi-stop visit route (Traveling-Salesman). **Stateless**: the
> caller passes a start, the stops (already geocoded), and an optional end; we
> return the best visit order + per-leg ETAs + geometry."

The server does not hold anybody's route. So the widget's only read endpoint
is the one endpoint §3.4 forbids it to call.

**The real source is already on the phone.**
`apps/mobile/src/offline/routes/saved-route.ts` keeps today's plan under
`route_plan_v1_${memberId}`, and `restoreRoute()` returns `null` unless the
saved `day` is today *and* every id in `route.order` is still one of the
member's stops.

> "Planning is done with signal — in the yard, in the morning — and driving is
> where it goes."

**Consequence.** The widget reads the kept plan and never plans. That satisfies
"never call optimize" *by construction* rather than by discipline, which is the
only version of that rule that survives a refactor.

---

## 2. One empty state in the spec; two on the phone

§3.4 gives one: *"No route planned today."*

| Situation | Frequency | What the spec's string says | What it should say |
|---|---|---|---|
| No stops at all | Rare — and permanent for that member | "No route planned today." | "Nothing to drive to today." |
| Stops, no plan yet | **Every morning, every driver** | "No route planned today." | "5 stops, in the order they are booked" + `Plan route` |

The second is the normal 07:00 state. The spec's string reads as an absence
when it is an invitation.

---

## 3. `nearest-neighbour` is the DEFAULT, not an edge case

`routes.service.ts`:

```ts
const OSRM_URL   = process.env.OSRM_URL?.trim() || null;
const GOOGLE_KEY = process.env.GOOGLE_PLACES_API_KEY?.trim() || '';
```

Both are opt-in. The OSRM default was removed deliberately:

> "It used to default to `router.project-osrm.org` — a public demo host whose
> own usage policy says it is not for production … and sent every customer
> address on the route."

So a deployment with neither variable set returns
`engine: 'nearest-neighbour'` for **every** route, forever. §3.4 files this
under ⚠️; it is the baseline.

**Design consequence.** The no-road-data state is not a rare degradation to
tuck in a corner — for some customers it is the only state they will ever see.
It has to look finished. See `STATES.md` §6.

**And it is a field, not an inference.** `OptimizedRoute.engine` is
`'google' | 'osrm' | 'nearest-neighbour'`. Read it. Do not guess from missing
geometry — the type's own comment says so, and the service is careful about it:

> "Nothing was routed, so report the engine that WOULD have run. Saying 'osrm'
> with no OSRM configured is a small lie the caller can act on."

---

## 4. ⚠️ `supportsMultiStop()` is exported and never called

`packages/shared/src/utils/route-nav.ts:110`

```ts
/** Whether the chosen app can consume the full multi-stop order in one link. */
export function supportsMultiStop(app: NavApp): boolean {
  return app === 'google';
}
```

`grep -rn supportsMultiStop apps packages` (excluding `dist/`) returns the
definition and nothing else.

**This is a live bug.** `route-planner.tsx` renders `route.startNav`
("Start navigation") and `route.continueNav` ("Continue route")
unconditionally, and the footnote under it promises:

> "Start navigation opens the whole route."

`buildNavUrl()` then does this:

```ts
// No single stop named: Google takes the whole trip, the others can only be
// pointed at the first one.
if (app === 'google') return buildGoogleMapsUrl(opts.start, opts.orderedStops, opts.end);
const target = opts.orderedStops[0] ?? opts.end;
return app === 'waze' ? buildWazeUrl(target) : buildAppleMapsUrl(target, opts.start);
```

A driver with Waze selected, or an iPhone defaulting to Apple Maps, presses a
button labelled "Start navigation", is told it opens the whole route, and gets
turn-by-turn to **stop one only**. Nothing errors. They find out at stop two.

`navApp` defaults to `'apple'` on iOS, so this is the default path on every
iPhone in the fleet.

**Fix in the widget:** the big button's label is a function of
`supportsMultiStop(navApp)`. See `SPEC.md` §5.

This one is worth landing on its own, in the planner, before any widget work.

---

## 5. Who gets this widget is not the `tracking` module

§3.4 says *"Who: Module `tracking`. About the viewer."*

The real test already exists — `apps/mobile/src/lib/my-route.ts`:

```ts
export function isMyRouteStop(task: Task, userId?: string | null): boolean {
  if (!userId || task.assignedToId !== userId) return false;
  if (FINISHED.includes(task.status as string)) return false;
  if (task.locationLat == null || task.locationLng == null) return false;
  const tracks = (task as { tracksLocation?: boolean }).tracksLocation;
  return tracks !== false;
}
```

Four conditions, per job, none of them a role or a module. The file records
who it was written to exclude:

> "Pressing it would have proposed a driving route around fifty-four jobs
> belonging to eight other people."

and why the fourth condition is not just "has coordinates":

> "A pin is not a journey. … a support ticket with the customer's address on
> it."

⚠️ **`tracksLocation` absent means YES**, deliberately — an over-the-air build
talking to an older gateway must not take the route away from every field
worker at once.

---

## 6. Progress does not need a tap

`route-nav.ts` already has `AT_STOP_RADIUS_METRES = 150` and
`stopsAheadOf(from, ordered, arrivedIds)`. The app can tell it is at a stop.

`resumeRoute()` in the planner uses both, and its comment draws the
distinction the widget needs:

> "Resume, rather than replay. … Two things are refreshed at the moment of
> pressing, not at screen load: the driver's position, because they have moved
> since, and which stops are left."

and

> "The planned ORDER is untouched — this only decides where in it the driver
> currently is. Re-optimising here would hand back a different route from the
> one on screen, which is not what continuing a route means."

**Consequence.** Stops fall behind you on their own. The button label changes
from *Start navigation* to *Continue route* with no interaction, and the
position is re-read on press, not on render.

---

## 7. "Expected return" is not in the data

§3.4 asks the widget to render *"expected return"*. `OptimizedRoute` carries
`totalSeconds`, not a clock time. Turning that into `16:40` needs a departure,
and nothing supplies one.

The only honest anchor is the first stop's scheduled time. Two options, both
defensible:

- **Anchor it** — `first stop time − leg 1 seconds + totalSeconds`, labelled
  "back by" and never "back at".
- **Drop it** — show `5 stops · 34 km` and leave the third slot to the count
  of stops remaining.

⚠️ On `engine: 'nearest-neighbour'`, drop it either way. `totalSeconds` there
comes from `STRAIGHT_LINE_SPEED_MPS = 12.5`, whose own comment reads
*"~45 km/h — for a rough time when no routing engine answered, never a
promise."* A promise is exactly what a clock time is.

---

## 8. `detectNavApps()` can legitimately return nothing

`apps/mobile/src/lib/nav-apps.ts`:

> "an iOS build whose Info.plist predates the scheme list cannot see any of
> them. Treating that as 'you have no maps' would break navigation for
> everyone on that build."

`navDecision(apps)` returns `'choose'` only when `apps.length > 1`;
`soleNavApp()` falls back to the platform default. So an empty answer must
behave as "just open it", never as an error or an empty chooser.
