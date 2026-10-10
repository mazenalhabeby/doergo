import React from 'react';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
// ⚠️ This import resolves once the file is MOVED to
// apps/mobile/src/components/home/. It will not compile where it sits in the
// handoff folder — deliberately, so there is nothing to edit after the move.
import type { GlyphProps } from './glyphs';

/**
 * The shift card's glyph family.
 *
 * Built to the construction `glyphs.tsx` already describes — ONE colour at four
 * opacities (.18 behind, .34 body, .55 detail, .95 the thing that names it),
 * with the detail PUNCHED out of the solid mark in `contrast`. They are not
 * outlines: an outline at 1.8 on a 24 grid is what every app has, and it has no
 * mass at 16px, which is the size these are read at inside a 58px disc.
 *
 * Two families, and the split is the whole point of the set:
 *
 *   A DIAL means time, and the mark inside says what is happening to it —
 *   entering, leaving, paused.
 *   A FLAG means an issue, and what sits beside it says which one.
 *
 * Somebody who learns that once can read a mark in this family they have never
 * seen before, which is the only thing an icon set is for.
 *
 * ⚠️ `contrast` must be the EXACT surface the glyph sits on, because it is the
 * colour punched out of a solid shape:
 *
 *   inside the filled jade disc  →  a lighter jade, NOT the card colour
 *   on a neutral tile            →  the tile's own composited colour
 *   on the sunken chip           →  the chip
 *
 * Getting it wrong does not error. It draws a grey ghost across the mark.
 *
 * ⚠️ Clock in and clock out are ONE drawing mirrored. Neither reads alone —
 * an arrow beside a circle is ambiguous in isolation — and that is fine,
 * because the card only ever shows one of them at a time and the other is the
 * state the member just left.
 */

const svg = (size: number) => ({ width: size, height: size, viewBox: '0 0 24 24' });

/* ── The dial: time ────────────────────────────────────────────────────────── */

/**
 * A DIAL WITH AN ARROW LEAVING IT.
 *
 * ⚠️ Not a door. A door says you are leaving the building; this says you are
 * ending a paid shift, and those are different facts — a member can clock out
 * without going anywhere, and walk out without clocking off.
 */
export function ClockOutGlyph({ size = 24, color, contrast = '#FFFFFF' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Circle cx={7.2} cy={11.2} r={6.6} fill={color} fillOpacity={0.18} />
      <Circle cx={8.6} cy={12.4} r={6.6} fill={color} fillOpacity={0.95} />
      <Path
        d="M8.6 8.6V12.4l2.8 1.7"
        fill="none"
        stroke={contrast}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M22.6 12.4 18.4 8.6v2.5h-2.6v2.6h2.6v2.5Z" fill={color} fillOpacity={0.95} />
    </Svg>
  );
}

/**
 * ONE COIN, TWO SLOTS CUT OUT OF IT.
 *
 * The most reducible mark in the set on purpose: a rest is the simplest thing
 * that happens to a shift, and a cup of coffee says lunch, not "the clock has
 * stopped counting".
 */
export function BreakGlyph({ size = 24, color, contrast = '#FFFFFF' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Circle cx={10.7} cy={10.7} r={8.2} fill={color} fillOpacity={0.18} />
      <Circle cx={12} cy={12} r={8.2} fill={color} fillOpacity={0.95} />
      <Rect x={9.1} y={8.2} width={2.2} height={7.6} rx={1.1} fill={contrast} />
      <Rect x={12.7} y={8.2} width={2.2} height={7.6} rx={1.1} fill={contrast} />
    </Svg>
  );
}

/* ── The flag: an issue ────────────────────────────────────────────────────── */

/**
 * A SOLID PENNANT WITH THE PLUS PUNCHED THROUGH IT.
 *
 * ⚠️ One object, not a flag beside a plus. The first draft set them side by
 * side and at 16px it read as two pieces of grit. The punch is what makes it a
 * single mark.
 *
 * ⚠️ Not a warning triangle. A triangle is every alert in every app, and this
 * is not an alert — it is somebody choosing to tell you something.
 */
export function IssueNewGlyph({ size = 24, color, contrast = '#FFFFFF' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Path d="M6.4 2.6h12.4l-2.8 3.8 2.8 3.8H6.4Z" fill={color} fillOpacity={0.18} />
      <Rect x={4.2} y={2.6} width={2.6} height={19} rx={1.3} fill={color} fillOpacity={0.55} />
      <Path d="M6.8 3.8h12.6l-2.8 3.8 2.8 3.8H6.8Z" fill={color} fillOpacity={0.95} />
      <Path
        d="M11.4 5.6v4M9.4 7.6h4"
        fill="none"
        stroke={contrast}
        strokeWidth={1.9}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * TWO SHEETS AND A BADGE — the construction `DocumentsGlyph` already uses, so
 * the set reads as one family rather than as a second style.
 *
 * The sheets are the issues; the badge says they are the kind that need an
 * answer. Deliberately NOT a flag: a flag is the thing you raise, and this is
 * the list of ones you already did.
 */
export function IssueMineGlyph({ size = 24, color, contrast = '#FFFFFF' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Rect x={7.4} y={2.2} width={13.4} height={16.6} rx={2.8} fill={color} fillOpacity={0.16} />
      <Rect x={2.6} y={5} width={13.4} height={16.6} rx={2.8} fill={color} fillOpacity={0.34} />
      <Rect x={5.4} y={9.2} width={7.2} height={1.8} rx={0.9} fill={color} fillOpacity={0.55} />
      <Rect x={5.4} y={12.8} width={4.8} height={1.8} rx={0.9} fill={color} fillOpacity={0.55} />
      <Circle cx={17.6} cy={17} r={4.9} fill={color} fillOpacity={0.95} />
      <Path d="M17.6 14.6v2.8" fill="none" stroke={contrast} strokeWidth={1.8} strokeLinecap="round" />
      <Circle cx={17.6} cy={19.5} r={1} fill={contrast} />
    </Svg>
  );
}
