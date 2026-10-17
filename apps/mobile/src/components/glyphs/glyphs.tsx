import React from 'react';
import Svg, { Path, Rect, Circle, G } from 'react-native-svg';

/**
 * The home screen's glyph family.
 *
 * ONE colour at four opacities — .2 for what sits behind, .3 for the body, .5
 * for detail, .95 for the thing that names it — which is the construction
 * `onboarding-icons.tsx` already uses. The app gains a family rather than a
 * second style, and depth does the work colour used to do.
 *
 * ⚠️ The glyph is never the colour carrier. Every one of these was a different
 * hue before — an emerald calendar, an amber bolt, a green tick, a yellow
 * hourglass — four hues for four counts that mean nothing different from one
 * another. With them all ink, the colours that remain on the home screen all
 * state something: a task status, a badge count, an open shift, a geofence you
 * are inside. Pass a tone only where the tone is the message.
 *
 * ⚠️ `contrast` is the colour PUNCHED out of a solid mark, and it must be the
 * exact background the glyph sits on — the tile, or the chip. Getting it wrong
 * does not error, it draws a grey ghost over the shape. Defaults are wrong on
 * purpose-built surfaces, so callers on a tinted chip must pass it.
 *
 * ⚠️ Stacked translucent layers only read on a NEUTRAL surface. On a tinted row
 * they composite to grey mud — which is why the needs-list glyphs (Blocked,
 * Approve) are built the other way round: one solid shape with its detail cut
 * out of it. See `needs-list.tsx`.
 */

export interface GlyphProps {
  size?: number;
  /** The single hue every layer is drawn from. */
  color: string;
  /** The surface behind the glyph — used to punch detail out of solid marks. */
  contrast?: string;
}

type G_ = Omit<GlyphProps, 'size'> & { size: number };
const svg = (size: number) => ({ width: size, height: size, viewBox: '0 0 24 24' });

/* ── Quick actions ─────────────────────────────────────────────────────── */

/** A FILE — two sheets deep — with an approval seal: verification is what happens in there. */
export function DocumentsGlyph({ size = 24, color, contrast = '#FFFFFF' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Rect x={8.2} y={1.9} width={12.6} height={16.2} rx={2.6} fill={color} fillOpacity={0.16} />
      <Rect x={3} y={4.9} width={12.6} height={16.2} rx={2.6} fill={color} fillOpacity={0.34} />
      <Rect x={5.9} y={9.1} width={6.8} height={1.7} rx={0.85} fill={color} fillOpacity={0.55} />
      <Rect x={5.9} y={12.5} width={4.5} height={1.7} rx={0.85} fill={color} fillOpacity={0.55} />
      <Circle cx={17.4} cy={16.8} r={4.7} fill={color} fillOpacity={0.95} />
      <Path d="m15.3 16.8 1.6 1.6 3.1-3.2" fill="none" stroke={contrast} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Two bubbles, the near one solid — a conversation, not one speech mark. */
export function MessagesGlyph({ size = 24, color }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Rect x={2.1} y={3.2} width={14.2} height={10.6} rx={3.6} fill={color} fillOpacity={0.3} />
      <Path d="M6.4 13.2h4.1l-4.4 4.1z" fill={color} fillOpacity={0.3} />
      <Rect x={11.4} y={10.7} width={10.5} height={8.2} rx={3} fill={color} fillOpacity={0.95} />
      <Path d="M19.3 18.4h-3.5l3.8 3.4z" fill={color} fillOpacity={0.95} />
    </Svg>
  );
}

/** A life ring: rescue, not a question mark. */
export function SupportGlyph({ size = 24, color }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Circle cx={12} cy={12} r={5.4} fill={color} fillOpacity={0.16} />
      <Circle cx={12} cy={12} r={9.1} fill="none" stroke={color} strokeOpacity={0.32} strokeWidth={3.5} />
      <G stroke={color} strokeOpacity={0.95} strokeWidth={2.5} strokeLinecap="round">
        <Path d="M7.3 7.3l3.2 3.2M16.7 7.3l-3.2 3.2M7.3 16.7l3.2-3.2M16.7 16.7l-3.2-3.2" />
      </G>
    </Svg>
  );
}

/* ── Stat cards ────────────────────────────────────────────────────────── */
/*
  ⚠️ `BreakGlyph` WAS HERE — a cup on a saucer — AND MOVED to
  `shift-glyphs.tsx`, where it is the PAUSE: two bars punched through a disc.
  The name is unchanged and every caller still resolves through this folder's
  `index.ts`, so nothing needs editing but the mark itself.

  The cup was the wrong claim. A rest is the clock stopping, not lunch.
*/

/* ── Needs list ────────────────────────────────────────────────────────────
   Solid marks with punched detail, NOT stacked layers — these sit on a tinted
   chip, where translucent layers composite to grey mud.                    */

export function ApproveGlyph({ size = 24, color, contrast = '#FFFFFF' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Circle cx={10.4} cy={10.4} r={8.6} fill={color} fillOpacity={0.92} />
      <Path d="M10.4 5.5v5.2l3.3 1.9" fill="none" stroke={contrast} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      {/* The punched ring keeps the badge from merging into the clock. */}
      <Circle cx={17.8} cy={17.8} r={5.4} fill={contrast} />
      <Circle cx={17.8} cy={17.8} r={4.1} fill={color} fillOpacity={0.92} />
      <Path d="m16 17.8 1.4 1.4 2.6-2.7" fill="none" stroke={contrast} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function ActivityGlyph({ size = 24, color }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Circle cx={12} cy={12} r={9.4} fill={color} fillOpacity={0.18} />
      <Path
        d="M3.2 12h3.4l2-5.6 3.3 11 2.3-5.4 1.4 2h5.2"
        fill="none"
        stroke={color}
        strokeOpacity={0.92}
        strokeWidth={2.3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export type { G_ };

/**
 * FOUR PANELS IN A GRID — the home screen itself, seen from above.
 *
 * ⚠️ Its OUTLINE is what identifies it: nothing else in the family is a 2×2.
 * The four opacities are the law — .18 behind, .34 body, .55 detail, .95 the
 * naming thing — and here they read as depth in the grid rather than as four
 * different panels, so the top-left one is the widget you are about to add.
 *
 * Three elements is the ceiling and this is one shape repeated, not four
 * ideas: at 24px it is a grid, which is the only thing it has to say.
 */
export function WidgetsGlyph({ size = 24, color }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Rect x={2.6} y={2.6} width={8.2} height={8.2} rx={2.4} fill={color} fillOpacity={0.95} />
      <Rect x={13.2} y={2.6} width={8.2} height={8.2} rx={2.4} fill={color} fillOpacity={0.55} />
      <Rect x={2.6} y={13.2} width={8.2} height={8.2} rx={2.4} fill={color} fillOpacity={0.34} />
      <Rect x={13.2} y={13.2} width={8.2} height={8.2} rx={2.4} fill={color} fillOpacity={0.18} />
    </Svg>
  );
}
