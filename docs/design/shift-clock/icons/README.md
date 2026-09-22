# The shift card's glyphs

Six marks, two families, built to the construction `glyphs.tsx` already
describes. Drop `shift-glyphs.tsx` into
`apps/mobile/src/components/home/` and fix the `GlyphProps` import to a
relative `./glyphs`.

---

## The construction

```
.18   the shape behind          depth; never read as a thing
.34   the body                  what the mark is made of
.55   detail                    pole, lines, the start of a route
.95   the thing that names it   the arrow, the badge, the pin
punch the detail cut out        in `contrast`, never in the hue
```

An outline at `strokeWidth: 1.8` on a 24 grid is what every app ships. It has
no mass at 16px, and 16px is the size these are read at — inside a 58px disc,
at arm's length, outdoors. Solid shapes with punched detail survive that.

## The two families

| Family | Means | The mark says |
|---|---|---|
| **Dial** | time | what is happening to it — entering, leaving, paused |
| **Flag** | an issue | which issue — a new one, or the ones already yours |

Learn that once and a mark you have never seen is still readable. That is the
only thing an icon set is for.

## `contrast` is not decoration

It is the colour **punched out of a solid shape**, so it must be the exact
surface the glyph sits on:

| Where | `contrast` |
|---|---|
| Inside the filled jade disc | a lighter jade — **not** the card colour |
| On a neutral tile | the tile's composited colour |
| On the sunken chip | the chip |

Wrong value does not error. It draws a grey ghost across the mark, which is
the failure mode `glyphs.tsx` warns about and the reason every call site
passes its own.

## Pairs, not singles

`ClockInGlyph` and `ClockOutGlyph` are one drawing mirrored. Neither is
unambiguous alone — an arrow beside a circle could be either — and that is
fine: the card shows exactly one at a time, and the other is the state the
member just left.

Do not use them anywhere the pair is not implied.

## Never alone

Every disc on the card carries a text label beneath it. The system's rule —
icons never carry meaning alone — and the reason the filled jade disc also
says **Clock out** in words.

## What was rejected, and why

- **A door for clocking out.** Says you are leaving the building. A member can
  clock out without going anywhere, and walk out without clocking off.
- **A cup for the break.** Says lunch. The fact is that the clock has stopped
  counting.
- **A warning triangle for the issue.** Every alert in every app — and this is
  not an alert, it is somebody choosing to tell you something.
- **A flag beside a plus.** Two small objects at 16px read as grit. The plus is
  punched *through* the pennant instead.
