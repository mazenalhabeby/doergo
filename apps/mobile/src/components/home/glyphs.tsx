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

/**
 * An object resting on an OPEN HAND.
 *
 * ⚠️ Not a case with a handle. The first draft was exactly that, and a rounded
 * box with a handle arc on top is a shopping bag however you shade it.
 */
export function EquipmentGlyph({ size = 24, color }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Rect x={6.1} y={3} width={11.8} height={9.4} rx={2.4} fill={color} fillOpacity={0.32} />
      <Rect x={10.8} y={3} width={2.4} height={9.4} fill={color} fillOpacity={0.55} />
      <G fill="none" stroke={color} strokeOpacity={0.95} strokeWidth={2.7} strokeLinecap="round">
        <Path d="M2.9 15.1v.7a5 5 0 0 0 5 5h7.4a5 5 0 0 0 5-5v-.7" />
        <Path d="M20.3 15.1v-2a1.9 1.9 0 0 0-3.8 0" />
      </G>
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

/** ONE sheet with a rising badge — same construction as Documents, no confusing them. */
export function SendDocumentGlyph({ size = 24, color, contrast = '#FFFFFF' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Rect x={2.4} y={4.1} width={12.8} height={16.8} rx={2.6} fill={color} fillOpacity={0.32} />
      <Rect x={5.3} y={12.4} width={7} height={1.7} rx={0.85} fill={color} fillOpacity={0.55} />
      <Rect x={5.3} y={15.8} width={4.6} height={1.7} rx={0.85} fill={color} fillOpacity={0.55} />
      <Circle cx={17.2} cy={6.9} r={4.8} fill={color} fillOpacity={0.95} />
      <Path d="M17.2 9.3V4.6m-2.2 2.2 2.2-2.2 2.2 2.2" fill="none" stroke={contrast} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
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

function CalendarBase({ color }: { color: string }) {
  return (
    <>
      <Rect x={7} y={1.9} width={2.6} height={4.4} rx={1.3} fill={color} fillOpacity={0.5} />
      <Rect x={14.4} y={1.9} width={2.6} height={4.4} rx={1.3} fill={color} fillOpacity={0.5} />
      <Rect x={2.6} y={4} width={18.8} height={17.4} rx={3.2} fill={color} fillOpacity={0.28} />
      <Path d="M2.6 9.4h18.8" stroke={color} strokeOpacity={0.45} strokeWidth={1.6} />
    </>
  );
}

/** Today = the calendar with ONE cell solid. */
export function TodayGlyph({ size = 24, color }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <CalendarBase color={color} />
      <Rect x={6} y={12.4} width={5} height={5} rx={1.4} fill={color} fillOpacity={0.95} />
    </Svg>
  );
}

/** This week = the SAME calendar with a solid ROW. The distinction is the mark. */
export function WeekGlyph({ size = 24, color }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <CalendarBase color={color} />
      <Rect x={6} y={12.4} width={12} height={5} rx={1.6} fill={color} fillOpacity={0.95} />
    </Svg>
  );
}

export function UrgentGlyph({ size = 24, color }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Circle cx={12} cy={12} r={9.3} fill={color} fillOpacity={0.2} />
      <Path d="M13.9 3.6 6.6 13.5h4.2l-.7 6.9 7.3-9.9h-4.2z" fill={color} fillOpacity={0.95} />
    </Svg>
  );
}

export function CompletedGlyph({ size = 24, color }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Circle cx={12} cy={12} r={9.3} fill={color} fillOpacity={0.28} />
      <Path d="m7.5 12.2 3.1 3.1 6-6.3" fill="none" stroke={color} strokeOpacity={0.95} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function PendingGlyph({ size = 24, color }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Path d="M6.6 3.4h10.8v3.3c0 2.3-2.7 4-2.7 5.3s2.7 3 2.7 5.3v3.3H6.6v-3.3c0-2.3 2.7-4 2.7-5.3s-2.7-3-2.7-5.3z" fill={color} fillOpacity={0.28} />
      <Path d="M8.7 18.7h6.6v-1.1c0-1.5-1.7-2.7-3.3-2.7s-3.3 1.2-3.3 2.7z" fill={color} fillOpacity={0.95} />
      <Rect x={5.2} y={2.1} width={13.6} height={2.2} rx={1.1} fill={color} fillOpacity={0.55} />
      <Rect x={5.2} y={19.7} width={13.6} height={2.2} rx={1.1} fill={color} fillOpacity={0.55} />
    </Svg>
  );
}

/** Net work — a clock. */
export function NetWorkGlyph({ size = 24, color }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Circle cx={12} cy={12} r={9.3} fill={color} fillOpacity={0.26} />
      <Circle cx={12} cy={12} r={9.3} fill="none" stroke={color} strokeOpacity={0.4} strokeWidth={1.7} />
      <Path d="M12 6.6V12l3.9 2.3" fill="none" stroke={color} strokeOpacity={0.95} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Break — a cup on a solid saucer. */
export function BreakGlyph({ size = 24, color }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Path d="M9.4 1.9v1.7M12.6 1.9v1.7" stroke={color} strokeOpacity={0.45} strokeWidth={1.7} strokeLinecap="round" />
      <Path d="M3.5 6.3h12v6.4a6 6 0 0 1-12 0z" fill={color} fillOpacity={0.3} />
      <Path d="M15.9 8h1.6a2.8 2.8 0 0 1 0 5.6h-1.6" fill="none" stroke={color} strokeOpacity={0.5} strokeWidth={1.8} />
      <Rect x={2.2} y={19.5} width={16.4} height={2.4} rx={1.2} fill={color} fillOpacity={0.95} />
    </Svg>
  );
}

/* ── Needs list ────────────────────────────────────────────────────────────
   Solid marks with punched detail, NOT stacked layers — these sit on a tinted
   chip, where translucent layers composite to grey mud.                    */

export function BlockedGlyph({ size = 24, color, contrast = '#FFFFFF' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Circle cx={12} cy={12} r={9.4} fill={color} fillOpacity={0.92} />
      <G rotation={-45} origin="12, 12">
        <Rect x={5.6} y={10.5} width={12.8} height={3} rx={1.5} fill={contrast} />
      </G>
    </Svg>
  );
}

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
      <Path d="M3.2 12h3.4l2-5.6 3.3 11 2.3-5.4 1.4 2h5.2" fill="none" stroke={color} strokeOpacity={0.92} strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Open jobs — a list that fades down the stack. */
export function OpenJobsGlyph({ size = 24, color }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Rect x={2.4} y={4} width={3.4} height={3.4} rx={1.1} fill={color} fillOpacity={0.95} />
      <Rect x={8} y={4.4} width={13.6} height={2.6} rx={1.3} fill={color} fillOpacity={0.95} />
      <Rect x={2.4} y={10.3} width={3.4} height={3.4} rx={1.1} fill={color} fillOpacity={0.45} />
      <Rect x={8} y={10.7} width={13.6} height={2.6} rx={1.3} fill={color} fillOpacity={0.45} />
      <Rect x={2.4} y={16.6} width={3.4} height={3.4} rx={1.1} fill={color} fillOpacity={0.26} />
      <Rect x={8} y={17} width={13.6} height={2.6} rx={1.3} fill={color} fillOpacity={0.26} />
    </Svg>
  );
}

export type { G_ };
