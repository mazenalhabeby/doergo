import React, { useMemo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { SvgAst, parse } from 'react-native-svg';
import { ICON_VIEWBOX, iconMarkup, type IconName } from '@hbcfield/shared/client';
import { useTheme } from '@/contexts/theme-context';
import type { GlyphProps } from '../glyphs/glyphs';

/*
  ⚠️ PARSED ONCE per drawing, not per mount. `SvgXml` parses its XML on every mount — fine for one icon, costly in a
  long list with an icon per row (the Ionicons font it replaced cost nothing there). The markup is the library's
  constant (a flat icon's colour is `currentColor`, given at render), so a few hundred entries at most; the cap is
  a guard, not a policy.
*/
const AST = new Map<string, ReturnType<typeof parse>>();
function astFor(xml: string): ReturnType<typeof parse> {
  let ast = AST.get(xml);
  if (ast === undefined) {
    ast = parse(xml);
    if (AST.size > 600) AST.clear();
    AST.set(xml, ast);
  }
  return ast;
}

/**
 * One of the product's icons (shared `SOLAR_ICONS` — the same shapes the web
 * draws), painted in THIS app's jade (`amazen.gradient.iconInk`, one per mode),
 * or `flat` in one colour for an icon on a coloured surface (the Send button).
 * Each icon is its own <svg>, so the gradient id cannot collide.
 */
export function InkIcon({
  name,
  size = 24,
  flat = false,
  color = '#ffffff',
  style,
  accessibilityLabel,
}: {
  name: IconName;
  size?: number;
  flat?: boolean;
  /** The colour of a flat icon. */
  color?: string;
  style?: StyleProp<ViewStyle>;
  /** Spoken name; without it the icon is decoration. */
  accessibilityLabel?: string;
}) {
  const { amazen } = useTheme();
  const [from, to] = amazen.gradient.iconInk;
  const ast = useMemo(
    () =>
      astFor(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${ICON_VIEWBOX}">` +
          (flat
            ? iconMarkup(name)
            : `<defs><linearGradient id="ink" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="` +
              `${to}"/></linearGradient></defs>${iconMarkup(name, 'url(#ink)')}`) +
          '</svg>',
      ),
    [name, flat, from, to],
  );
  return (
    <SvgAst
      ast={ast}
      // SvgAst applies its per-use props through `override` (SvgXml does the same internally).
      override={{
        width: size,
        height: size,
        color,
        style,
        accessible: !!accessibilityLabel,
        accessibilityLabel,
      }}
    />
  );
}

/**
 * THE icon (phone) — one mark from the shared library in one colour, the web's `<Icon>`. It replaced Ionicons
 * (2026-10-26); `mobile-icons.spec` keeps them out.
 */
export function Icon({
  name,
  size = 20,
  color,
  style,
  accessibilityLabel,
}: {
  name: IconName;
  size?: number;
  color: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  return <InkIcon name={name} size={size} flat color={color} style={style} accessibilityLabel={accessibilityLabel} />;
}

/** An ink icon where a screen asks for a Glyph component (sheet options, tiles). */
export function inkGlyph(name: IconName): React.ComponentType<GlyphProps> {
  const Ink = ({ size }: GlyphProps) => <InkIcon name={name} size={size} />;
  Ink.displayName = `Ink(${name})`;
  return Ink;
}

/**
 * A library icon where a screen asks for a Glyph, drawn FLAT in the colour that screen passes — the More rows
 * pass the accent, the home shortcuts the ink, exactly as they did for the hand-drawn marks.
 */
export function libGlyph(name: IconName): React.ComponentType<GlyphProps> {
  const Mark = ({ size, color }: GlyphProps) => <InkIcon name={name} size={size} flat color={color} />;
  Mark.displayName = `Lib(${name})`;
  return Mark;
}
