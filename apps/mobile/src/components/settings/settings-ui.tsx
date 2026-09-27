import React from 'react';
import { Pressable, ScrollView, Switch, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useTheme } from '../../contexts/theme-context';
import { useResponsive } from '../../lib/responsive';
import { AText, Ground, HeaderBack, ScreenHeader } from '../amazen';
import { centeredContent } from '../screen-container';

/**
 * A settings page: the app's ground and header, Back to the profile, and a
 * scrolling column. The four settings used to slide up as half-transparent
 * sheets over the profile, each drawn its own way.
 */
export function SettingsPage({ title, children }: { title: string; children: React.ReactNode }) {
  const { amazen } = useTheme();
  const r = useResponsive();
  const wide = r.isTablet ? centeredContent(640) : null;
  const back = () => (router.canGoBack() ? router.back() : router.navigate('/(app)/profile' as Href));
  return (
    <Ground style={{ flex: 1 }}>
      <ScreenHeader title={title} leading={<HeaderBack onPress={back} />} style={wide ?? undefined} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[{ paddingHorizontal: amazen.space(4), paddingBottom: amazen.space(12), gap: amazen.space(3) }, wide]}>
        {children}
      </ScrollView>
    </Ground>
  );
}

/** One answer among a few — the whole row is the target, the ring says which. */
export function ChoiceRow({ on, onPress, title, sub, lead, disabled }: {
  on: boolean; onPress: () => void; title: string; sub?: React.ReactNode; lead?: React.ReactNode; disabled?: boolean;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected: on, disabled: !!disabled }}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: amazen.space(3), padding: amazen.space(3.5), borderRadius: 20,
        backgroundColor: on ? c.accentTint : c.tile, borderWidth: 1.5, borderColor: on ? c.accent : 'transparent',
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      {lead}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <AText variant="body" tone="strong" style={{ fontSize: 15 }}>{title}</AText>
        {typeof sub === 'string' ? <AText variant="caption" tone="muted">{sub}</AText> : sub}
      </View>
      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? c.accent : c.lineGlass, backgroundColor: on ? c.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        {on ? <AText style={{ color: c.accentInk, fontSize: 12, lineHeight: 14 }}>✓</AText> : null}
      </View>
    </Pressable>
  );
}

/** A switch in a well: what it is, what it covers, and — when it cannot be changed — why. */
export function SwitchRow({ title, sub, value, onChange, disabled, first, note }: {
  title: string; sub?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean; first?: boolean; note?: string;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3), paddingVertical: amazen.space(3), borderTopWidth: first ? 0 : 1, borderTopColor: c.lineWell, opacity: disabled ? 0.55 : 1 }}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <AText variant="body" tone="strong" style={{ fontSize: 14.5 }}>{title}</AText>
        {sub ? <AText variant="caption" tone="muted">{sub}</AText> : null}
        {note ? <AText variant="caption" style={{ color: c.warn }}>{note}</AText> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: c.tile, true: c.accentSolid }}
        thumbColor="#ffffff"
        ios_backgroundColor={c.tile}
        accessibilityLabel={title}
      />
    </View>
  );
}
