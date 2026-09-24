# The home screen — three screens, one file

The empty home, the home with widgets, and editing it. Self-contained: you do
not need any other file in this folder.

Marks are already written: `apps/mobile/src/components/glyphs/`

---

## 1 · The empty home

```
┌─ 390pt ─────────────────────────────────┐
│  Thursday, 24 September            (JO) │  12.5/18 ongrad
│  Good evening, John                     │  22/30 weight 300
│                                         │
│  Nothing on your home yet.              │  19/27 weight 300
│  Here is what you would be seeing.      │  13.5/20 ongrad
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  the real Crew card, opacity .42│    │
│  └─────────────────────────────────┘    │
│  ( Six of your nine are on…   [Keep] )  │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  the real Needs you card, .42   │    │
│  └─────────────────────────────────┘    │
│  ( Fifteen things are waiting… [Keep] ) │
│                                         │
│  [    Keep both    ] [ See all 9 ]      │
└─────────────────────────────────────────┘
```

**Render the real components**, `opacity: 0.42`, `pointerEvents: 'none'`. Not
screenshots, not mock rows — the same `<CrewCard/>` with the same data, so they
can never drift.

- **Two suggestions, never more** — the first two of the profile's server-side
  default order.
- The line in each pill is that widget's **own live answer**.
- ⚠️ **Only suggest a widget whose data has arrived.** One fewer suggestion
  beats one that says "loading".
- **See all 9** opens the gallery (§3).

| | |
|---|---|
| Title | `Nothing on your home yet.` |
| Sub | `Here is what you would be seeing right now.` |
| Buttons | `Keep` · `Keep both` · `See all 9` |

❌ Not *"Your home screen is empty"*, and no dashed **Add a widget** outline.

---

## 2 · The home with widgets

Widgets stacked in the member's order, 350pt wide inside a 20pt gutter, 14pt
apart. Header on top, glass tab pill floating at the bottom.

**Glass** (`glass` + `glass_line` + `SH_GLASS`) on exactly three: **Shift
clock**, **Crew**, **Clients**. Everything else is `well`.

Order and membership come from the server. This screen decides nothing:

```
registry
  → default order for this profile (composed server-side)
  → the member's saved order + hidden set
  → filter by entitlement            ← LAST, every render
```

⚠️ A widget the member is not entitled to is **absent** — not greyed, not
explained. A stored key that is no longer allowed is **skipped silently and
never deleted from storage**.

⚠️ **Each widget fails alone.** One that cannot load renders its own empty
state and never throws upward.

---

## 3 · Editing — on the home itself

**There is no separate arrange screen and no list of names.** This is how iOS
and Android both do it: you drag the card you are looking at.

### Entering

Long-press any card for **500 ms** → `impactLight`.

Every card scales to **0.965** and grows a **⊖** at its top-left. The header
changes to:

```
Thursday, 24 September            [+]  [ Done ]
Hold to move · tap ⊖ to remove
```

⚠️ **The ⊖ is neutral** — `raised` surface, `ink2` stroke. **Never red.**
Removing a widget deletes nothing: the key stays in storage, hidden.

### Moving

Drag the card itself.

| | |
|---|---|
| lift | scale **1.02**, `glass` surface, `0 0 0 4px rgba(jade,.12)` halo |
| the gap | a dashed jade slot, `1.5px dashed` at 45%, where the card was |
| neighbours | spring aside |
| auto-scroll | within 60pt of an edge |
| crossing a card | `selectionAsync()` tick, and the order commits |
| drop | springs into the slot, `impactMedium`, scale back to 0.965 |

⚠️ **No rotation.** Neither platform tilts a dragged card.

### Leaving

**Done**, or a tap anywhere that is not a card. Cards spring back to 1.0.

### Accessibility — WCAG 2.5.7 (AA)

> All functionality that uses a dragging movement can be achieved by a single
> pointer without dragging.

So each card carries, **not visible on screen**:

```js
accessibilityActions={[
  { name: 'moveUp',   label: 'Move up' },
  { name: 'moveDown', label: 'Move down' },
  { name: 'remove',   label: 'Take off my home' },
]}
```

Reached through the VoiceOver rotor and TalkBack's reading controls.

- Announce the **result**: *"Crew, position 2 of 4."*
- **Show visible arrows only when a screen reader is running.**
- **Reduce Motion:** skip the spring and the neighbour animation. The order
  still changes, instantly.

---

## 4 · The gallery

The **+** in the edit header opens a sheet. One widget per page, swiped
sideways.

```
┌─ sheet ─────────────────────────────────┐
│           ━━━━                          │
│  Widgets                                │  23/30 weight 300
│  Six more are yours. Swipe to see them. │  13/19 muted
│                                         │
│  ┌─────────────────────────────────┐    │
│  │   THE REAL CREW CARD, full size │    │  350pt, live data
│  │   6/9 on the clock              │    │  pointerEvents: none
│  │   [KB] [PJ] [AM] …              │    │
│  └─────────────────────────────────┘    │
│  Crew                                   │  15.5
│  Who is on site right now?              │  12.5 muted
│  [        + Add widget        ]         │
└─────────────────────────────────────────┘
```

⚠️ **The preview is the real component with real data**, not a screenshot. A
screenshot goes stale the first time the card changes.

⚠️ **A widget whose data has not arrived is not offered yet.** An empty card in
a gallery is an argument against adding it.

**Add widget** → the sheet closes, the card **lands at the bottom** with a jade
ring for 30 seconds. Closing the sheet so the arrival is visible is the point.

---

## 5 · After any change

PATCH the layout immediately and show for 30 seconds:

```
( Saved to your account.                    UNDO )
```

⚠️ The layout is a **server-side record**, not AsyncStorage.

❌ **No confirm dialog.** Nothing here is destructive.
❌ **No save button.** Done closes a mode; it does not commit anything.

---

## 6 · Rules

1. **Edit in place.** No separate arrange screen, no list of names.
2. **Drag the card**, never a row. The gallery shows the widget, never a label.
3. **Previews are the real component at low opacity**, never a screenshot.
4. **Two suggestions on the empty home**, and only ones whose data arrived.
5. **⊖ is neutral.** Removing deletes nothing.
6. **New widgets land at the bottom**, always.
7. **Entitlement decides membership, last, every render.** Absent, not greyed.
8. **A hidden key is never deleted from storage.**
9. **Glass on three cards only**: shift clock, crew, clients.
10. **Arrows exist as `accessibilityActions`**, on screen only under a screen
    reader.
11. ⚠️ **A widget whose `Component` is a placeholder must not be in the
    registry.** Register it when it renders, or gate on `__DEV__`. A member
    must never see `not built yet`.

---

## 7 · Build it with

`react-native-draggable-flatlist` — both its dependencies,
`react-native-reanimated` and `react-native-gesture-handler`, are already in
this repo. It runs the gesture on the UI thread, which is what holds 60 fps.

| | |
|---|---|
| `ScaleDecorator` | the 1.02 lift |
| `ShadowDecorator` | the elevation — feed it the glass shadow |
| `renderItem` | gives you `drag` and `isActive`; bind `onLongPress={drag}` to the whole card |
| `onDragEnd` | fires once with the new order — PATCH here, start the undo here |

⚠️ **It fights the iOS back-swipe.** Set `activationDistance` so a horizontal
move from the left edge is not read as a drag.

---

## 8 · Check it worked

- A brand-new member's home is **not empty**. If it is, the bug is in the
  server-side default composition, not here.
- Long-press a card. Every card shrinks slightly and grows a ⊖. **Nothing is
  red.**
- Drag the bottom card to the top. The slot follows it, the others move, and
  it stays there after Done.
- Add one from the gallery. The sheet closes and you **see it arrive** at the
  bottom.
- Turn on VoiceOver. Each card offers **Move up**, **Move down**, **Take off my
  home**, and announces its new position.
- Turn on Reduce Motion. Reordering still works with no animation.
- Turn off a module. That widget vanishes from home and gallery; the others
  keep their order.
- Search the running app for `not built yet`. **Zero results.**
