import React from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { portalColor, portalIcon } from '../../lib/portal-ui';

/**
 * The client portal's glyphs.
 *
 * Same construction as the staff family (`home/glyphs.tsx`) — one colour at
 * four opacities — but the portal KEEPS its hue, and that is the whole
 * difference between the two surfaces.
 *
 * ⚠️ It is not an inconsistency. On the staff home the icon colours were
 * decoration: four hues for four counts that mean nothing different from one
 * another, so they went ink. Here the hue is CATEGORY IDENTITY — a resident
 * finds Plumbing by colour as much as by shape, and the portal is a different
 * product for a different person. What was actually wrong here was thin stock
 * outlines sitting next to the new family, so these gain depth instead of
 * losing colour.
 */

interface PortalGlyphProps {
  size?: number;
  color: string;
}

const svg = (size: number) => ({ width: size, height: size, viewBox: '0 0 24 24' });

/** Report an issue — a spanner over a soft disc. */
export function ReportGlyph({ size = 28, color }: PortalGlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Circle cx={12} cy={12} r={10} fill={color} fillOpacity={0.16} />
      <Rect x={3.4} y={15.1} width={13.4} height={3.8} rx={1.9} fill={color} fillOpacity={0.55} origin="10.1, 17" rotation={-45} />
      <Path d="M20.6 4.1a5.3 5.3 0 0 0-7.2 7l1.7 1.7a5.3 5.3 0 0 0 7-7.2l-2.7 2.7-2.2-2.2z" fill={color} fillOpacity={0.95} />
    </Svg>
  );
}

/** My requests — a clipboard whose lines fade down the stack. */
export function RequestsGlyph({ size = 28, color }: PortalGlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Rect x={3.6} y={3.4} width={16.8} height={18.2} rx={3} fill={color} fillOpacity={0.28} />
      <Rect x={8.2} y={1.6} width={7.6} height={4} rx={1.6} fill={color} fillOpacity={0.95} />
      <Rect x={7} y={9.6} width={10} height={2.2} rx={1.1} fill={color} fillOpacity={0.95} />
      <Rect x={7} y={13.6} width={10} height={2.2} rx={1.1} fill={color} fillOpacity={0.55} />
      <Rect x={7} y={17.6} width={6.4} height={2.2} rx={1.1} fill={color} fillOpacity={0.4} />
    </Svg>
  );
}

/** Contact the office — a bubble with solid message lines. */
export function ContactGlyph({ size = 28, color }: PortalGlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Path
        d="M2.2 8.4a5 5 0 0 1 5-5h9.6a5 5 0 0 1 5 5v4.4a5 5 0 0 1-5 5h-6l-5.2 3.9a.8.8 0 0 1-1.3-.7v-3.6a5 5 0 0 1-2.1-4.1z"
        fill={color}
        fillOpacity={0.28}
      />
      <Rect x={6.4} y={8} width={11.2} height={2.3} rx={1.15} fill={color} fillOpacity={0.95} />
      <Rect x={6.4} y={12.1} width={7} height={2.3} rx={1.15} fill={color} fillOpacity={0.6} />
    </Svg>
  );
}

/** My account — a person on a soft disc. */
export function AccountGlyph({ size = 28, color }: PortalGlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Circle cx={12} cy={12} r={10} fill={color} fillOpacity={0.2} />
      <Circle cx={12} cy={9.4} r={3.9} fill={color} fillOpacity={0.95} />
      <Path d="M4.9 19.4a7.6 7.6 0 0 1 14.2 0 9.9 9.9 0 0 1-14.2 0z" fill={color} fillOpacity={0.95} />
    </Svg>
  );
}

/**
 * A report CATEGORY, in the family's construction.
 *
 * ⚠️ Categories are configured per portal from a fixed set of ~20 icon keys
 * (`portal-ui.ts`), and which ones a given building uses is the office's call,
 * not ours. Hand-drawing twenty glyphs to cover a set we do not control would
 * leave whichever key nobody drew rendering as a stock outline beside fifteen
 * layered ones — the exact inconsistency this was meant to remove.
 *
 * So the category keeps its existing mark and gains the family's SHAPE around
 * it: a solid glyph on a soft disc of its own hue, which is precisely how
 * Urgent and Electrical are built. Every one of the twenty gets it, and a key
 * added next year gets it for free.
 */
export function CategoryGlyph({
  icon,
  color,
  size = 26,
}: {
  icon?: string | null;
  color?: string | null;
  size?: number;
}) {
  const hue = portalColor(color);
  const disc = Math.round(size * 1.55);

  return (
    <View style={{ width: disc, height: disc, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          position: 'absolute',
          width: disc,
          height: disc,
          borderRadius: disc / 2,
          backgroundColor: `${hue}2B`,
        }}
      />
      <MaterialCommunityIcons name={portalIcon(icon)} size={size} color={hue} />
    </View>
  );
}
