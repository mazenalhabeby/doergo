import React from 'react';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
// ⚠️ Resolves once this file is MOVED to apps/mobile/src/components/home/.
// It will not compile in the handoff folder — deliberately, so there is
// nothing to edit after the move.
import type { GlyphProps } from './glyphs';

/**
 * The four queue marks, plus cover.
 *
 * Same construction as the rest of the family: ONE hue at four opacities
 * (.18 behind, .34 body, .55 detail, .95 the thing that names it), with the
 * detail PUNCHED out of the solid mark in `contrast`.
 *
 * ⚠️ `contrast` is the SURFACE, not a colour choice. It is cut out of a solid
 * shape, so it must be the exact ground the mark sits on. A wrong value does
 * not error — it draws a grey ghost across the shape.
 *
 * These sit at 18px inside a 34px tile. Each one has to be told apart from
 * the other three at that size, in a vertical stack, which is why they differ
 * in SILHOUETTE and not only in detail: a tall page, a torn strip, a tray, a
 * figure.
 */

const svg = (size: number) => ({ width: size, height: size, viewBox: '0 0 24 24' });

/**
 * A MONTH WITH A DAY TAKEN OUT OF IT.
 *
 * Leave is absence, so the mark is a calendar whose grid stops: three day
 * squares, then two struck rows at .45 where the days would be. Drawing
 * booked days instead would say "a schedule", which is `WeekCalendar`'s job.
 */
export function LeaveQueueGlyph({ size = 24, color, contrast = '#0b0f12' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Rect x={2.4} y={4.2} width={19.2} height={17.4} rx={3.4} fill={color} fillOpacity={0.95} />
      <Path
        d="M7.4 1.8v4.2M16.6 1.8v4.2"
        fill="none"
        stroke={color}
        strokeOpacity={0.5}
        strokeWidth={2.2}
        strokeLinecap="round"
      />
      <Path d="M2.4 9.4h19.2" fill="none" stroke={contrast} strokeWidth={1.6} />
      <Rect x={5.6} y={12} width={3.4} height={3.4} rx={1} fill={contrast} />
      <Rect x={10.3} y={12} width={3.4} height={3.4} rx={1} fill={contrast} />
      <Rect x={15} y={12} width={3.4} height={3.4} rx={1} fill={contrast} />
      <Rect x={5.6} y={17} width={3.4} height={2.4} rx={1} fill={contrast} />
      <Path
        d="M11 16.4h6.6M11 19.4h6.6"
        fill="none"
        stroke={contrast}
        strokeOpacity={0.45}
        strokeWidth={2.6}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * A RECEIPT, TORN ALONG THE BOTTOM.
 *
 * The zig-zag edge is the whole mark — it is what separates this from every
 * other rectangle in the set at 18px. Three punched rules stand in for the
 * lines; a currency symbol would not survive the size and would be wrong in
 * half the locales the app ships in.
 */
export function ExpenseQueueGlyph({ size = 24, color, contrast = '#0b0f12' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Path
        d="M4.4 2.6h15.2v18.8l-2.2-1.4-2.2 1.4-2.2-1.4-2.2 1.4-2.2-1.4-2.2 1.4Z"
        fill={color}
        fillOpacity={0.95}
      />
      <Path
        d="M8 7.4h8M8 11h8M8 14.6h4.6"
        fill="none"
        stroke={contrast}
        strokeWidth={1.7}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * SOMEBODY ASKING TO BE COUNTED IN.
 *
 * The figure is `OnClockGlyph`'s, so the family reads as one set, with a plus
 * punched into a disc where the clock sits there. Same silhouette, different
 * claim: not "at work" but "would like to be".
 */
export function JoinQueueGlyph({ size = 24, color, contrast = '#0b0f12' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Circle cx={9.6} cy={6.8} r={4.4} fill={color} fillOpacity={0.95} />
      <Path
        d="M9.6 13c-3.6 0-6.6 2.8-6.6 6.2v2.2h13.2v-2.2c0-3.4-3-6.2-6.6-6.2Z"
        fill={color}
        fillOpacity={0.95}
      />
      <Circle cx={18.2} cy={16.6} r={5.6} fill={contrast} />
      <Circle cx={18.2} cy={16.6} r={4.6} fill={color} fillOpacity={0.95} />
      <Path
        d="M18.2 14.2v4.8M15.8 16.6h4.8"
        fill="none"
        stroke={contrast}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}
