import React from 'react';
import { StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';
import { useTheme } from '../../contexts/theme-context';

/**
 * The three surfaces, and the only three.
 *
 *   Glass   floats on a gradient — the shift card, a hero panel.
 *   Well    a list. Opaque, because rows need a floor to sit on.
 *   Sunken  a field or a photo slot — something you put things INTO.
 *
 * ⚠️ Glass is translucent, so anything written on it must be measured against
 * the gradient BEHIND it, not against the glass. Use `inkOnGlass` on an
 * interior screen and `inkOnGlassHome` on the home screen. `inkMuted` is for a
 * WELL and composites to an unreadable wash on glass.
 */

export function GlassCard({ style, children, ...rest }: ViewProps) {
  const { amazen, isDark } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: amazen.color.glass,
          borderColor: amazen.color.lineGlass,
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderRadius: amazen.radius.surface,
          padding: amazen.layout.gutter,
        },
        shadowGlass(isDark),
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

export function Well({ style, children, ...rest }: ViewProps) {
  const { amazen } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: amazen.color.well,
          borderRadius: amazen.radius.panel,
          overflow: 'hidden',
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

export function Sunken({ style, children, ...rest }: ViewProps) {
  const { amazen } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: amazen.color.sunken,
          borderRadius: amazen.radius.field,
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderColor: amazen.color.lineField,
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

/** A hairline between rows in a well. Never a full-bleed line — it is inset. */
export function WellDivider({ inset = 0 }: { inset?: number }) {
  const { amazen } = useTheme();
  return (
    <View
      style={{
        height: StyleSheet.hairlineWidth * 2,
        backgroundColor: amazen.color.lineWell,
        marginLeft: inset,
      }}
    />
  );
}

/*
  Shadows — ⓓ derived. TOKENS.md names `shadow-glass`, `shadow-disc` and
  `shadow-disc-primary` and publishes no values.

  In dark they are near-invisible and the hairline does the separating; in
  light they are what lifts a translucent card off a pale gradient, which the
  hairline alone cannot do.
*/
export function shadowGlass(isDark: boolean): ViewStyle {
  return isDark
    ? { shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 6 }
    : { shadowColor: '#0b332a', shadowOpacity: 0.1, shadowRadius: 22, shadowOffset: { width: 0, height: 8 }, elevation: 4 };
}

export function shadowDisc(isDark: boolean): ViewStyle {
  return isDark
    ? { shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 }
    : { shadowColor: '#0b332a', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 };
}

/**
 * The glow is what marks a disc PRIMARY — not its size and not its position.
 *
 * ⚠️ IT IS A GLOW ON iOS AND A PLAIN SHADOW ON MOST ANDROIDS. `shadowColor`
 * only tints an elevation shadow from API 28, and below that Android draws it
 * black whatever it is given. The disc is still obviously the primary one —
 * it is the only FILLED disc in the row and that is what does the work; the
 * jade glow is the part that is nicer on iOS.
 *
 * Which is the reason the fill carries the meaning and the glow only
 * reinforces it. A primary action identifiable solely by a coloured shadow
 * would be identifiable on one platform.
 */
export function shadowDiscPrimary(accent: string): ViewStyle {
  return {
    shadowColor: accent,
    shadowOpacity: 0.55,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  };
}
