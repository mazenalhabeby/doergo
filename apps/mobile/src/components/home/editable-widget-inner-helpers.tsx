import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '../../contexts/theme-context';
import { AText } from '../amazen';
import { shadowGlass } from '../amazen/surfaces';

/** EditableWidgetInner's module-level helpers, moved here unchanged so its sections can read them too. */
/**
 * The neutral ⊖.
 *
 * ⚠️ NEVER RED, AND THIS IS NOT A STYLE NOTE. Removing a widget deletes
 * nothing — the key stays in storage, hidden, and switching it back on returns
 * it to the position it was arranged into. A red badge states a destructive
 * act, so the member either hesitates over a reversible one or learns that red
 * in this app does not mean what it means everywhere else. Both are worse than
 * a grey mark.
 *
 * `raised` surface → `barFill`, the kit's one solid neutral that is made to sit
 * over the gradient. `ink2` stroke → `ink`.
 */
export function RemoveBadge({ label, onPress }: { label: string; onPress: () => void }) {
  const { amazen, isDark } = useTheme();
  const c = amazen.color;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10}
      style={({ pressed }) => [
        {
          position: 'absolute',
          top: -9,
          left: -9,
          width: 26,
          height: 26,
          borderRadius: amazen.radius.full,
          backgroundColor: c.barFill,
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderColor: c.lineWell,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.7 : 1,
        },
        shadowGlass(isDark),
      ]}
    >
      {/* The bar of a ⊖, drawn rather than typed: the character's width and
          optical centre differ on every platform font. */}
      <View style={{ width: 11, height: 1.8, borderRadius: 1, backgroundColor: c.ink }} />
    </Pressable>
  );
}

/**
 * The up/down arrows — ⚠️ ON SCREEN ONLY WHEN A SCREEN READER IS RUNNING.
 *
 * WCAG 2.5.7 is satisfied by the `accessibilityActions` every card carries,
 * which VoiceOver and TalkBack surface through the rotor and reading controls
 * without anything being drawn. Drawing them for everybody would put two extra
 * controls on every card for something neither platform shows — but a member
 * who is exploring by touch benefits from them being real, hittable targets as
 * well as rotor entries.
 */
export function Arrows({
  up, down, onUp, onDown, labelUp, labelDown,
}: {
  up: boolean; down: boolean;
  onUp: () => void; onDown: () => void;
  labelUp: string; labelDown: string;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const btn = (on: boolean, press: () => void, label: string, mark: string) => (
    <Pressable
      onPress={on ? press : undefined}
      disabled={!on}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !on }}
      hitSlop={8}
      style={{
        width: 32, height: 32,
        borderRadius: amazen.radius.full,
        backgroundColor: c.barFill,
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderColor: c.lineWell,
        alignItems: 'center',
        justifyContent: 'center',
        /* ⚠️ Dimmed, never removed — a control that disappears makes the row
           jump under the finger that was about to press the other one. */
        opacity: on ? 1 : 0.35,
      }}
    >
      <AText variant="body" tone="ink" style={{ lineHeight: 20 }}>{mark}</AText>
    </Pressable>
  );
  return (
    <View style={{ position: 'absolute', top: -9, right: -4, flexDirection: 'row', gap: 6 }}>
      {btn(up, onUp, labelUp, '↑')}
      {btn(down, onDown, labelDown, '↓')}
    </View>
  );
}
