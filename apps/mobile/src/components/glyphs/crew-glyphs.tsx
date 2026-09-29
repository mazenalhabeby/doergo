import React from 'react';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
// ⚠️ Resolves once this file is MOVED to apps/mobile/src/components/home/.
// It will not compile in the handoff folder — deliberately, so there is
// nothing to edit after the move.
import type { GlyphProps } from './glyphs';

/**
 * The crew card's marks.
 *
 * Same construction as the rest of the family: ONE hue at four opacities
 * (.18 behind, .34 body, .55 detail, .95 the thing that names it), with the
 * detail PUNCHED out of the solid mark in `contrast`.
 *
 * ⚠️ `contrast` is the SURFACE, not a colour choice. It is cut out of a solid
 * shape, so it must be the exact ground the mark sits on. A wrong value does
 * not error — it draws a grey ghost across the shape.
 *
 * These four are used at 17–18px inside the exception rows' 34px tiles, and
 * nowhere else. The per-person state is carried by the RING and the DOT on
 * each avatar, not by a glyph — see SPEC §4.
 */

const svg = (size: number) => ({ width: size, height: size, viewBox: '0 0 24 24' });

/**
 * THE SHAPE OF SOMEBODY WHO SHOULD BE HERE.
 *
 * The identical figure at .26 — present as an expectation, absent as a
 * person — with the clock still at .95 and its hand past the hour. The pair
 * reads against `OnClockGlyph` at a glance, which is the only reason the
 * ghost weight works.
 *
 * Always `crit`. Never redraw this in `warn`: a no-show that nobody notices
 * is the failure the widget exists to prevent.
 */
export function NotArrivedGlyph({ size = 24, color, contrast = '#0b0f12' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Path
        d="M9.4 12.6c-3.4 0-6.2 2.6-6.2 5.9v2.3h12.4v-2.3c0-3.3-2.8-5.9-6.2-5.9Z"
        fill={color}
        fillOpacity={0.26}
      />
      <Circle cx={9.4} cy={6.6} r={4.3} fill={color} fillOpacity={0.26} />
      <Circle cx={17.6} cy={16.4} r={6.3} fill={contrast} />
      <Circle cx={17.6} cy={16.4} r={5.3} fill={color} fillOpacity={0.95} />
      <Path
        d="M17.6 12.9v3.5l2.6 1.7"
        fill="none"
        stroke={contrast}
        strokeWidth={1.7}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/*
  ⚠️ `OnBreakGlyph` WAS HERE AND IS DELETED.

  It was a steaming cup — the same idea, drawn the same way, as the cup that
  used to live in `glyphs.tsx`. A family with two marks for one thing is not a
  family. The crew card reads `BreakGlyph` from `shift-glyphs.tsx`, which is
  the PAUSE: two bars punched through a disc. A cup says lunch; what the crew
  card is reporting is that the clock has stopped counting.
*/

/**
 * A STACK OF SHIFTS; ONLY THE TOP ONE IS ASKING.
 *
 * Three cards at .18 / .34 / .95 with a clock punched into the front one.
 * The depth is the queue — a single card with a clock on it would say
 * "a shift", not "shifts waiting".
 */
export function HoursWaitingGlyph({ size = 24, color, contrast = '#0b0f12' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Rect x={7.4} y={1.6} width={14} height={10} rx={2.4} fill={color} fillOpacity={0.18} />
      <Rect x={5.4} y={4.4} width={14} height={10} rx={2.4} fill={color} fillOpacity={0.34} />
      <Rect x={3.4} y={7.4} width={14} height={11.4} rx={2.6} fill={color} fillOpacity={0.95} />
      <Circle cx={10.4} cy={13.1} r={3.6} fill={contrast} />
      <Path
        d="M10.4 10.6v2.7l1.9 1.2"
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * THE DENOMINATOR — PLACES, SOME OF THEM FILLED.
 *
 * Two occupied posts at .95, one empty at .26. Used only where the card has
 * to say that the roster itself is missing.
 *
 * ⚠️ See FINDINGS §1: when there is no roster in scope the denominator
 * silently becomes the numerator. This mark belongs beside the line that
 * admits it, never beside a "n/m" that is quietly wrong.
 */
export function RosterGlyph({ size = 24, color }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Rect x={1.6} y={9.4} width={5.6} height={11} rx={2.4} fill={color} fillOpacity={0.95} />
      <Rect x={9.2} y={5.4} width={5.6} height={15} rx={2.4} fill={color} fillOpacity={0.95} />
      <Rect x={16.8} y={9.4} width={5.6} height={11} rx={2.4} fill={color} fillOpacity={0.26} />
      <Circle cx={4.4} cy={4.4} r={2.6} fill={color} fillOpacity={0.95} />
      <Circle cx={19.6} cy={4.4} r={2.6} fill={color} fillOpacity={0.26} />
    </Svg>
  );
}
