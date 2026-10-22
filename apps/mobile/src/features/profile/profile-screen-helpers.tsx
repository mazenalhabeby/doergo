import React from 'react';
import { Pressable, View } from 'react-native';
import { useTheme, type ThemeMode } from '@/contexts/theme-context';
import { AText, Well, WellDivider, SectionLabel } from '@/components/amazen';
import { PROFILE_GLYPHS } from './profile-glyphs';

/** ProfileScreen's module-level helpers, moved here unchanged so its sections can read them too. */
export const THEME_MODE_I18N: Record<ThemeMode, string> = {
  system: 'profile.theme.system',
  light: 'profile.theme.light',
  dark: 'profile.theme.dark',
};

/** A labelled group of rows on a well. Children that render nothing leave no divider behind. */
export function Group({ label, children }: { label: string; children: React.ReactNode }) {
  const { amazen } = useTheme();
  const rows = React.Children.toArray(children).filter(Boolean);
  if (!rows.length) return null;
  return (
    <View style={{ gap: amazen.space(2) }}>
      <SectionLabel style={{ paddingHorizontal: amazen.space(1), paddingTop: amazen.space(1) }}>{label}</SectionLabel>
      <Well style={{ paddingHorizontal: amazen.space(3.5) }}>
        {rows.map((row, i) => (
          <React.Fragment key={i}>
            {i > 0 ? <WellDivider /> : null}
            {row}
          </React.Fragment>
        ))}
      </Well>
    </View>
  );
}

export function Row({
  glyph, label, value, valueTone, count = 0, countTone = 'warn', onPress,
}: {
  glyph: keyof typeof PROFILE_GLYPHS;
  label: string;
  value?: string;
  valueTone?: 'accent';
  count?: number;
  countTone?: 'warn' | 'critical';
  onPress: () => void;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const G = PROFILE_GLYPHS[glyph];
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={value ? `${label}, ${value}` : label}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: amazen.space(3),
        paddingVertical: amazen.space(3),
        opacity: pressed ? 0.8 : 1,
      })}>
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 11,
          backgroundColor: c.accentTint,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <G size={19} color={c.accent} contrast={c.well} />
      </View>
      <AText variant="body" tone="strong" numberOfLines={1} style={{ flex: 1, fontSize: 14.5 }}>{label}</AText>
      {value ? (
        <AText
          variant="caption"
          numberOfLines={1}
          style={{ fontSize: 13, color: valueTone === 'accent' ? c.accent : c.inkMuted, maxWidth: '40%' }}
        >
          {value}
        </AText>
      ) : null}
      {count > 0 ? (
        <View
          style={{
            minWidth: 22,
            height: 22,
            borderRadius: 11,
            paddingHorizontal: 6,
            backgroundColor: countTone === 'critical' ? c.criticalTint : c.warnTint,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <AText variant="caption" tone={countTone} numeric>{String(count)}</AText>
        </View>
      ) : null}
      <AText variant="body" tone="muted">›</AText>
    </Pressable>
  );
}
