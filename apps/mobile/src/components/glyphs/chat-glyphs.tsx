import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { GlyphProps } from './glyphs';

/*
  Chat's own marks, in the home family's construction: ONE colour at fixed
  opacities, never a colour carrier (glyphs.tsx). The emoji they replace were
  multi-colour and drew differently on every phone.
*/
const svg = (size: number) => ({ width: size, height: size, viewBox: '0 0 24 24' });

/** Notifications for a conversation: a bell; `off` strikes it through. */
export function BellGlyph({ size = 24, color, off = false }: GlyphProps & { off?: boolean }) {
  return (
    <Svg {...svg(size)}>
      <Path
        d="M12 3a6 6 0 0 0-6 6v3.6L4.4 15.4A1 1 0 0 0 5.3 17h13.4a1 1 0 0 0 .9-1.6L18 12.6V9a6 6 0 0 0-6-6Z"
        fill={color}
        fillOpacity={off ? 0.3 : 0.95}
      />
      <Path d="M9.5 18.5a2.5 2.5 0 0 0 5 0Z" fill={color} fillOpacity={off ? 0.3 : 0.95} />
      {off ? <Path d="M4 4l16 16" stroke={color} strokeWidth={2.2} strokeLinecap="round" /> : null}
    </Svg>
  );
}

/** A file in a message (not a photo): a sheet with its corner folded. */
export function FileGlyph({ size = 24, color }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Path d="M6 3h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" fill={color} fillOpacity={0.3} />
      <Path d="M14 3v5h5" fill={color} fillOpacity={0.95} />
      <Rect x={8} y={12} width={8} height={1.8} rx={0.9} fill={color} fillOpacity={0.95} />
      <Rect x={8} y={15.5} width={5.5} height={1.8} rx={0.9} fill={color} fillOpacity={0.95} />
    </Svg>
  );
}

/** A group conversation: two people, the nearer one solid. */
export function GroupGlyph({ size = 24, color }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Circle cx={16} cy={8} r={3.2} fill={color} fillOpacity={0.3} />
      <Path d="M11 19.5c0-3 2.2-5.5 5-5.5s5 2.5 5 5.5Z" fill={color} fillOpacity={0.3} />
      <Circle cx={9} cy={8.5} r={3.6} fill={color} fillOpacity={0.95} />
      <Path d="M3 20c0-3.4 2.7-6 6-6s6 2.6 6 6Z" fill={color} fillOpacity={0.95} />
    </Svg>
  );
}

/** A job's chat: a clipboard with a speech line. */
export function JobChatGlyph({ size = 24, color }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Rect x={4.5} y={4} width={15} height={17} rx={2.4} fill={color} fillOpacity={0.3} />
      <Rect x={8.5} y={2.5} width={7} height={3.6} rx={1.4} fill={color} fillOpacity={0.95} />
      <Rect x={8} y={10} width={8} height={1.8} rx={0.9} fill={color} fillOpacity={0.95} />
      <Rect x={8} y={13.6} width={5.5} height={1.8} rx={0.9} fill={color} fillOpacity={0.95} />
    </Svg>
  );
}
