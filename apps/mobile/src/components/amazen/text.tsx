import React from 'react';
import { Text, type TextProps, type TextStyle } from 'react-native';
import { useTheme } from '../../contexts/theme-context';
import type { AmazenColors } from '../../theme/amazen';

export type TypeVariant =
  | 'display' | 'displaySm' | 'decimal' | 'h2' | 'h3' | 'body' | 'caption' | 'eyebrow';

/** Which ink. Named by ROLE, so a call site never picks a hex. */
export type Tone =
  | 'strong' | 'ink' | 'muted' | 'onGlass' | 'onGlassHome' | 'onGradient'
  | 'accent' | 'critical' | 'warn' | 'accentInk';

function toneColor(c: AmazenColors, tone: Tone): string {
  switch (tone) {
    case 'strong': return c.inkStrong;
    case 'ink': return c.ink;
    case 'muted': return c.inkMuted;
    case 'onGlass': return c.inkOnGlass;
    case 'onGlassHome': return c.inkOnGlassHome;
    case 'onGradient': return c.inkOnGradient;
    case 'accent': return c.accent;
    case 'critical': return c.critical;
    case 'warn': return c.warn;
    case 'accentInk': return c.accentInk;
  }
}

export interface ATextProps extends TextProps {
  variant?: TypeVariant;
  tone?: Tone;
  /**
   * Numerals read digit by digit — times, durations, ids, amounts in a row.
   * Sets IBM Plex Mono and, on iOS, tabular figures so a ticking clock does
   * not jitter. ⚠️ NEVER prose.
   */
  numeric?: boolean;
}

export function AText({
  variant = 'body',
  tone = 'ink',
  numeric = false,
  style,
  ...rest
}: ATextProps) {
  const { amazen } = useTheme();
  const base = amazen.type[variant] as TextStyle;
  /*
    IBM Plex Mono is already tabular by construction, so `fontVariant` adds
    nothing to the width — it is set because a font that fails to load falls
    back to the platform's own face, and there the feature is the difference
    between a clock that ticks and a clock that jitters.

    ⚠️ It is a no-op on some Android builds. Harmless, and the mono family is
    doing the real work; this is the belt to its braces.
  */
  const mono: TextStyle = numeric
    ? { fontFamily: amazen.font.mono, fontVariant: ['tabular-nums'] }
    : {};
  return (
    <Text
      style={[base, { color: toneColor(amazen.color, tone) }, mono, style]}
      {...rest}
    />
  );
}

/**
 * `ON THE CLOCK` — mono, uppercase, tracked.
 *
 * ⚠️ Uppercase is LATIN-ONLY. The app ships de/es/fr/it, all cased, so this is
 * safe today — but never set an eyebrow in a script that has no case, because
 * `textTransform: uppercase` there is either a no-op or a disfigurement.
 */
export function Eyebrow({ tone = 'onGlass', style, ...rest }: Omit<ATextProps, 'variant'>) {
  return <AText variant="eyebrow" tone={tone} style={style} {...rest} />;
}
