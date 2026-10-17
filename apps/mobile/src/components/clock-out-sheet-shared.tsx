import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../contexts/theme-context';
import { AText } from './amazen';
import { heroParts } from './home/shift-state';

/** What the components of clock-out-sheet.tsx share (moved here unchanged). */
/** ② — the reasons, as KEYS. The label is looked up where it is rendered. */
export const EARLY_REASONS = ['finished', 'sentHome', 'unwell', 'other'] as const;

/** `8` `h` `12` `m` — the card's own helper, so the two can never drift. */
export function Hero({ minutes, warn }: { minutes: number; warn: boolean }) {
  const { amazen } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
      {heroParts(minutes).map((p, i) => (
        <React.Fragment key={i}>
          <AText
            variant="displaySm"
            tone={warn ? 'warn' : 'strong'}
            numeric
            style={i > 0 ? { marginLeft: amazen.space(2) } : undefined}
          >
            {p.value}
          </AText>
          <AText variant="decimal" tone={warn ? 'warn' : 'muted'} numeric>{p.unit}</AText>
        </React.Fragment>
      ))}
    </View>
  );
}

/**
 * Amber hatching.
 *
 * ⚠️ DRAWN, NOT A GRADIENT. React Native has no repeating-linear-gradient and
 * `expo-linear-gradient` cannot repeat, so a CSS-shaped answer here would be a
 * flat amber block that says "over" without looking unlike the rest of the bar.
 * Skewed bars at 135° read as hatching at 12pt tall, which is all this has to
 * do.
 */
export function Hatch({ flex }: { flex: number }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <View style={{ flex, backgroundColor: c.warnTint, overflow: 'hidden', flexDirection: 'row' }}>
      {Array.from({ length: 12 }).map((_, i) => (
        <View
          key={i}
          style={{
            width: 3, height: 26, marginRight: 4, marginTop: -7,
            backgroundColor: c.warn, opacity: 0.55,
            transform: [{ rotate: '45deg' }],
          }}
        />
      ))}
    </View>
  );
}

export function Row({
  label, value, tone = 'muted', flag,
}: { label: string; value: string; tone?: 'muted' | 'warn'; flag?: string | null }) {
  const { amazen } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: amazen.space(1.5) }}>
      <AText variant="caption" tone="muted" style={{ fontSize: 13.5 }}>{label}</AText>
      <View style={{ flex: 1 }} />
      {flag ? (
        <AText variant="caption" tone="warn" numeric style={{ fontSize: 12, marginRight: amazen.space(2) }}>{flag}</AText>
      ) : null}
      <AText variant="caption" tone={tone === 'warn' ? 'warn' : 'ink'} numeric style={{ fontSize: 13.5 }}>{value}</AText>
    </View>
  );
}

/** A `warn_tint` strip — a fact about a variance, never an error. */
export function Strip({ children, tone }: { children: React.ReactNode; tone: 'warn' }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <View
      style={{
        marginTop: amazen.space(4),
        backgroundColor: c.warnTint,
        borderRadius: amazen.radius.field,
        paddingVertical: amazen.space(3),
        paddingHorizontal: amazen.space(4),
      }}
    >
      <AText variant="caption" tone={tone}>{children}</AText>
    </View>
  );
}
