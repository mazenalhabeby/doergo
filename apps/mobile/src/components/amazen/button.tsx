import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/contexts/theme-context';
import { AText } from './text';

/**
 * The primary — a lit jade pill.
 *
 * ⚠️ The LIGHT gradient is `#087961 → #0b8168` and NOT the published
 * `accentLift → accentSolid`: white on `accentLift`'s light value (#14a586)
 * measures 3.11:1 and fails, and the gradient runs top-to-bottom so the label
 * sits on the failing half. `TOKENS.md` §3. The pair used here is 5.36:1 and
 * 4.82:1 and still reads as lit.
 */
export function PrimaryButton({
  label,
  detail,
  onPress,
  disabled,
  loading,
  style,
}: {
  label: string;
  /**
   * A few characters of fact after the label — "3 stops · 32 km". ⚠️ Never a
   * name or a title: a button that carries one wraps onto two lines, cut
   * differently in every language.
   */
  detail?: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}) {
  const { amazen } = useTheme();
  const off = disabled || loading;
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={({ pressed }) => [
        {
          borderRadius: amazen.radius.full,
          overflow: 'hidden',
          minHeight: amazen.layout.tapMin,
          opacity: off ? 0.5 : pressed ? 0.88 : 1,
        },
        style,
      ]}
    >
      <LinearGradient
        colors={amazen.gradient.primary as unknown as [string, string, ...string[]]}
        style={{
          paddingVertical: amazen.space(3),
          paddingHorizontal: amazen.space(6),
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: amazen.space(2),
          minHeight: amazen.layout.tapMin,
        }}
      >
        {loading ? <ActivityIndicator size="small" color={amazen.color.accentInk} /> : null}
        <AText variant="h3" tone="accentInk" numberOfLines={1} style={{ flexShrink: 1 }}>{label}</AText>
        {detail ? (
          <AText
            variant="caption"
            tone="accentInk"
            numeric
            numberOfLines={1}
            style={{ fontFamily: amazen.font.mono, opacity: 0.75 }}
          >
            {detail}
          </AText>
        ) : null}
      </LinearGradient>
    </Pressable>
  );
}

/** The quiet one — a hairline pill on the tile. */
export function GhostButton({
  label,
  onPress,
  disabled,
  tone = 'strong',
  style,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  tone?: 'strong' | 'accent' | 'critical';
  style?: ViewStyle;
}) {
  const { amazen } = useTheme();
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        {
          borderRadius: amazen.radius.full,
          backgroundColor: amazen.color.tile,
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderColor: amazen.color.lineGlass,
          paddingVertical: amazen.space(3),
          paddingHorizontal: amazen.space(5),
          minHeight: amazen.layout.tapMin,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      <AText variant="h3" tone={tone}>{label}</AText>
    </Pressable>
  );
}

/**
 * A chip — `QUEUED`, a status, a count. Never a control on its own.
 */
export function Chip({
  label,
  tone = 'neutral',
  numeric = false,
}: {
  label: string;
  tone?: 'neutral' | 'accent' | 'warn' | 'critical';
  numeric?: boolean;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const map = {
    neutral: { bg: c.tile, fg: 'muted' as const },
    accent: { bg: c.accentTint, fg: 'accent' as const },
    warn: { bg: c.warnTint, fg: 'warn' as const },
    critical: { bg: c.criticalTint, fg: 'critical' as const },
  }[tone];
  return (
    <View
      style={{
        backgroundColor: map.bg,
        borderRadius: amazen.radius.full,
        paddingHorizontal: amazen.space(2.5),
        paddingVertical: amazen.space(1),
      }}
    >
      <AText variant="caption" tone={map.fg} numeric={numeric}>{label}</AText>
    </View>
  );
}
