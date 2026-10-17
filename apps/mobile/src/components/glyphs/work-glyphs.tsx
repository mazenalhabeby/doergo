import React from 'react';
import Svg, { Path, Rect, Circle, Ellipse } from 'react-native-svg';
// ⚠️ Resolves once this file is MOVED to apps/mobile/src/components/home/.
// It will not compile in the handoff folder — deliberately, so there is
// nothing to edit after the move.
import type { GlyphProps } from './glyphs';

/**
 * The active row's marks.
 *
 * Same construction as the rest of the family: ONE hue at four opacities
 * (.18 behind, .34 body, .55 detail, .95 the thing that names it), with the
 * detail PUNCHED out of the solid mark in `contrast`. Not outlines — an
 * outline has no mass at 19px inside a 46px disc, and 19px inside a 46px disc
 * is the size these are read at, outdoors, at arm's length.
 *
 * ⚠️ `contrast` is the SURFACE, not a colour choice. It is cut out of a solid
 * shape, so it must be the exact ground the mark sits on:
 *
 *   inside the filled jade button  →  a lighter jade (#1fc39c), NOT the card
 *   on a neutral disc              →  the tile's composited colour
 *
 * Wrong value does not error. It draws a grey ghost across the shape.
 *
 * ⚠️ The VERB is data; the mark is not. Button labels come from
 * `FlowStatus.label` and are organization-authored, so a workflow that calls
 * it "Roll out" still gets `OnMyWayGlyph`. Map these to the TRANSITION, never
 * to the wording.
 */

const svg = (size: number) => ({ width: size, height: size, viewBox: '0 0 24 24' });

/* ── The ladder ────────────────────────────────────────────────────────────── */

/**
 * A JOB CARD WITH THE CHECK CUT THROUGH IT.
 *
 * One object — the card *is* the acceptance. An earlier draft put a tick in a
 * badge on the corner, which is `DocumentsGlyph`'s construction and read as
 * "a document was approved" rather than "this job is mine now".
 */
export function AcceptGlyph({ size = 24, color, contrast = '#FFFFFF' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Rect x={6.6} y={2.6} width={14.6} height={15.4} rx={3} fill={color} fillOpacity={0.18} />
      <Rect x={3.4} y={4.6} width={14.6} height={15.4} rx={3} fill={color} fillOpacity={0.95} />
      <Path
        d="m7.4 12.4 2.9 2.9 5.8-6.6"
        fill="none"
        stroke={contrast}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * A VAN, GOING.
 *
 * ⚠️ Three things make this read, and all three were missing from the first
 * draft:
 *
 *   1. The arches are BITTEN OUT of the body in `contrast` before the wheels
 *      are drawn. Body and wheels are both .95 — overlap them without the bite
 *      and the wheels vanish into the body, leaving a box with two dots.
 *   2. The two marks behind it. They are the difference between "a van" and
 *      "on my way", which is what the button says.
 *   3. A raked windscreen big enough to survive 15px. The first one was a
 *      wedge and turned to mush.
 *
 * ⚠️ A van, not a car. This is field service and the silhouette should say so.
 */
export function OnMyWayGlyph({ size = 24, color, contrast = '#FFFFFF' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Path d="M1.5 10.4h3.1" fill="none" stroke={color} strokeOpacity={0.3} strokeWidth={1.9} strokeLinecap="round" />
      <Path d="M.9 13.6h3.7" fill="none" stroke={color} strokeOpacity={0.52} strokeWidth={1.9} strokeLinecap="round" />
      <Path
        d="M6.4 16.6V8.6a2 2 0 0 1 2-2h7v3.8h2.4l4 3.4v1.8a1 1 0 0 1-1 1Z"
        fill={color}
        fillOpacity={0.95}
      />
      <Circle cx={9.8} cy={17.2} r={3.7} fill={contrast} />
      <Circle cx={18.4} cy={17.2} r={3.7} fill={contrast} />
      <Circle cx={9.8} cy={17.2} r={2.7} fill={color} fillOpacity={0.95} />
      <Circle cx={18.4} cy={17.2} r={2.7} fill={color} fillOpacity={0.95} />
      <Circle cx={9.8} cy={17.2} r={1} fill={contrast} />
      <Circle cx={18.4} cy={17.2} r={1} fill={contrast} />
      <Path d="M15.9 10.9h1.6l2.8 2.4h-4.4Z" fill={contrast} />
    </Svg>
  );
}

/**
 * A SOLID PIN STANDING ON ITS OWN SHADOW.
 *
 * The shadow is what makes it *arrived* rather than *a place*. Without it this
 * is the same mark the route uses for a destination.
 */
export function ArrivedGlyph({ size = 24, color, contrast = '#FFFFFF' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Ellipse cx={12} cy={20.6} rx={5} ry={1.7} fill={color} fillOpacity={0.22} />
      <Path
        d="M12 2.2a6.7 6.7 0 0 0-6.7 6.7c0 4.9 6.7 11.2 6.7 11.2s6.7-6.3 6.7-11.2A6.7 6.7 0 0 0 12 2.2Z"
        fill={color}
        fillOpacity={0.95}
      />
      <Circle cx={12} cy={8.9} r={2.7} fill={contrast} />
    </Svg>
  );
}

/** THE SAME DISC AS `BreakGlyph`, a different mark inside. Family, not repetition. */
export function StartWorkGlyph({ size = 24, color, contrast = '#FFFFFF' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Circle cx={10.7} cy={10.7} r={8.3} fill={color} fillOpacity={0.18} />
      <Circle cx={12} cy={12} r={8.3} fill={color} fillOpacity={0.95} />
      <Path d="m9.9 8.1 6.2 3.9-6.2 3.9Z" fill={contrast} />
    </Svg>
  );
}

/**
 * A SEAL — three rings deep, the check cut out.
 *
 * ⚠️ Not a flag: the flag means an issue everywhere else in this app.
 * ⚠️ Not the same as Accept, though both carry a check. Accept is a card;
 * this is a disc. The silhouette is what separates them, not the mark inside.
 *
 * The weight is what makes it final. A check on its own is just another tick.
 */
export function FinishGlyph({ size = 24, color, contrast = '#FFFFFF' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Circle cx={12} cy={12} r={9.6} fill={color} fillOpacity={0.18} />
      <Circle cx={12} cy={12} r={8.6} fill={color} fillOpacity={0.34} />
      <Circle cx={12} cy={12} r={7.2} fill={color} fillOpacity={0.95} />
      <Path
        d="m8.6 12.2 2.4 2.4 4.6-5.2"
        fill="none"
        stroke={contrast}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/* ── The support marks ─────────────────────────────────────────────────────── */

/**
 * A HANDSET RINGING.
 *
 * The two arcs are the whole point: they are the difference between a phone
 * that exists and a call being made. The contact was only ever on the task
 * detail screen, and a blocked technician's first move is usually a phone call.
 */
export function CallGlyph({ size = 24, color, contrast = '#FFFFFF' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Path d="M20.4 1.8a9.6 9.6 0 0 1 2.4 2.4" fill="none" stroke={color} strokeOpacity={0.3} strokeWidth={1.9} strokeLinecap="round" />
      <Path d="M18.4 4.4a5.6 5.6 0 0 1 1.6 1.6" fill="none" stroke={color} strokeOpacity={0.55} strokeWidth={1.9} strokeLinecap="round" />
      <Path
        d={"M8.6 3.4c-1.1-.7-2.6-.3-3.2.9L4.3 6.4c-.5 1-.4 2.2.3 3.1a36 36 0 0 0 8.6 " + "8.6c.9.7 2.1.8 3.1.3l2.1-1.1c1.2-.6 " + "1.6-2.1.9-3.2l-1.4-2.2c-.6-.9-1.8-1.2-2.8-.7l-1.3.7a13.6 13.6 0 0 " + "1-4.2-4.2l.7-1.3c.5-1 .2-2.2-.7-2.8Z"}
        fill={color}
        fillOpacity={0.95}
      />
    </Svg>
  );
}

/** THE ARROW, SOLID, with its fold line punched out rather than drawn. */
export function NavigateGlyph({ size = 24, color, contrast = '#FFFFFF' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Path
        d="M21.6 2.9 3.3 10.4a.75.75 0 0 0 .1 1.4l7.3 2.3 2.3 7.3a.75.75 0 0 0 1.4.1Z"
        fill={color}
        fillOpacity={0.95}
      />
      <Path d="M11.7 13.4 21.6 2.9" fill="none" stroke={contrast} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

/**
 * THREE DOTS.
 *
 * The one mark in the set that should not be reinvented. Everything past the
 * first forward transition lives behind it — see SPEC.md §4.
 */
export function MoreGlyph({ size = 24, color }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Circle cx={5.4} cy={12} r={2.1} fill={color} fillOpacity={0.95} />
      <Circle cx={12} cy={12} r={2.1} fill={color} fillOpacity={0.95} />
      <Circle cx={18.6} cy={12} r={2.1} fill={color} fillOpacity={0.95} />
    </Svg>
  );
}
