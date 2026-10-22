import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { GlyphProps } from '../../components/glyphs/glyphs';
import { DocumentsGlyph, SupportGlyph } from '../../components/glyphs/glyphs';
import { MyEquipmentGlyph, SyncGlyph } from '../../components/glyphs/tile-glyphs';
import { ReminderGlyph } from '../../components/glyphs/crm-glyphs';

/*
  The Profile page's marks — one colour, depth from opacity, the family's law.
  Existing marks are reused where the thing already has one; these are the
  settings that never had a mark of their own.
*/
const box = (size: number) => ({ width: size, height: size, viewBox: '0 0 24 24' });

function AppearanceGlyph({ size = 24, color }: GlyphProps) {
  return (
    <Svg {...box(size)}>
      <Circle cx={12} cy={12} r={8.5} fill={color} fillOpacity={0.18} />
      <Path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill={color} />
    </Svg>
  );
}
function ClockGlyph({ size = 24, color }: GlyphProps) {
  return (
    <Svg {...box(size)}>
      <Circle cx={12} cy={12} r={8.5} fill={color} fillOpacity={0.18} />
      <Path d="M12 7.2V12l3.2 2" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}
function LanguageGlyph({ size = 24, color }: GlyphProps) {
  return (
    <Svg {...box(size)}>
      <Rect x={2.8} y={4} width={12} height={10} rx={3} fill={color} fillOpacity={0.28} />
      <Rect x={9.2} y={10} width={12} height={10} rx={3} fill={color} />
    </Svg>
  );
}
function LockGlyph({ size = 24, color }: GlyphProps) {
  return (
    <Svg {...box(size)}>
      <Path d="M7.5 10.5V8a4.5 4.5 0 0 1 9 0v2.5" fill="none" stroke={color} strokeOpacity={0.55} strokeWidth={2.2} />
      <Rect x={5} y={10} width={14} height={10.5} rx={3} fill={color} />
    </Svg>
  );
}
function HelpGlyph({ size = 24, color }: GlyphProps) {
  return (
    <Svg {...box(size)}>
      <Circle cx={12} cy={12} r={9} fill={color} fillOpacity={0.18} />
      <Path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5v.6" fill="none" stroke={color} strokeWidth={2.1} strokeLinecap="round" />
      <Circle cx={12} cy={16.9} r={1.25} fill={color} />
    </Svg>
  );
}
function TourGlyph({ size = 24, color }: GlyphProps) {
  return (
    <Svg {...box(size)}>
      <Circle cx={12} cy={12} r={9} fill={color} fillOpacity={0.18} />
      <Path d="M15.6 8.4 13.3 13.3 8.4 15.6 10.7 10.7z" fill={color} />
    </Svg>
  );
}
function StarGlyph({ size = 24, color }: GlyphProps) {
  return (
    <Svg {...box(size)}>
      <Path d="M12 3.5l2.5 5.2 5.7.7-4.2 3.9 1.1 5.6L12 16.1l-5.1 2.8 1.1-5.6-4.2-3.9 5.7-.7z" fill={color} />
    </Svg>
  );
}
function PageGlyph({ size = 24, color }: GlyphProps) {
  return (
    <Svg {...box(size)}>
      <Path d="M6 3h8.5L19 7.5V21H6z" fill={color} fillOpacity={0.22} />
      <Path d="M9 11.5h6M9 15h4.5" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}
function ShieldGlyph({ size = 24, color }: GlyphProps) {
  return (
    <Svg {...box(size)}>
      <Path d="M12 3 19 5.8V11c0 4.6-3 8.2-7 10-4-1.8-7-5.4-7-10V5.8z" fill={color} fillOpacity={0.22} />
      <Path d="m9 12 2.2 2.2L15.2 10" fill="none" stroke={color} strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
function InfoGlyph({ size = 24, color }: GlyphProps) {
  return (
    <Svg {...box(size)}>
      <Circle cx={12} cy={12} r={9} fill={color} fillOpacity={0.18} />
      <Path d="M12 11v5.5" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
      <Circle cx={12} cy={7.8} r={1.3} fill={color} />
    </Svg>
  );
}
function DownloadGlyph({ size = 24, color }: GlyphProps) {
  return (
    <Svg {...box(size)}>
      <Circle cx={12} cy={12} r={9} fill={color} fillOpacity={0.18} />
      <Path
        d="M12 7v8M8.5 11.8 12 15.3l3.5-3.5"
        fill="none"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Clock in: a place mark. */
function ClockInPlaceGlyph({ size = 24, color }: GlyphProps) {
  return (
    <Svg {...box(size)}>
      <Path d="M12 21.5s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11z" fill={color} fillOpacity={0.18} />
      <Circle cx={12} cy={10.5} r={2.6} fill={color} />
    </Svg>
  );
}

export const PROFILE_GLYPHS = {
  clockIn: ClockInPlaceGlyph,
  equipment: MyEquipmentGlyph,
  documents: DocumentsGlyph,
  sync: SyncGlyph,
  notifications: ReminderGlyph,
  appearance: AppearanceGlyph,
  timeFormat: ClockGlyph,
  language: LanguageGlyph,
  account: LockGlyph,
  help: HelpGlyph,
  support: SupportGlyph,
  tour: TourGlyph,
  rate: StarGlyph,
  terms: PageGlyph,
  privacy: ShieldGlyph,
  about: InfoGlyph,
  update: DownloadGlyph,
} satisfies Record<string, React.ComponentType<GlyphProps>>;
