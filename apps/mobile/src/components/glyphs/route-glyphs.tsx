import React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';
// ⚠️ Resolves once this file is MOVED to apps/mobile/src/components/home/.
// It will not compile in the handoff folder — deliberately, so there is
// nothing to edit after the move.
import type { GlyphProps } from './glyphs';

/**
 * The route card's marks.
 *
 * Same construction as the rest of the family: ONE hue at four opacities
 * (.18 behind, .34 body, .55 detail, .95 the thing that names it), with the
 * detail PUNCHED out of the solid mark in `contrast`. Not outlines — an
 * outline has no mass at 19px inside a 46px disc, and that is the size these
 * are read at, through a windscreen, in daylight.
 *
 * ⚠️ `contrast` is the SURFACE, not a colour choice. It is cut out of a solid
 * shape, so it must be the exact ground the mark sits on:
 *
 *   inside the filled jade button  →  a lighter jade (#1fc39c), NOT the card
 *   on a neutral disc              →  the tile's composited colour
 *
 * Wrong value does not error. It draws a grey ghost across the shape.
 *
 * ⚠️ NavigateGlyph is NOT here — it already exists in `work-glyphs.tsx` and
 * the route card uses that one. Two arrows drawn twice is how a family stops
 * being a family.
 */

const svg = (size: number) => ({ width: size, height: size, viewBox: '0 0 24 24' });

/* ── The two planning marks ────────────────────────────────────────────────── */

/**
 * A ROAD FROM WHERE YOU STAND TO A PIN.
 *
 * Two ends, deliberately different: a disc for the origin (a place with no
 * name — you) and a pin for the destination (a place with an address). The
 * road between them is the only stroked element in the set, at .34, because a
 * solid road at this size is a blob.
 *
 * This is the only mark that may sit on a button which triggers
 * `POST /routes/optimize`. See SPEC §6 — that call is billed per request.
 */
export function PlanRouteGlyph({ size = 24, color, contrast = '#0b0f12' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Path
        d="M6.3 18.8H13a3.5 3.5 0 0 0 0-7H9.2a3.5 3.5 0 0 1 0-7h4.2"
        fill="none"
        stroke={color}
        strokeOpacity={0.34}
        strokeWidth={2.3}
        strokeLinecap="round"
      />
      <Path
        d="M17.6 1.6a4.8 4.8 0 0 0-4.8 4.8c0 3.5 4.8 8 4.8 8s4.8-4.5 4.8-8a4.8 4.8 0 0 0-4.8-4.8Z"
        fill={color}
        fillOpacity={0.95}
      />
      <Circle cx={17.6} cy={6.4} r={1.9} fill={contrast} />
      <Circle cx={6.3} cy={18.8} r={3.6} fill={color} fillOpacity={0.95} />
      <Circle cx={6.3} cy={18.8} r={1.4} fill={contrast} />
    </Svg>
  );
}

/**
 * THE SAME ROAD, PLUS THE MARK THAT IT WAS COMPUTED.
 *
 * The four-point spark is the family's "a machine answered" sign, at two
 * sizes so it reads as a burst rather than a star. The destination pin is
 * gone: after optimizing, the end of the route is a fact, not a target.
 *
 * Belongs to Replan in the ⋯ menu and to the planner screen. It is never a
 * button on the card — see SPEC §6.
 */
export function OptimizedGlyph({ size = 24, color, contrast = '#0b0f12' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Path
        d="M3.4 19.6H10a3.5 3.5 0 0 0 0-7H6.6a3.5 3.5 0 0 1 0-7H12"
        fill="none"
        stroke={color}
        strokeOpacity={0.34}
        strokeWidth={2.3}
        strokeLinecap="round"
      />
      <Circle cx={3.4} cy={19.6} r={3.4} fill={color} fillOpacity={0.95} />
      <Circle cx={3.4} cy={19.6} r={1.3} fill={contrast} />
      <Path d="M17.4 1.2 19 5.2l4 1.6-4 1.6-1.6 4-1.6-4-4-1.6 4-1.6Z" fill={color} fillOpacity={0.95} />
      <Path d="m20.6 13.2.9 2.2 2.2.9-2.2.9-.9 2.2-.9-2.2-2.2-.9 2.2-.9Z" fill={color} fillOpacity={0.55} />
    </Svg>
  );
}

/* ── The two state marks ───────────────────────────────────────────────────── */
/* ── The end of the day ────────────────────────────────────────────────────── */
