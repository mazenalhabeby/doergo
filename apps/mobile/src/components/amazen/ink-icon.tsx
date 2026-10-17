import React, { useMemo } from 'react';
import { SvgXml } from 'react-native-svg';
import { ICON_VIEWBOX, iconMarkup, type IconName } from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
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
}: {
  name: IconName;
  size?: number;
  flat?: boolean;
  /** The colour of a flat icon. */
  color?: string;
}) {
  const { amazen } = useTheme();
  const [from, to] = amazen.gradient.iconInk;
  const xml = useMemo(
    () =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${ICON_VIEWBOX}">` +
      (flat
        ? iconMarkup(name)
        : `<defs><linearGradient id="ink" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>${iconMarkup(name, 'url(#ink)')}`) +
      '</svg>',
    [name, flat, from, to],
  );
  return <SvgXml xml={xml} width={size} height={size} color={color} />;
}

/** An ink icon where a screen asks for a Glyph component (sheet options, tiles). */
export function inkGlyph(name: IconName): React.ComponentType<GlyphProps> {
  const Ink = ({ size }: GlyphProps) => <InkIcon name={name} size={size} />;
  Ink.displayName = `Ink(${name})`;
  return Ink;
}
