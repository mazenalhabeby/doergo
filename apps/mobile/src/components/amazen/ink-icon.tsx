import React, { useMemo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { ICON_VIEWBOX, iconMarkup, type IconName } from '@hbcfield/shared/client';
import { useTheme } from '@/contexts/theme-context';
import type { GlyphProps } from '../glyphs/glyphs';

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
  const xml = useMemo(
    () =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${ICON_VIEWBOX}">` +
      (flat
        ? iconMarkup(name)
        : `<defs><linearGradient id="ink" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="` +
          `${to}"/></linearGradient></defs>${iconMarkup(name, 'url(#ink)')}`) +
      '</svg>',
    [name, flat, from, to],
  );
  return (
    <SvgXml
      xml={xml}
      width={size}
      height={size}
      color={color}
      style={style}
      accessible={!!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
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
