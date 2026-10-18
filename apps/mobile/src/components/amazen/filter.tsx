import React from 'react';
import { Pressable, ScrollView, TextInput, View, type TextInputProps } from 'react-native';
import { useTheme } from '../../contexts/theme-context';
import { CountBadge } from './count-badge';
import { AText } from './text';

/**
 * The one on/off pill — a filter choice ("All 10", "Companies", a workspace) or a
 * picked option. Tile when off, jade outline when on.
 *
 * It was written out by hand on every new screen, and the copies had already
 * begun to differ in padding and in whether a dot was allowed.
 *
 * - `truncate`: one line, capped at 220 — for workspace and client names in a
 *   scrolling filter row. Off by default: a role name the Members and Team
 *   filters show in full must stay in full.
 * - `disabled`: shown, not offered — a value somebody may read and not change.
 * - `count`: something waiting here (unread) — the same red count as the tab bar's.
 */
export function ChoicePill({
  label,
  on,
  onPress,
  dot,
  count,
  disabled,
  truncate = false,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  /** A colour mark before the label — a role's colour, a presence. */
  dot?: string | null;
  count?: number;
  disabled?: boolean;
  truncate?: boolean;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: on, disabled: !!disabled }}
      accessibilityLabel={count ? `${label}, ${count}` : undefined}
      style={{
        ...pillBox(amazen, on),
        ...(disabled && !on ? { opacity: 0.5 } : null),
        ...(truncate ? { maxWidth: 220 } : null),
      }}
    >
      {dot ? <PillDot color={dot} /> : null}
      <AText
        variant="caption"
        numberOfLines={truncate ? 1 : undefined}
        style={{ fontSize: 12.5, color: on ? c.accent : c.ink }}
      >
        {label}
      </AText>
      {count ? <CountBadge count={count} /> : null}
    </Pressable>
  );
}

/** The same pill on one line, for names in a scrolling filter row. */
export function FilterPill(props: Omit<React.ComponentProps<typeof ChoicePill>, 'truncate'>) {
  return <ChoicePill {...props} truncate />;
}

/**
 * A one-tap action that sits among pills — a quick phrase, "Add note". Drawn
 * exactly like an unselected ChoicePill so a row of both reads as one family;
 * it has no on state because it does something rather than picking something.
 * (`Chip` stays a status label, never a control.)
 */
export function ActionPill({ label, onPress }: { label: string; onPress: () => void }) {
  const { amazen } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({ ...pillBox(amazen, false), opacity: pressed ? 0.75 : 1 })}
    >
      <AText variant="caption" style={{ fontSize: 12.5, color: amazen.color.ink }}>
        {label}
      </AText>
    </Pressable>
  );
}

type Amazen = ReturnType<typeof useTheme>['amazen'];

/** Tile when off, jade outline when on. */
const pillBox = (amazen: Amazen, on: boolean) => ({
  flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6,
  borderRadius: amazen.radius.full, paddingHorizontal: amazen.space(3), paddingVertical: amazen.space(1.75),
  backgroundColor: on ? amazen.color.accentTint : amazen.color.tile, borderWidth: 1.5, borderColor: on ? amazen.color.accent : 'transparent',
});

function PillDot({ color }: { color: string }) {
  return <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />;
}

/** A row of pills that scrolls sideways when it outgrows the screen. */
export function FilterRow({ children }: { children: React.ReactNode }) {
  const { amazen } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={{ flexGrow: 0 }}
      contentContainerStyle={{ gap: amazen.space(1.5) }}>
      {children}
    </ScrollView>
  );
}

/** The search field that sits on the ground, above a list. */
export function SearchField(props: Omit<TextInputProps, 'style' | 'placeholderTextColor'>) {
  return (
    <GlassInput
      autoCapitalize="none"
      autoCorrect={false}
      clearButtonMode="while-editing"
      returnKeyType="search"
      {...props}
    />
  );
}

/**
 * The glass text field itself, with the input's own defaults — `SearchField`
 * is this plus search behaviour. The Members and Team searches use it bare.
 */
export function GlassInput(props: Omit<TextInputProps, 'style' | 'placeholderTextColor'>) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <TextInput
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
