# States

Seven, plus one modifier. The selection logic is in `DATA.md` §2.

| # | State | Condition | Verb |
|---|---|---|---|
| ① | Mid-route | plan, some stops behind you | Continue route |
| ② | Start of day | plan, nothing driven | Start navigation |
| ③ | Not planned yet | stops, no plan | **Plan route** |
| ④ | Finished | `stopsAheadOf(...).length === 0` | none |
| ⑤ | No location fix | no plan, no `start` | Turn on location |
| ⑥ | No road data | `engine === 'nearest-neighbour'` | *(modifier on ① ② ③)* |
| ⑦ | Nothing to drive to | `stops.length === 0` | none |

---

## ① Mid-route

Done stops fold into one row. The next stop is a raised block with its own
verb bar. Stops beyond it are rows with a nav arrow each.

Headline is **`3 left`**, not `5 stops` — the card counts what is in front of
you. Distance is `21 km to go`, summed from the current position forward.

⚠️ Stops move to "done" on their own: `AT_STOP_RADIUS_METRES = 150` plus
`stopsAheadOf()`. No tap required, and no tap should be required — a driver
parked at a loading bay is not reaching for their phone to confirm it.

---

## ② Start of day

Same card, nothing folded, stop ① raised. The full list is visible without
touching anything, which is the point: you read your day at the yard.

Headline `5 stops · 34 km · 16:40 back by`.

---

## ③ Not planned yet

**The normal 07:00 state**, and the one §3.4 has no string for.

The stops exist before the plan does — they are your jobs with addresses. Show
them in **booked order** with a `·` in place of a number, no line on the map,
and the count:

> **5** stops, in the order they are booked

Verb: `Plan route`, with the cost stated underneath before the press:

> Uses your location. One request per plan.

⚠️ The row arrows still work here. An address is enough to drive to one place,
plan or no plan.

⚠️ This state is reachable **offline**, and `Plan route` still works there —
`straightLineRoute()` runs on the phone. It lands in state ⑥. Do not disable
the button for lack of signal; a local order beats a spinner.

---

## ④ Finished

`route.allDone` — *"Every stop on this route is done."*

Map shows all pins checked. Three tiles become `5 of 5 · 34 km driven ·
16:12 back at` — and `back at` is the only place a past-tense clock time is
honest, because it happened.

**No verb.** There is nothing left to drive to. The fold shows the whole day
(`5 done · 09:30 → 16:12`) for anyone who wants to check their own work.

---

## ⑤ No location fix

`route.needStart` — *"Turn on location to set your start point"*

Planning needs an origin. Driving to one address does not. So:

- the stop list still renders, in booked order;
- **the row arrows stay live** — this is the important half;
- the primary becomes an outlined `Turn on location`, not a disabled
  `Plan route`.

Notice copy on the card:

> Turn on location to set your start point. The order is still yours to
> drive — the arrow beside a stop works without it.

⚠️ Do not grey the card. Two of its three jobs still work.

---

## ⑥ No road data — a modifier, not a branch

`engine === 'nearest-neighbour'`. See `FINDINGS.md` §3: this is the **default**
for a deployment with neither `OSRM_URL` nor `GOOGLE_PLACES_API_KEY` set, so
for some customers it is the only state they will ever see. It must look
finished, not broken.

What changes:

| | Normal | Here |
|---|---|---|
| Map | road-following line | **pins with numbers, no line** |
| Distance | `34 km` | `~29 km straight` |
| Back by | `16:40` | `—` |
| Notice | none | `route.estimatedOnly` in `warn` |

The one visual difference carries the whole meaning: **numbers mean there is
an order; a line means there is a road.** State ③ is pins with *no* numbers —
no order yet. That pair of cues does the work without a word of explanation.

⚠️ `warn`, never `crit`. Nothing failed. The order is real and the addresses
are real; only the road times are missing.

⚠️ Never render "back by" here. `totalSeconds` comes from
`STRAIGHT_LINE_SPEED_MPS = 12.5`, whose comment reads *"for a rough time when
no routing engine answered, never a promise."*

---

## ⑦ Nothing to drive to

`stops.length === 0`. Flat map, no pins, no verb:

> Nothing to drive to today.
> None of your jobs has both a location and a travel step.

⚠️ This is **not** `route.noStops` ("Add a location to a task to route to
it."). That string is the planner's, addressed to somebody who came looking to
plan. On a home screen the member did not ask for anything, so the card
explains rather than instructs.

⚠️ Per §2.4 rule 2, do not remove the widget from the layout when it is empty.
A member whose jobs are desk work today may be driving tomorrow.

---

## Offline

| State | Offline |
|---|---|
| ① ② | Unchanged. The plan is local, the nav apps carry their own maps |
| ③ | `Plan route` **still works** — `straightLineRoute()` runs on the phone → ⑥ |
| ④ | Unchanged |
| ⑤ | Unchanged. GPS is not the network |
| ⑥ | Unchanged — this is where offline planning lands |
| ⑦ | Unchanged |

The only thing that needs signal is **Replan against a routing engine**, in
the ⋯ menu. Say so there; do not remove the item.

---

## Failure

Per §2.4 rule 3, this widget fails alone. A throw inside it renders state ⑦'s
shape with a neutral line and never propagates.

`listFailureIsFatal()` in `apps/mobile/src/offline/tasks/list-failure.ts` is
the model: three of its four branches are non-fatal. A route card that cannot
read its saved plan is in state ③, not in an error.
