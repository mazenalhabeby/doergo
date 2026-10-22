import React, { createContext, useContext, useEffect } from 'react';
import { Platform, StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';
import Reanimated, { interpolate, interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/contexts/theme-context';

/**
 * The three surfaces, and the only three.
 *
 *   Glass   floats on a gradient — the shift card, a hero panel.
 *   Well    a list. Opaque, because rows need a floor to sit on.
 *   Sunken  a field or a photo slot — something you put things INTO.
 *
 * ⚠️ Glass is translucent, so anything written on it must be measured against
 * the gradient BEHIND it, not against the glass — that is `inkOnGlass`.
 * `inkMuted` is for a WELL and composites to an unreadable wash on glass.
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
        shadowUnderGlass(isDark),
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

/**
 * The glass shadow for a TRANSLUCENT surface. Android draws an elevation
 * shadow's body behind the view, so under anything see-through it shows as a
 * lighter rectangle inset in the card — there, glass gets no elevation.
 */
export function shadowUnderGlass(isDark: boolean): ViewStyle {
  const s = shadowGlass(isDark);
  return Platform.OS === 'android' ? { ...s, elevation: 0 } : s;
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

/* ═══════════════════════════════════════════════════════════════════════════
   ⭐ THE FIRST CARD LEADS.

   On the home, the surface is decided by POSITION, not by the widget: the
   first card is glass over the green, every card after it a well — the shift
   clock included. The home says which through this context; a card asks for
   `CardSurface` and wears whatever it is given, animating when it changes.

   ⚠️ Glass only works at the top, where the gradient is brightest. Lower down
   the ground is near-black and glass reads as a hole — which is why it is
   ONE card and never "any card the member likes".

   Off the home (the gallery's preview, an interior screen) there is no
   context and a card wears its own `fallback`.
   ═══════════════════════════════════════════════════════════════════════════ */

export type SurfaceKind = 'glass' | 'well';

const SurfaceContext = createContext<SurfaceKind | null>(null);

export function SurfaceProvider({ value, children }: { value: SurfaceKind; children: React.ReactNode }) {
  return <SurfaceContext.Provider value={value}>{children}</SurfaceContext.Provider>;
}

/** The surface this card sits on, if something decided it. `AText` reads it to pick readable greys. */
export function useSurface(): SurfaceKind | null {
  return useContext(SurfaceContext);
}

/** A card's own surface — glass or well — which cross-fades when its place changes. */
export function CardSurface({ fallback = 'well', style, children, ...rest }: ViewProps & { fallback?: SurfaceKind }) {
  const { amazen, isDark } = useTheme();
  const c = amazen.color;
  const kind = useContext(SurfaceContext) ?? fallback;
  const p = useSharedValue(kind === 'glass' ? 1 : 0);
  useEffect(() => { p.value = withTiming(kind === 'glass' ? 1 : 0, { duration: 450 }); }, [kind, p]);
  const shadow = shadowGlass(isDark);
  const shadowMax = Number(shadow.shadowOpacity ?? 0);
  const elevationMax = Number(shadow.elevation ?? 0);
  const glassy = kind === 'glass';
  const look = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(p.value, [0, 1], [c.well, c.glass]),
    borderColor: interpolateColor(p.value, [0, 1], ['#ffffff00', c.lineGlass]),
    borderRadius: interpolate(p.value, [0, 1], [amazen.radius.panel, amazen.radius.surface]),
    shadowOpacity: shadowMax * p.value,
    // Elevation cannot fade — it is on only for glass. (Android has no shadowOpacity.)
    /*
      ⚠️ NEVER AN ELEVATION UNDER GLASS ON ANDROID. Android draws the elevation
      shadow's own body BEHIND the view, and glass is translucent — so the
      shadow showed through as a lighter rectangle inset in the card. Glass on
      Android is lifted by its border and the gradient; iOS keeps the shadow.
    */
    elevation: Platform.OS === 'android' ? 0 : glassy ? elevationMax : 0,
  }));
  return (
    <Reanimated.View
      style={[
        {
          borderWidth: StyleSheet.hairlineWidth * 2,
          shadowColor: shadow.shadowColor,
          shadowRadius: shadow.shadowRadius,
          shadowOffset: shadow.shadowOffset,
          // A well's list must be clipped to its corners; glass must not clip its shadow.
          overflow: kind === 'glass' ? 'visible' : 'hidden',
        },
        look,
        style,
      ]}
      {...rest}
    >
      <SurfaceContext.Provider value={kind}>{children}</SurfaceContext.Provider>
    </Reanimated.View>
  );
}
