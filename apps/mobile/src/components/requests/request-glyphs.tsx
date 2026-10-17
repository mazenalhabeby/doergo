import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { RequestKind } from '@hbcfield/shared/client';
import type { GlyphProps } from '../glyphs/glyphs';

/**
 * The marks of a request — one per KIND, and one per kind of LEAVE.
 *
 * Same law as `glyphs/`: one hue, depth from opacity, never a second colour.
 * A kind reads before its words do; the colour stays free to say the STATE
 * (waiting / approved / declined) on the row beside it.
 */
const svg = (size: number) => ({ width: size, height: size, viewBox: '0 0 24 24' });

/** A sun — days away. */
function LeaveGlyph({ size = 24, color }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Circle cx={12} cy={12} r={4.6} fill={color} fillOpacity={0.95} />
      <Path d={"M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 " + "16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"} stroke={color} strokeOpacity={0.55} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

/** A house with a pin's dot over the door — working from somewhere that is not the site. */
function RemoteGlyph({ size = 24, color, contrast = '#FFFFFF' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Path
        d="M3 11.2 12 3.6l9 7.6"
        stroke={color}
        strokeOpacity={0.5}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path d="M5.4 10.2V20a1 1 0 0 0 1 1h11.2a1 1 0 0 0 1-1v-9.8L12 4.8Z" fill={color} fillOpacity={0.95} />
      <Rect x={10.2} y={14.4} width={3.6} height={6.6} rx={0.9} fill={contrast} />
    </Svg>
  );
}

/** A clock face with its hands — a different start or end. */
function HoursGlyph({ size = 24, color, contrast = '#FFFFFF' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Circle cx={12} cy={12} r={9.5} fill={color} fillOpacity={0.95} />
      <Path d="M12 6.8V12l3.6 2.2" stroke={contrast} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

/** A clock with a plus — time added, agreed in advance. */
function OvertimeGlyph({ size = 24, color, contrast = '#FFFFFF' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Circle cx={10.5} cy={12} r={8.5} fill={color} fillOpacity={0.3} />
      <Path
        d="M10.5 7.6V12l2.8 1.8"
        stroke={color}
        strokeOpacity={0.8}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Circle cx={17.6} cy={17.2} r={4.8} fill={color} fillOpacity={0.95} />
      <Path d="M17.6 15v4.4M15.4 17.2h4.4" stroke={contrast} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

/** A speech card — anything else, in words. */
function OtherGlyph({ size = 24, color, contrast = '#FFFFFF' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Path d={"M4.5 4h15A1.5 1.5 0 0 1 21 5.5v10a1.5 1.5 0 0 1-1.5 1.5H10l-4.6 " + "3.6V17h-.9A1.5 1.5 0 0 1 3 15.5v-10A1.5 1.5 0 0 1 4.5 4Z"} fill={color} fillOpacity={0.95} />
      <Path d="M7.2 9h9.6M7.2 12.4h6" stroke={contrast} strokeWidth={1.7} strokeLinecap="round" />
    </Svg>
  );
}

/** One mark per kind — the chooser, the list rows and the manager's queue all read this map. */
export const REQUEST_KIND_GLYPH: Record<RequestKind, React.ComponentType<GlyphProps>> = {
  LEAVE: LeaveGlyph,
  REMOTE: RemoteGlyph,
  HOURS: HoursGlyph,
  OVERTIME: OvertimeGlyph,
  OTHER: OtherGlyph,
};

export function RequestKindGlyph({ kind, ...rest }: GlyphProps & { kind: RequestKind }) {
  const G = REQUEST_KIND_GLYPH[kind];
  return <G {...rest} />;
}

export type LeaveMarkKind = 'vacation' | 'sickLeave' | 'family' | 'other';

/** The kinds of LEAVE — the leave chips on both the Requests tab and the Time tab. */
export function LeaveTypeMark({ kind, color, size = 20 }: { kind: LeaveMarkKind; color: string; size?: number }) {
  return (
    <Svg {...svg(size)}>
      {kind === 'vacation' ? (
        <>
          <Circle cx={12} cy={12} r={4.6} fill={color} />
          <Path d={"M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 " + "16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"} stroke={color} strokeOpacity={0.55} strokeWidth={1.8} strokeLinecap="round" />
        </>
      ) : kind === 'sickLeave' ? (
        <>
          <Circle cx={12} cy={12} r={9.5} fill={color} fillOpacity={0.18} />
          <Path d="M12 7v10M7 12h10" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
        </>
      ) : kind === 'family' ? (
        <Path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" fill={color} fillOpacity={0.85} />
      ) : (
        <>
          <Circle cx={6} cy={12} r={2} fill={color} fillOpacity={0.5} />
          <Circle cx={12} cy={12} r={2} fill={color} fillOpacity={0.75} />
          <Circle cx={18} cy={12} r={2} fill={color} />
        </>
      )}
    </Svg>
  );
}
