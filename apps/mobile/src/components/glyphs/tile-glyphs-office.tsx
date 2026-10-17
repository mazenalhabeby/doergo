import Svg, { Path, Rect, Circle } from 'react-native-svg';
import type { GlyphProps } from './glyphs';

/** The office tile marks (people, rota, clients, register) — moved here unchanged from tile-glyphs.tsx. */
export const svg = (size: number) => ({ width: size, height: size, viewBox: '0 0 24 24' });

/**
 * A SET, NOT A PERSON.
 *
 * The second figure at .34 behind the first. `OnClockGlyph` is one person
 * doing something; this is the roll.
 */
export function MembersGlyph({ size = 24, color }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Circle cx={17.2} cy={7.4} r={3.6} fill={color} fillOpacity={0.34} />
      <Path d="M17.2 12.4c-3 0-5.4 2.2-5.4 5v1.8h10.8v-1.8c0-2.8-2.4-5-5.4-5Z" fill={color} fillOpacity={0.34} />
      <Circle cx={9} cy={6.6} r={4.4} fill={color} fillOpacity={0.95} />
      <Path d="M9 12.8c-3.6 0-6.6 2.8-6.6 6.2v2.2h13.2v-2.2c0-3.4-3-6.2-6.6-6.2Z" fill={color} fillOpacity={0.95} />
    </Svg>
  );
}

/** SEALED. An open flap would say "received"; these are ones you sent. */
export function InvitationsGlyph({ size = 24, color, contrast = '#0b0f12' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Rect x={1.8} y={4.4} width={20.4} height={15.2} rx={3} fill={color} fillOpacity={0.95} />
      <Path
        d="M3.6 6.8 12 13l8.4-6.2"
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
 * A WEEK WITH SHIFT BARS PUNCHED OUT OF IT.
 *
 * The app's `WeekGlyph` is a calendar you read; this is a rota you set — four
 * bars of unequal height, which is what a schedule looks like and a calendar
 * never does.
 */
export function SchedulesGlyph({ size = 24, color, contrast = '#0b0f12' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Rect x={1.8} y={3.4} width={20.4} height={17.2} rx={3.2} fill={color} fillOpacity={0.95} />
      <Path d="M1.8 8.2h20.4" fill="none" stroke={contrast} strokeWidth={1.5} />
      <Rect x={4.6} y={10.6} width={3} height={7.4} rx={1.4} fill={contrast} />
      <Rect x={9} y={12.6} width={3} height={5.4} rx={1.4} fill={contrast} />
      <Rect x={13.4} y={10.6} width={3} height={7.4} rx={1.4} fill={contrast} />
      <Rect x={17.8} y={14.4} width={3} height={3.6} rx={1.4} fill={contrast} />
    </Svg>
  );
}

/**
 * A BOOK OF THEM, NOT ONE OF THEM.
 *
 * ⚠️ `AddClientGlyph` is ONE card with a plus. This is the list. And neither
 * is `JoinQueueGlyph`, which is a person asking to join the organization —
 * a colleague, not a record. Three plus-shaped ideas, three marks, never
 * swapped.
 */
export function ClientsGlyph({ size = 24, color, contrast = '#0b0f12' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Rect x={5.4} y={2.4} width={16.2} height={12.4} rx={2.8} fill={color} fillOpacity={0.26} />
      <Rect x={2.4} y={6.8} width={16.2} height={14.4} rx={2.8} fill={color} fillOpacity={0.95} />
      <Circle cx={7.8} cy={12.2} r={2.4} fill={contrast} />
      <Path d="M4.4 17.6c.7-1.8 2-2.7 3.4-2.7s2.7.9 3.4 2.7Z" fill={contrast} />
      <Path d="M12.8 11.4h3.6M12.8 14.4h3.6" fill="none" stroke={contrast} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

/**
 * THE REGISTER — a workspace's equipment, stacked: one crate behind another,
 * the front one labelled. `MyEquipmentGlyph` is the case YOU carry (a
 * handle); this is the store of everything the workspace has (no handle, two
 * crates), so the two read apart side by side.
 */
export function RegisterGlyph({ size = 24, color, contrast = '#0b0f12' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Rect x={4.6} y={2.4} width={14.8} height={8.4} rx={2.4} fill={color} fillOpacity={0.34} />
      <Rect x={1.6} y={8.6} width={20.8} height={13} rx={3.2} fill={color} fillOpacity={0.95} />
      <Rect x={8.2} y={12.4} width={7.6} height={3.4} rx={1.2} fill={contrast} />
    </Svg>
  );
}

/**
 * A CLIENT'S REQUEST — a speech bubble with a house punched out of it: what a
 * resident said about where they live. The bubble's tail sets it apart from
 * the square marks in the same row.
 */
export function ClientRequestsGlyph({ size = 24, color, contrast = '#0b0f12' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Path
        d="M4.6 2.2h14.8A3 3 0 0 1 22.4 5.2v10.4a3 3 0 0 1-3 3H10.2l-4.8 3.6v-3.6h-.8a3 3 0 0 1-3-3V5.2a3 3 0 0 1 3-3z"
        fill={color}
        fillOpacity={0.95}
      />
      <Path d="M12 5.6l-4.6 4v5h3.2v-3h2.8v3h3.2v-5z" fill={contrast} />
    </Svg>
  );
}
