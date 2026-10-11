# The island — the in-app notification

Everything needed to replace the toast. Self-contained: you do not need any
other file in this folder.

Replaces: `apps/mobile/src/contexts/toast-context.tsx` — all 340 lines.
Mounted at: `apps/mobile/app/_layout.tsx:179` (where `ToastProvider` is today).
The drawing: `docs/design/island.html` — open it in a browser. It is a picture,
not a source of truth. **This file is the source of truth.**

---

## 1 · What it is

A black capsule that wraps the phone's camera cutout. A message grows out of it
and sinks back in.

**It is not a push notification.** No OS permission, no Live Activity
entitlement, no APNs, no native module. It is a `<View>` in the root layout, so
it behaves identically on iOS and Android and works in Expo Go.

**The reason to build it rather than a nicer toast:** while a member is on the
clock it never leaves. It shrinks to a jade ring and a running figure and
stays. Every screen in the app inherits a live shift clock for free.

### ⚠️ The one law

> **The camera covers nothing, ever.**
>
> The cutout rectangle, plus 6pt on each side, is not a layout area. Every
> other rule in this file exists to serve this one.

---

## 2 · Measure the phone

Never assume the cutout is centred, and never assume its size.

```ts
/** Physical cutout, in points, from the top-left of the screen. */
interface Cutout { x: number; y: number; w: number; h: number; kind: Kind }
type Kind = 'floating' | 'edge' | 'none';
```

**Android.** ⚠️ **Correction to an earlier version of this file, which was
wrong.** `WindowInsets.getDisplayCutout().boundingRects` is **not reachable
from JavaScript.** It is not in React Native, not in Expo, and not in
`react-native-safe-area-context`. Getting it needs a native module this project
does not have.

Until that module exists:

```ts
const rects = readNativeCutout();
if (rects?.length) {
  const r = rects[0];
  return { ...r, kind: r.y <= 0 ? 'edge' : 'floating' };
}
return { x: screenW / 2, y: 0, w: 0, h: 0, kind: 'none' };   // ⚠️ none, NOT edge
```

⚠️ **A status bar is not a cutout.** `insets.top` on Android is the status-bar
height and is never 0, so returning a full-width `edge` from it makes every
Android phone claim hardware it does not have — and the island then docks under
a band that is not there, which is a black pill floating in space.

Where Android cannot measure the cutout, the island assumes a centred lens in
the status bar and is born there (§5) — marked `assumed`, so nothing is drawn
there while idle.

**iOS**: `react-native-safe-area-context` gives the top inset. Map it:

| top inset | device | cutout |
|---|---|---|
| 59pt | Dynamic Island | `{x: 123, y: 11, w: 126, h: 37}` · `floating` |
| 47–48pt | notch | `{x: 82, y: 0, w: 209, h: 30}` · `edge` |
| 20pt | SE / older | `none` |

**Cache it on mount. Re-read only on rotation.** It cannot change otherwise.

Under-display cameras (Z Fold inner screen) report **no** cutout. Treat that as
`none`. Do not try to guess where the lens is.

---

## 3 · The two slots

```ts
const PAD = 10, GAP = 6, SIDE = 13, ICON = 21, ICON_GAP = 9;
const CAP = 356, EDGE = 8;

const L = (hole.x - GAP) - (island.x + SIDE);
const R = (island.x + island.w - SIDE) - (hole.x + hole.w + GAP);
```

`L` and `R` are the only places content may go in the head row. The `hole.w +
12` between them is dead.

---

## 4 · The ladder

Measure the title, then take **the first rung that fits**.

```ts
const fitsLeft = ICON + ICON_GAP + measure(title) <= L;
const fitsRight = measure(value, MONO) <= R;
```

| rung | test | left slot | the rest |
|---|---|---|---|
| 1 | fits at natural width | icon + title | one line, radius 999 |
| 2 | fits only once grown to `CAP` | icon + title | same, at the cap |
| **3** | **title will not fit beside the lens** | **icon only** | **title drops below the lens**, radius 30 |
| 4 | …and there is a body | icon only | title then body, full width |
| 5 | `ICON > L` — a hard-left camera | nothing | icon moves to the right slot, all text drops |

Natural width, before clamping to `CAP`:

```ts
const natural = SIDE*2 + ICON + ICON_GAP + measure(title)
              + (hole.w + GAP*2) + measure(value, MONO) + 24;
```

Then `x = clamp(holeCentre - w/2, EDGE, SCREEN_W - EDGE - w)`.

### ⚠️ What the numbers actually say

On a **Dynamic Island** the slots are 96pt each. Minus the icon and its gap,
the title gets **66pt — about 9 characters**. `Clocked in` measures 67pt.

**It does not fit.** Rung 3 is the *normal* form on iPhone, not the exception.

> Build and test the dropped layout **first**. Treat the one-line form as the
> lucky case that a large centred punch-hole happens to allow.

On a Pixel's ⌀26 hole the slots are 146pt and most short titles do fit.

### Measuring text

Use `onTextLayout`, or a cached advance table built from the real font at the
real size. **Never a character count.**

German and French run 30–40% longer than English. A string that is rung 2 in
English is rung 3 in German. All five locales
(`apps/mobile/src/i18n/locales/{en,de,fr,es,it}.json`) get measured, not
assumed.

---

## 5 · One shape, born at the cutout

⚠️ **This replaces every earlier §5 — `wrap` / `dock` / `rect` / the visor.**
The visor was full-width chrome that matched nothing; it is gone.

**On every phone the island is born AT the cutout, at exactly its size, and
grows out of it left and right.** The lens never moves — the box grows from
the hole's centre.

| phone | born as | idle |
|---|---|---|
| Dynamic Island | a pill `PAD` around the 126 × 37 lens | the pill stays drawn |
| Notch iPhone | **exactly the notch** — `y: 0`, square top, rounded bottom. Black on black, so the notch simply widens | not drawn — the notch is the idle state |
| Android, no cutout module | a centred lens in the status bar (`assumed`) | not drawn |
| iPhone SE (no lens) | a 36pt dot just under the status bar | not drawn |

**The notch is looked up by model** (`expo-device` `modelId`), because iOS
exposes no cutout rectangle. Every width errs wide — too wide costs a few
points of text room, too narrow puts text under the camera. An unknown notch
phone falls back to the widest notch its inset has shipped with.

| model | notch (pt) |
|---|---|
| X, XS, XS Max, 11 Pro, 11 Pro Max | 212 × 31 |
| XR, 11 | 232 × 33 |
| 12 mini | 228 × 35 |
| 12, 12 Pro, 12 Pro Max | 212 × 33 |
| 13 mini | 178 × 35 |
| 13, 13 Pro/Max, 14, 14 Plus, 16e | 166 × 34 |

### 5.1 The layout

- **The head row is the band the lens sits in** (the notch's own height on a
  notch). **Icon on the left of the lens, time on the right** — always.
- The title goes beside the icon **if it fits in the left slot**. If it does
  not, it goes **under the lens**; so do the body and the action.
- **The height is whatever that content needs**, decided before anything
  moves. One row with nothing under it stays one row at its natural width;
  anything under the lens takes the full cap width (356pt, never within 8pt
  of an edge).
- The live shift is a ring and a figure — one row beside the lens.

### 5.2 The motion

Coming from nothing, the box is **set** to the cutout, then springs out (one
spring for width, radius and x; height 40ms late, so it widens then drops).
Leaving, it shrinks back into the cutout and is then hidden — on a notch that
last frame is black on black.

### 5.3 Space

Only the **live shift on a phone with no lens** pushes the app down (`DOT +
12`). A notch or a Dynamic Island holds it in the band the app already avoids.
Transient messages never move the app.

---

## 6 · The colours

⚠️ **The island is black in both themes, and so is its ink.**

It is pretending to be the camera housing, and the housing is black on a white
phone too. A white pill in light mode is just a toast again. This is the single
decision the whole idea rests on — do not wire it to `useTheme()`.

```ts
const ISLAND = {
  bg:   '#000000',
  ink:  '#f1f6fa',
  dim:  '#8b969d',
  line: '#ffffff1a',
  acc:  '#66dbba',   // dark-mode jade, in BOTH themes
  warn: '#f2b263',
  crit: '#fd978c',
} as const;
```

Everything behind it keeps using `theme/amazen.ts` as normal.

---

## 7 · The five tones

| tone | colour | when | example |
|---|---|---|---|
| `done` | jade | an action finished | `✓ Clocked in · 09:43` |
| `live` | jade ring | **on the clock, persistent** | `◎ 0m` |
| `waiting` | amber | a variance from the roster | `Anna approved your overtime · 1h 42m` |
| `failed` | red | it did not happen | `Main Office is 2.4 km away · Retry` |
| `queued` | grey + mono | in the outbox | `Sends when you are back · 3` |

**`queued` is not `failed`.** This app has an outbox; "queued" is a fact, not a
failure, and colouring it red teaches members that working offline is broken.

**`failed` never collapses on its own.** It holds its form with its action
until dismissed or acted on. Everything else sinks after 4s.

Say the fact, not the verdict. `On the clock at Main Office · 09:43`, never
`Success`. The time is the point — this is an attendance record.

---

## 8 · The motion

One spring drives width, height and radius together.

```ts
const SPRING = { damping: 26, stiffness: 240, mass: 1 };
```

| track | ms | |
|---|---|---|
| width | 0 → 420 | the spring |
| height | 40 → 460 | 40ms late, so it reads as widen-**then**-drop |
| radius | 0 → 420 | 999 → 30, same spring |
| old content out | 0 → 100 | gone before anything travels far |
| new content in | 150 → 370 | fade + 6px upward drift |
| body in | 230 → 450 | staggered 80ms behind the head row |
| haptic | 150 | one `Haptics.impactAsync(Light)` on arrival — **never on collapse** |

**Rules of the morph:**

1. **The lens never moves.** Left and right grow at the same rate, anchored to
   the *hole's* centre, not the box's. If the camera appears to slide, the
   illusion dies in one frame.
2. **Wide first, then down.** Both at once reads as a panel appearing. Wide
   then dropping reads as one object stretching, which is what it is.
3. **Decide the rung before anything animates.** Measure, pick the final box,
   animate to it, fade content in already at its final position. **Never
   re-measure mid-flight** — text re-wrapping during a 420ms morph is what
   makes cheap versions look cheap.
4. **A second message re-targets the running spring** from its current
   velocity. Never queue behind the animation, never collapse to sealed first.
   `withSpring` does this for free; a `withTiming` curve here gives the whole
   trick away.
5. Collapse is the reverse at **280ms**, and **the body fades before the box
   shrinks** — otherwise you watch the text get crushed.
6. `reduce motion`: cross-fade between the two sizes over 180ms. No spring, no
   travel, no overshoot.

Everything animates on the UI thread — `react-native-reanimated` ~4.1.1 is
already installed.

---

## 9 · The API — keep the old shape

Nine files call `useToast()`. **Do not touch them in this change.** Export the
same hook from the new context so the swap is a drop-in:

```
apps/mobile/src/components/home/shift-clock-card.tsx
apps/mobile/src/components/attendance-edit-sheet.tsx
apps/mobile/src/components/rest-card.tsx
apps/mobile/src/components/worklog-sheet.tsx
apps/mobile/src/components/supply-document-sheet.tsx
apps/mobile/src/components/custom-fields-card.tsx
apps/mobile/src/components/team/member-detail-sheet.tsx
apps/mobile/src/components/issues/report-issue-sheet.tsx
apps/mobile/src/hooks/useClockIn.ts
```

```ts
// unchanged, so every existing call site keeps working
success(title, message?)   // → tone 'done'
error(title, message?)     // → tone 'failed'
warning(title, message?)   // → tone 'waiting'
info(title, message?)      // → tone 'queued'

// new
island.live({ label, since })   // the persistent shift state
island.clearLive()
```

`message` becomes the body, which is what forces rung 4.

⚠️ The old `title` was usually the useless word (`'Success'`) and the real fact
was in `message`. **Fixing those nine call sites is a second commit**, after
this one is working. Do not mix them.

---

## 10 · Behaviour

- **One island.** A second message replaces the first. **The live shift always
  wins the collapsed state** — when a message finishes, it sinks back to the
  ring and figure, not to sealed. With no live shift, a `wrap` sinks to sealed
  and anything else shrinks back into its cutout and is hidden (§5).
- **Queue** capped at 3, oldest dropped. Duplicates collapse to `×2`.
- **Timing:** 4s with an action, 3s without, **0 for `failed` and `queued`**.
- **Tap** expands; tap outside, swipe up, or 8s collapses. Never auto-expands.
- **Swipe up** dismisses.
- **Rotation** re-measures the cutout and re-runs the ladder.
- **Accessibility:** `announceForAccessibility` on every arrival — the current
  toast announces nothing at all. With a screen reader running, **no
  auto-dismiss under 6s** (WCAG 2.2.1).

---

## 11 · Delete on the way out

From `toast-context.tsx`, and do not carry any of it across:

- The banner at `insets.top + 8` — it lands on the greeting and the date, the
  one part of the screen that says where you are.
- `rgba(6, 78, 59, 0.85)` with a `BlurView` **imported at `:12` and never
  rendered**. That is why the name behind it reads *through* it. It is a bug,
  not a style.
- The word `Success` at 700 weight in the loudest slot, carrying no
  information.
- The `✕` — on something that already auto-dismisses at 3s and whose whole
  surface is already pressable to dismiss.
- `TOAST_THEME` — twelve hardcoded Tailwind ramps (`#ECFDF5`, `#A7F3D0`,
  `#059669` …) across four tones, none from `theme/amazen.ts`. They do not
  re-skin.
- `setToast` overwriting, so two quick actions destroy the first message
  mid-animation.

---

## 12 · Check it worked

- **`Clocked in` on a Dynamic Island drops to rung 3.** If it renders on one
  line, the measurement is wrong.
- The same message on a Pixel ⌀26 stays on **one line**.
- Switch the locale to German. Strings that fit in English now drop. **Nothing
  is clipped and nothing gets an ellipsis.**
- Set the device to a left-hand punch-hole. The island is left-anchored and the
  icon is in the **right** slot.
- **On a notch iPhone the island grows out of the notch** — the first frame is
  the notch itself, then it widens left and right. Icon left of the notch,
  time right of it; a long title drops under the notch and the height grows.
- Switch to light mode. **The island and its ink do not change.**
- Clock in, then navigate to Jobs, Messages, Team. The ring and figure are
  **still there and still counting**.
- Clock out. On a Dynamic Island the island sinks to sealed; **on a notch it
  shrinks back into the notch** and nothing is left behind.
- Turn off the network and clock in. Grey, mono, `Sends when you are back`, and
  it **does not auto-dismiss**.
- Fire two messages 200ms apart. The second re-targets the spring mid-flight —
  the box never snaps back to sealed between them.
- Turn on Reduce Motion. It cross-fades, and the message still arrives and
  leaves on the same clock.
- Turn on VoiceOver / TalkBack. Every arrival is announced, and nothing
  auto-dismisses inside 6s.
