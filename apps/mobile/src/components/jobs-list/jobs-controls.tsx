import React from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/theme-context';
import { AText } from '../amazen';

/**
 * The Jobs tab's controls — `docs/design/job-flow.html` `.search`, `.seg`,
 * `.chip`. Every colour from `useTheme().amazen`, so light and dark follow
 * the member's setting.
 */

/** `.search` — a pill-shaped field on a well. */
export function SearchField({ value, onChange, placeholder, clearLabel }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  clearLabel: string;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: amazen.space(2.5),
        backgroundColor: c.well,
        borderRadius: amazen.radius.full,
        paddingHorizontal: amazen.space(4),
        height: 46,
      }}>
      <Ionicons name="search" size={18} color={c.inkMuted} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.inkMuted}
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel={placeholder}
        style={{ flex: 1, color: c.inkStrong, fontFamily: amazen.font.sans, fontSize: 14, paddingVertical: 0 }}
      />
      {value.length > 0 ? (
        <Pressable onPress={() => onChange('')} hitSlop={10} accessibilityRole="button" accessibilityLabel={clearLabel}>
          <Ionicons name="close-circle" size={18} color={c.inkMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** `.seg` — equal parts in a pill; the chosen one is a well lifted off the tile. */
export function Segmented<K extends string>({ options, value, onChange }: {
  options: ReadonlyArray<{ key: K; label: string; count?: number | null }>;
  value: K;
  onChange: (k: K) => void;
}) {
  const { amazen, isDark } = useTheme();
  const c = amazen.color;
  return (
    <View style={{ flexDirection: 'row', backgroundColor: c.tile, borderRadius: amazen.radius.full, padding: 3 }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.count != null ? `${o.label}, ${o.count}` : o.label}
            style={({ pressed }) => [
              {
                flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: amazen.space(1.5),
                minHeight: 36, borderRadius: amazen.radius.full, paddingHorizontal: amazen.space(1.5),
                backgroundColor: on ? c.well : 'transparent',
                opacity: pressed ? 0.8 : 1,
              },
              on
                ? {
                    shadowColor: '#000',
                    shadowOpacity: isDark ? 0.3 : 0.12,
                    shadowRadius: 4,
                    shadowOffset: { width: 0, height: 1 },
                    elevation: 1,
                  }
                : null,
            ]}
          >
            <AText
              variant="caption"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={{ fontSize: 13, lineHeight: 18, color: on ? c.inkStrong : c.ink, flexShrink: 1 }}
            >
              {o.label}
            </AText>
            {o.count != null ? (
              <AText numeric numberOfLines={1} style={{ fontSize: 11, lineHeight: 16, color: c.inkMuted }}>{String(o.count)}</AText>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** `.chip` — a row of choices that scrolls sideways. The chosen one is jade with a ring. */
export function FilterChips<K extends string>({ options, value, onChange }: {
  options: ReadonlyArray<{ key: K; label: string }>;
  value: K;
  onChange: (k: K) => void;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={{ marginHorizontal: -amazen.space(4) }}
      contentContainerStyle={{ gap: amazen.space(1.5), paddingHorizontal: amazen.space(4) }}
    >
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            style={({ pressed }) => ({
              borderRadius: amazen.radius.full, paddingVertical: 6, paddingHorizontal: 12,
              backgroundColor: on ? c.accentTint : c.tile,
              // Always 1.5pt, transparent when off — a ring that appears would nudge the row.
              borderWidth: 1.5, borderColor: on ? c.accent : 'transparent',
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <AText
              variant="caption"
              numberOfLines={1}
              style={{ fontSize: 12.5, lineHeight: 17, color: on ? c.accent : c.ink }}
            >
              {o.label}
            </AText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
