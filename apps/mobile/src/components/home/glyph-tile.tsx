import React from 'react';
import { View } from 'react-native';
import { over } from '../../theme/amazen';
import type { GlyphProps } from '../glyphs/glyphs';

/**
 * A glyph in a rounded tile — the mark at the head of a row.
 *
 * ⭐ THE TILE IS SOLID. A punched glyph's `contrast` must be the exact colour
 * behind it (docs/design/icons/README.md rule 2), and a translucent tint has
 * no single colour. So the tint is composited over what the tile sits on, and
 * that one value is both the tile's fill and the glyph's punch — they cannot
 * disagree, because they are the same number.
 */
export function GlyphTile({
  Glyph, color, tint, behind, size = 30, glyphSize, radius = 10, children,
}: {
  Glyph?: React.ComponentType<GlyphProps>;
  /** The glyph's one hue. */
  color: string;
  /** The tile's colour — translucent is fine. */
  tint: string;
  /** The surface the tile sits on (opaque). */
  behind: string;
  size?: number;
  glyphSize?: number;
  radius?: number;
  /** Something other than a glyph — a count. */
  children?: React.ReactNode;
}) {
  const fill = over(tint, behind);
  return (
    <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: fill, alignItems: 'center', justifyContent: 'center' }}>
      {Glyph ? <Glyph size={glyphSize ?? Math.round(size * 0.57)} color={color} contrast={fill} /> : children}
    </View>
  );
}
