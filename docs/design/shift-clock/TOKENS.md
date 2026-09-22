# Tokens — what to add, what to change

> The design system is **Amazen Trust**
> (`claude.ai/artifact/CPTk777ZefSaLjusUdb5hG`). Every value below was measured
> against the surface it actually sits on, alpha composited, in both themes.

---

## 1. The palette this design uses

### Dark

| Token | Value | Used for |
|---|---|---|
| `surface-canvas` | `#040507` | the ground, under the gradient |
| `surface-glass` | `#ffffff1a` | the shift card |
| `line-glass` | `#ffffff1c` | its hairline |
| `surface-well` | `#0b0f12` | every list |
| `surface-sunken` | `#0c1013` | fields, the photo slots |
| `surface-tile` | `#ffffff14` | icon tiles, unfilled discs |
| `ink-strong` | `#f1f6fa` | the hero, row titles |
| `ink` | `#acb6bf` | body, the unit after the hero |
| `ink-muted` | `#808b95` | sub-lines **on a well only** |
| `ink-onglass` | `#9fbdb4` | muted text on the card |
| `ink-ongradient` | `#98a9a2` | disc labels — no surface under them |
| `accent` | `#66dbba` | the live dot, links, active nav |
| `accent-lift → accent-solid` | `#7fe6c8 → #10b993` | the filled disc, the primary |
| `accent-ink` | `#001810` | the label on jade |
| `accent-tint` | `#66dbba24` | your own messages, the sent tick |
| `critical` | `#fd978c` | blocked, overdue, the open-shift state |
| `critical-tint` | `#2e1512` | its ground |
| `line-field` | `#616871` | input borders — solid, never an alpha wash |

Gradients:

```
home       #0c4339 → #09291f 26% → #061a19 52% → #050c0f 78% → #040507
interior   #0a3229 → #06181a 24% → #040d10 50% → #040507
```

---

## 2. Add one token: `warn`

A wallet has **paid** and **declined**. A field app has a third state that is
neither — *owed*, *late*, *waiting for approval*, *rest overdue*. Encoding it
as `critical` makes every unapproved shift read as a failure.

| Token | Dark | Light | On a well |
|---|---|---|---|
| `warn` | `#f2b263` | `#8a5a10` | 10.38:1 / 5.54:1 |
| `warn-tint` | `#f2b2631f` | `#8a5a1018` | — |
| `warn-ink` | `#1a1200` | `#ffffff` | 10.02:1 / 5.91:1 on the fill |

Used by: the amber dot on `OPEN`, the rest-overdue strip, `HIGH` severity, the
FLEXIBLE budget bar, every unread badge.

---

## 3. Two bugs in the system itself

### `accent-lift` is illegible under white in light mode

```
white on accent-lift  #14a586   3.11:1   FAIL
white on accent-solid #0b8168   4.82:1   pass
```

The light primary gradient runs `accent-lift → accent-solid` top to bottom, so
white text sits on the **failing** half. Every *Clock out*, *Approve all*,
*Send* in light mode.

**Fix used in this design:** run the light primary `#087961 → #0b8168` —
5.36:1 and 4.82:1, and it still reads as a lit jade pill.

**Fix in the system:** give `accent-lift` a light value white can sit on, or
document that the light gradient inverts.

### `ink-onglass` is under AA on the Home gradient — dark only

```
dark    #9fbdb4 on glass over #0c4339   4.14:1   FAIL
light   #4e6b64 on glass over #bfe0d2   5.28:1   pass
```

The README solves `ink-onglass` against glass generally, but the **Home**
gradient's top stop is lighter than the interior one. The flaw is dark-only,
which is the harder half to notice.

**Worked around here:** on glass over the Home gradient, only large text and
jade. The caption under the hero is the one at risk — check it in situ.

**Fix in the system:** a second value solved against that stop, the way
`ink-ongradient` already splits from `ink-muted`.

---

## 4. Geometry

| Token | Value | |
|---|---|---|
| `radius-tile` | 14px | the only square in the kit |
| `radius-field` | 18px | fields, photo slots |
| `radius-panel` | 26px | wells |
| `radius-surface` | 30px | the shift card |
| `radius-sheet` | 32px | the three sheets, top corners only |
| `radius-full` | 999px | discs, pills, the tab bar — the default |

Spacing is a 4px grid. Screen gutter `space-5` = 20. Between blocks: 13.
Top inset `space-14` = 56 — **no status bar is ever drawn**.
Bottom padding on a screen with the tab pill: `space-tabsafe` = 110.

**Touch targets ≥ 44px.** The discs are 58, because gloves.

---

## 5. Type

`Readex Pro` for everything, `IBM Plex Mono` for numerals read digit by digit —
times, durations, ids, amounts in rows. Never prose.

| Style | Size / line | Weight | Used for |
|---|---|---|---|
| `display` | 64 / 66, `-3px` | 300 | the hero. **One per screen** |
| `display-sm` | 57 / 60, `-2.4px` | 300 | the week total, the batch count |
| `decimal` | 29 / 36, `-1px` | 400 | the unit after the hero |
| `h2` | 23 / 32, `-0.4px` | 500 | sheet titles, the workspace |
| `h3` | 19 / 28 | 500 | section titles, button labels |
| `body` | 15 / 24 | 400 | default, every row title |
| `caption` | 12 / 16 | 400 | sub-lines, disc labels |
| `eyebrow` | 12 / 16, `2.4px` | 400 | `ON THE CLOCK` — mono, **Latin only** |

⚠️ `eyebrow` is uppercase and therefore Latin-only. The app ships German,
Spanish, French and Italian — all fine — but never set an eyebrow in a script
that has no case.

---

## 6. Motion

Not a token family; CSS cannot carry it, so it is prose and must be honoured.

```
120ms   state changes
180ms   entrances
240ms   sheets
        cubic-bezier(0.2, 0.8, 0.2, 1)
```

The live dot breathes only while somebody is on the clock — a pulse that never
stops is decoration. `prefers-reduced-motion: reduce` swaps transforms for a
120ms opacity fade.
