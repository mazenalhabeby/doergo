# Data — where every number on the card comes from

Read `FINDINGS.md` §1 first. The short version: the server is stateless, so
the widget's source of truth is a file on the phone.

---

## 1. The three inputs

```
tasks (already in hand)  ──filter──▶  isMyRouteStop(task, userId)  ──▶  stops[]
                                            lib/my-route.ts

AsyncStorage                          restoreRoute(storage, memberId,
route_plan_v1_<memberId>  ──────────▶   stops.map(s => s.id))      ──▶  OptimizedRoute | null
                                            offline/routes/saved-route.ts

Location.getCurrentPositionAsync  ──▶  start: LatLng | null
```

No network call. The widget renders from the task list it already has plus one
`getItem`.

⚠️ `restoreRoute` returns `null` — not a stale plan — when the saved `day` is
not today, or when any id in `route.order` has left the stop list. A plan and a
changed day's work cannot be shown together, and that is the correct behaviour:
it drops the widget to state ③, which offers `Plan route`.

---

## 2. Which state you are in

```
stops.length === 0                     →  ⑦  Nothing to drive to
plan === null && !start                →  ⑤  No location fix
plan === null                          →  ③  Not planned yet
stopsAheadOf(...).length === 0         →  ④  Finished
plan.engine === 'nearest-neighbour'    →  ⑥  No road data
arrivedIds.size > 0                    →  ①  Mid-route
else                                   →  ②  Start of day
```

Order matters. ⑥ and ① are not exclusive — a nearest-neighbour route
mid-morning is state ① wearing state ⑥'s notice. Evaluate ⑥ as a *modifier*
on ① and ②, not as a branch that replaces them.

---

## 3. Every figure on the card

| Shown | Source | ⚠️ |
|---|---|---|
| `5 stops` | `plan.order.length`, or `stops.length` before planning | — |
| `3 left` | `stopsAheadOf(from, ordered, arrivedIds).length` | Recomputed on render; cheap |
| `34 km` | `plan.totalMeters` | On `nearest-neighbour` this is haversine × `STRAIGHT_LINE_ROAD_FACTOR` (1.3). Prefix `~` and say "straight" |
| `21 km to go` | Sum of `plan.legs` from the current position forward | — |
| `4 km · 12 min` on a row | The `RouteLeg` into that stop | Missing when `engine === 'nearest-neighbour'`? No — legs always exist. Only `geometry` is absent |
| `16:40 back by` | **Not in the data.** See `FINDINGS.md` §7 | Never render on `nearest-neighbour` |
| `09:30` on a row | The task's scheduled time, not the route | A route does not know about appointments |
| The drawn line | `plan.geometry` → `decodePolyline()` | `undefined` on `nearest-neighbour`. This is the whole visual difference |

---

## 4. What `engine` changes

| | `google` / `osrm` | `nearest-neighbour` |
|---|---|---|
| `order` | Solved (TSP) | Greedy nearest-hop from start |
| `legs` | Road distance and time | Haversine × 1.3, at 12.5 m/s |
| `geometry` | Encoded polyline | **absent** |
| Draw | Road-following line | Pins only, dashed connector |
| "back by" | Render it | **Omit it** |
| Distance | `34 km` | `~29 km straight` |
| Notice | none | `route.estimatedOnly` |

`route.estimatedOnly` already exists in the planner:
*"Order and estimates only — no road route available."* Use that string; do
not write a new one.

---

## 5. Navigation, which is two different things

```ts
// The arrow on a row — one stop, whichever app
buildNavUrl(navApp, { start, orderedStops, nextStop: thatStop })

// The big button — every remaining stop, Google only
buildNavUrl(navApp, { start, orderedStops: stopsAheadOf(...) })
```

⚠️ `buildNavUrl` carries a comment about a bug already fixed once:

> "Google used to ignore it and rebuild the entire multi-stop trip, so the
> arrow beside the fourth stop reopened the whole day and started the driver
> at the first one."

Pass `nextStop` for a row. Never reconstruct the URL by hand.

⚠️ **`supportsMultiStop(navApp)` gates the big button's label.** See
`FINDINGS.md` §4 — it is currently exported and never called, and the planner
promises a multi-stop route to apps that cannot take one.

---

## 6. Choosing the app

```ts
const apps = await detectNavApps();          // lib/nav-apps.ts
navDecision(apps)   // 'choose' when apps.length > 1, else 'open'
soleNavApp(apps)    // apps[0] ?? (iOS ? 'apple' : 'google')
```

⚠️ In the planner, `navApp` is component state — it resets every time the
screen opens. In a **widget that lives on the home screen all day**, that
becomes an "Open with" sheet at every single stop. The choice must be
persisted per member.

⚠️ An empty `detectNavApps()` result is valid, not an error — see
`FINDINGS.md` §8. `navDecision` returns `'open'` and the universal link goes to
whatever the system prefers, exactly as the app behaved before any of this
existed.

---

## 7. Offline

Everything above works with no signal:

- the task list is already offline-kept;
- `restoreRoute` is a `getItem`;
- `buildNavUrl` produces a URL, and the nav apps carry their own maps.

**Planning also works offline.** `straightLineRoute()` lives in
`packages/shared` precisely so it can run in both places:

> "One implementation for the server (no engine configured or all engines
> down) and the phone (no signal to ask the server)."

So `Plan route` in state ③ is not disabled offline. It plans locally and lands
in state ⑥ — an order, no road line. That is a better answer than a spinner.

⚠️ The one thing that genuinely needs signal is **Replan against a routing
engine**. Label it honestly in the ⋯ menu rather than removing it.
