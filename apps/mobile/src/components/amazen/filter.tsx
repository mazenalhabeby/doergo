import React from 'react';
import { Pressable, ScrollView, TextInput, View, type TextInputProps } from 'react-native';
import { useTheme } from '../../contexts/theme-context';
import { AText } from './text';

/**
 * A choice in a filter row — "All 10", "Companies", a workspace.
 *
 * It was written out by hand on every new screen, and the copies had already
 * begun to differ in padding and in whether a dot was allowed. One pill, one
 * look: tile when off, jade outline when on.
 */
export function FilterPill({
  label, on, onPress, dot,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  /** A colour mark before the label — a role's colour, a presence. */
  dot?: string | null;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 220,
        borderRadius: amazen.radius.full, paddingHorizontal: amazen.space(3), paddingVertical: amazen.space(1.75),
        backgroundColor: on ? c.accentTint : c.tile, borderWidth: 1.5, borderColor: on ? c.accent : 'transparent',
      }}
    >
      {dot ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} /> : null}
      <AText variant="caption" numberOfLines={1} style={{ fontSize: 12.5, color: on ? c.accent : c.ink }}>{label}</AText>
    </Pressable>
  );
}

/** A row of pills that scrolls sideways when it outgrows the screen. */
export function FilterRow({ children }: { children: React.ReactNode }) {
  const { amazen } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }} contentContainerStyle={{ gap: amazen.space(1.5) }}>
      {children}
    </ScrollView>
  );
}

/** The search field that sits on the ground, above a list. */
export function SearchField(props: Omit<TextInputProps, 'style' | 'placeholderTextColor'>) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <TextInput
      autoCapitalize="none"
      autoCorrect={false}
      clearButtonMode="while-editing"
      returnKeyType="search"
      {...props}
      placeholderTextColor={c.inkOnGlass}
      style={{
        backgroundColor: c.glass, borderWidth: 1, borderColor: c.lineGlass, borderRadius: 16,
        paddingHorizontal: amazen.space(3.5), paddingVertical: amazen.space(3),
        color: c.inkStrong, fontFamily: amazen.font.sans, fontSize: 14,
      }}
    />
  );
}
