# Spec — the full route card

Widget §3.4 `my-route`, rendered as a **full face**: the whole driving day on
the home screen, so `/route-planner` is opened for exactly one reason.

Visual reference: board **③ Today's route — the full face, no page** at
https://claude.ai/artifact/9GcjYhxdrUEaL7NAVstB7U

---

## 1. Who sees it

One predicate, already written, evaluated per job:

```ts
isMyRouteStop(task, userId)   // apps/mobile/src/lib/my-route.ts
```

`stops = tasks.filter(t => isMyRouteStop(t, me.id))`. The widget is offered
when `stops.length > 0`, and that is the whole entitlement rule.

⚠️ Not a role, not the `tracking` module — see `FINDINGS.md` §5. A site
supervisor sees fifty-four jobs and gets no route, because none of them are
hers to drive to.

Registry row:

```ts
{
  key:   'my-route',
  title: 'widgets.myRoute',
  requires: { module: 'tracking', permission: null, self: true },
  Component: RouteCard,
}
```

The module still gates it — `tracking` off means the feature is not sold — but
`isMyRouteStop` is what decides whether there is anything to show.

---

## 2. What stays on `/route-planner`

**Choosing which stops.** That is it.

In `route-planner.tsx` this is `selected: Record<string, boolean>`, toggled
against a real map. A card cannot hold a map you pan and tap, and should not
try. Everything else in that 755-line screen fits on the card: the order, the
totals, per-stop navigation, resume, the degraded notice, the app chooser.

The ⋯ menu's **Edit stops** is the only route from the widget to the page.

---

## 3. Anatomy

```
┌──────────────────────────────────────────┐  350pt, well, radius 26
│  Today's route                      [⋯]  │  19/28 · 34pt disc
│  ┌────────────────────────────────────┐  │
│  │   map strip — 314 × 126, sunken    │  │  ← polyline + pins
│  └────────────────────────────────────┘  │
│  ┌──────┐┌──────┐┌──────┐                │
│  │  3   ││  21  ││ 16:40│                │  ← three sunken tiles
│  │ left ││km to ││back  │                │    21/27 light, 11pt label
│  └──────┘└──────┘└──────┘                │
│  ✓  2 done · Billa AG, REWE          ⌄   │  ← fold, one row
│  ┌────────────────────────────────────┐  │
│  │ ③  NEXT STOP                 13:00 │  │  ← raised, radius 18
│  │    Hofer Simmering                 │  │
│  │    Grillgasse 4 · 4 km · 12 min    │  │
│  │    [ Drive here ]  (call) (⋯)      │  │
│  └────────────────────────────────────┘  │
│  ④  Spar Erdberg              15:00  ➔   │  ← 28pt ring + nav disc
│  ⑤  Depot                     16:20  ➔   │
│  [        Continue route        ]        │  ← full width, jade
└──────────────────────────────────────────┘
```

**Row kinds**

| Kind | Marker | Ink | Arrow |
|---|---|---|---|
| Done | check in a `tile` disc | `muted` | dimmed, still live |
| Ahead | 28pt ring, `ink2`, number in mono | `ink` | live |
| Next | 28pt **filled jade** disc, 4pt glow | `ink` | replaced by the block |

The next stop is a `raised` block, not a row. It is the only thing on the card
carrying a verb bar, and it is the reason the card is worth its height.

---

## 4. The two verbs

The planner already states the distinction in its own footnote
(`route.multiStopNote`):

> "Start navigation opens the whole route. Use the arrow beside a stop to
> drive to just that one."

| | Big button | Row arrow |
|---|---|---|
| Call | `buildNavUrl(app, { start, orderedStops: ahead })` | `buildNavUrl(app, { start, orderedStops, nextStop })` |
| Takes | every remaining stop | that one |
| Needs a plan | yes | **no** |
| Needs GPS | yes (start point) | no — the address is enough |

A compact card has room for one of them. Keeping both is the argument for the
full face; dropping the arrow drops a capability the app already ships.

---

## 5. The big button's label

Three inputs, in this order:

```
if (!supportsMultiStop(navApp))   →  "Drive to {first ahead}"
else if (arrivedIds.size > 0)     →  route.continueNav   "Continue route"
else                              →  route.startNav      "Start navigation"
```

⚠️ The first line is the fix for `FINDINGS.md` §4. Only Google consumes a
multi-stop link; Apple Maps and Waze silently take the driver to stop one.
Promising "the whole route" to an Apple Maps user — the iOS default — is a
label that lies.

**On press**, before building the URL:

1. re-read position (`Location.getCurrentPositionAsync`), because they have
   moved since render;
2. recompute `stopsAheadOf(from, ordered, arrivedIds)`;
3. empty result → `route.allDone`, *"Every stop on this route is done."*

⚠️ **Do not re-optimize here.** From `resumeRoute`:

> "The planned ORDER is untouched — this only decides where in it the driver
> currently is. Re-optimising here would hand back a different route from the
> one on screen, which is not what continuing a route means."

---

## 6. The ⋯ menu — three items, not a screen

| Item | Mark | Does | ⚠️ |
|---|---|---|---|
| **Replan** | `OptimizedGlyph` | Re-solves the order from where you are now | **One billed request.** Google's waypoint optimization is charged at the "Advanced" tier — the service comment says so |
| **Edit stops** | `PlanRouteGlyph` | Opens `/route-planner` | The only exit from the card |
| **Open with** | `NavigateGlyph` | Apple / Google / Waze | Persist the choice — see §8 |

**Replan is in the menu and never on the card.** `POST /routes/optimize` is
billed per request, and a bare button one scroll-flick from the thumb, on a
home screen, is a charge waiting to happen.

The only place the card offers a plan directly is state ③, which has never
planned anything and says so before you press:
*"Uses your location. One request per plan."*

---

## 7. Height, and how it stays bounded

A 390 × 844 phone with a tab bar leaves roughly **620pt** of home visible at
rest.

| | Height |
|---|---|
| Compact route card | ~300pt |
| Full card, 5 stops | ~556pt |
| Full card, 9 stops, unbounded | ~732pt |

§2.2 permits this outright — *"One column, each widget at its natural height"*
— and nothing in the model caps a widget. But this is the tallest card in the
catalogue, so two rules keep it from growing:

1. **Done stops fold into one row.** `✓ 2 done · Billa AG, REWE Landstraße ⌄`
2. **At most three rows ahead of the next stop.** The rest collapse behind
   `+2 more`.

A nine-stop day then costs what a five-stop day costs.

**It is one registry row.** §2.5 already has widgets with two faces; the
difference here is that the face is the member's choice in the picker, not
their permission. Both faces read the same data and the same state machine —
the compact one renders the map strip, the three tiles and the next block, and
stops there.

---

## 8. Things that must be remembered, not re-asked

| | Where it lives now | Where it must live |
|---|---|---|
| `navApp` | component state in `route-planner.tsx` | persisted per member |
| The plan | `route_plan_v1_<memberId>` | unchanged — already correct |
| Fold open/closed | — | per member, per day is fine; a session is enough |

⚠️ The nav-app one is the important one. In a screen you open twice a day,
re-asking is harmless. In a widget you scroll past at every stop, it is an
"Open with" sheet eight times before lunch.

---

## 9. Copy

Every string below already exists in the app. Do not invent new ones.

| Key | Text |
|---|---|
| `route.startNav` | Start navigation |
| `route.continueNav` | Continue route |
| `route.allDone` | Every stop on this route is done. |
| `route.needStart` | Turn on location to set your start point |
| `route.estimatedOnly` | Order and estimates only — no road route available. |
| `route.navFailed` | Could not open that map app. |
| `route.noStops` | No tasks with a location. Add a location to a task to route to it. |
| `route.chooseApp` | Open with |
| `route.myLocation` | My location |

New keys needed, and only these:

| Key | Text |
|---|---|
| `route.notPlanned` | {count} stops, in the order they are booked |
| `route.planCost` | Uses your location. One request per plan. |
| `route.doneFold` | {count} done |
| `route.moreStops` | +{count} more |
| `route.driveTo` | Drive to {stop} |
| `route.driveHere` | Drive here |
