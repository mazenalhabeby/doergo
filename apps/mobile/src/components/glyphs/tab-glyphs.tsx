import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

/**
 * The five marks in the tab pill.
 *
 * ⚠️ THESE ARE STROKED OUTLINES AND THE REST OF THE FAMILY IS NOT.
 *
 * Every other mark in this app obeys one law — *"ONE colour at four opacities
 * … with the detail PUNCHED out of the solid mark in `contrast`"* — and these
 * deliberately do not. Three reasons, and they are the whole justification for
 * a second style existing at all:
 *
 *   1. They are drawn at 22px, the smallest anywhere in the app. Four stacked
 *      opacities at that size composite to a grey smudge; a single-weight
 *      outline keeps its silhouette.
 *   2. A punched mark needs `contrast` to be the EXACT surface behind it, and
 *      the pill is translucent over a gradient that differs per screen. There
 *      is no one right value to punch against.
 *   3. Navigation marks are not content. The family's job is to tell one
 *      OBJECT from another — a van, a payslip, a rest — in a list where
 *      several appear together. These five are always the same five, always in
 *      the same order, and are recognised by position long before shape.
 *
 * A sixth mark added here follows the strokes. A sixth mark added anywhere
 * else follows the law. See `docs/design/icons/README.md`.
 */

export interface TabGlyphProps {
  size?: number;
  color: string;
}

const svg = (size: number) => ({ width: size, height: size, viewBox: '0 0 24 24' });
const stroke = (color: string) => ({
  fill: 'none' as const,
  stroke: color,
  strokeWidth: 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

/**
 * A HOUSE, as a plain pentagon.
 *
 * ⚠️ No door and no window. Traced off the reference: an apex, two roof
 * slopes meeting the walls at 42% of the height, vertical walls, a flat
 * bottom. A door would be a third element inside a 21px square and the first
 * thing to close up.
 */
function TabHomeGlyph({ size = 22, color }: TabGlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Path d="M2.8 10.9 12 2.9l9.2 8V22H2.8Z" {...stroke(color)} />
    </Svg>
  );
}

/**
 * A CLIPBOARD — an empty one.
 *
 * ⚠️ NO RULES INSIDE. An earlier draft had two, on the reasoning that a
 * clipboard with nothing on it is a rectangle; the reference has none, and it
 * is right. The CLIP is what tells it from a rectangle, and it does that on
 * its own — a rule at 21px is one pixel of ink that reads as dirt on the
 * screen. The clip straddles the top edge rather than floating above it.
 */
function TabJobsGlyph({ size = 22, color }: TabGlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Rect x={3.5} y={5.5} width={17} height={17} rx={2.6} {...stroke(color)} />
      <Rect x={7.5} y={2} width={9} height={5.5} rx={2} {...stroke(color)} />
    </Svg>
  );
}

/**
 * A CLOCK.
 *
 * ⚠️ Hands at roughly 12 and 4:30, never 12:00 — two hands at twelve are a
 * single vertical line, and at three they are a plus. The reference's angle is
 * traced: one hand straight up from the centre, one down-right at about the
 * same length.
 */
function TabClockGlyph({ size = 22, color }: TabGlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Circle cx={12} cy={12} r={8.75} {...stroke(color)} />
      <Path d="M12 7.1V12l3.6 3.2" {...stroke(color)} />
    </Svg>
  );
}

/**
 * ONE BUBBLE WITH A TAIL.
 *
 * ⚠️ A ROUNDED RECTANGLE WITH A TAIL, not an oval. An earlier draft was a
 * wide ellipse with a detached wedge under it, which at 21px is a pill with a
 * speck beside it. Traced off the reference: the left wall runs straight down
 * PAST the bottom edge into the point, and the bottom edge angles back up to
 * meet it. One outline, one closed path — the tail is part of the bubble, not
 * an object next to it.
 *
 * ⚠️ Not the two-bubble `MessagesGlyph` from `glyphs.tsx`. That one is a
 * filled family mark for a 44pt tile; at 21px its near bubble swallows the far
 * one and it becomes a blob. Same idea, different size, different drawing —
 * which is the one case where two marks for one thing is correct.
 */
function TabMessagesGlyph({ size = 22, color }: TabGlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Path
        d="M2.6 22.4V6.4A3.4 3.4 0 0 1 6 3h12.6A3.4 3.4 0 0 1 22 6.4V15a3.4 3.4 0 0 1-3.4 3.4H8.2Z"
        {...stroke(color)}
      />
    </Svg>
  );
}

/**
 * THREE DOTS, and they are FILLED.
 *
 * The one exception in this file, because an outlined 2px dot is a ring with
 * nothing in it. Filled reads as a dot at any size.
 */
export function TabMoreGlyph({ size = 22, color }: TabGlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Circle cx={5.4} cy={12} r={1.9} fill={color} />
      <Circle cx={12} cy={12} r={1.9} fill={color} />
      <Circle cx={18.6} cy={12} r={1.9} fill={color} />
    </Svg>
  );
}

/** A CALENDAR with one day taken out — time off, not "a date". */
function TabTimeOffGlyph({ size = 22, color }: TabGlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Rect x={3.4} y={5.2} width={17.2} height={15.4} rx={2.6} {...stroke(color)} />
      <Path d="M3.4 9.8h17.2M8 3.2v3.6M16 3.2v3.6" {...stroke(color)} />
      <Path d="M9.6 13.8h4.8" {...stroke(color)} />
    </Svg>
  );
}

/** TWO FIGURES. The far one is a shoulder and a head, no more. */
function TabTeamGlyph({ size = 22, color }: TabGlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Circle cx={9.4} cy={8.2} r={3.6} {...stroke(color)} />
      <Path d="M3.4 20.2a6 6 0 0 1 12 0" {...stroke(color)} />
      <Path d="M16.2 5.2a3.4 3.4 0 0 1 0 6.4M17.4 14.6a5.4 5.4 0 0 1 3.4 5" {...stroke(color)} />
    </Svg>
  );
}

/** A PLUS IN A RING — an action, not a place. */
function TabNewJobGlyph({ size = 22, color }: TabGlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Circle cx={12} cy={12} r={8.6} {...stroke(color)} />
      <Path d="M12 8.2v7.6M8.2 12h7.6" {...stroke(color)} />
    </Svg>
  );
}

/** Which mark a route wears. One map, so the pill and the More sheet agree. */
export const TAB_GLYPHS: Record<string, React.ComponentType<TabGlyphProps>> = {
  index: TabHomeGlyph,
  tasks: TabJobsGlyph,
  attendance: TabClockGlyph,
  chat: TabMessagesGlyph,
  'time-off': TabTimeOffGlyph,
  team: TabTeamGlyph,
  'create-task': TabNewJobGlyph,
};
