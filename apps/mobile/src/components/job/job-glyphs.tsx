import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { GlyphProps } from '../glyphs/glyphs';

/**
 * The job page's small marks — the ones `docs/design/job-flow.html` draws that
 * the family does not have yet. Same law as `glyphs/`: one hue, solid, the
 * detail PUNCHED in `contrast` (the exact surface behind), never an outline
 * that has no mass at 18px.
 */
const svg = (size: number) => ({ width: size, height: size, viewBox: '0 0 24 24' });

/** A paper dart — sending a note. */
export function SendGlyph({ size = 24, color }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Path d="M3.4 20.4 21 12 3.4 3.6l-.4 6.6L15 12 3 13.8Z" fill={color} fillOpacity={0.95} />
    </Svg>
  );
}

/** A pencil — edit the job's details. */
export function EditGlyph({ size = 24, color, contrast = '#FFFFFF' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Path d="M15.6 3.6a2 2 0 0 1 2.8 0l2 2a2 2 0 0 1 0 2.8L9.2 19.6 3.6 21l1.4-5.6Z" fill={color} fillOpacity={0.95} />
      <Path d="m13.6 5.6 4.8 4.8" stroke={contrast} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

/** The tick inside a checked box. */
export function TickGlyph({ size = 24, color }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** A plus — add. */
export function PlusGlyph({ size = 24, color }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={2.6} strokeLinecap="round" />
    </Svg>
  );
}

/** A camera body with the lens punched out. */
export function CameraGlyph({ size = 24, color, contrast = '#FFFFFF' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Path d="M4 7h3l1.6-2.2h6.8L17 7h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" fill={color} fillOpacity={0.95} />
      <Circle cx={12} cy={13} r={3.6} fill={contrast} />
    </Svg>
  );
}

/** Two stacked prints — pick from the phone's photos. */
export function GalleryGlyph({ size = 24, color, contrast = '#FFFFFF' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Rect x={6.5} y={3} width={14.5} height={13} rx={2.5} fill={color} fillOpacity={0.3} />
      <Rect x={3} y={7} width={14.5} height={13} rx={2.5} fill={color} fillOpacity={0.95} />
      <Path d="m5 18 3.6-4.2 2.6 2.8 1.8-2 3 3.4Z" fill={contrast} />
      <Circle cx={13.2} cy={10.8} r={1.5} fill={contrast} />
    </Svg>
  );
}

/** A cross — close. */
export function CloseGlyph({ size = 24, color }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Path d="M6.5 6.5l11 11M17.5 6.5l-11 11" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

/** A warning triangle with its mark punched out — Report an issue. */
export function IssueGlyph({ size = 24, color, contrast = '#FFFFFF' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Path d="M12 2.5 1.5 21h21Z" fill={color} fillOpacity={0.95} />
      <Path d="M12 9v5.5" stroke={contrast} strokeWidth={2.4} strokeLinecap="round" />
      <Circle cx={12} cy={17.8} r={1.3} fill={contrast} />
    </Svg>
  );
}
