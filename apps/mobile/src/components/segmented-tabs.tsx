import { memo, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { PressableScale } from './pressable-scale';
import { useTheme } from '../contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOWS, type ThemeColors } from '../lib/constants';

/**
 * A row of two to four tabs that divide ONE screen's content.
 *
 * ⚠️ This is deliberately not `ChipRow` + `FilterChip`, which the app already
 * has and which stay the answer for FILTERS — narrowing a list that is still
 * the same list. Three differences make a tab bar a different control:
 *
 *   IT MUST NOT SCROLL. A filter row may run off the edge because the chips
 *   beyond it are optional. A tab is a THIRD of the screen's content; one
 *   hidden past the fade is a third of the record nobody finds. Equal widths,
 *   always all visible, is the whole contract — so the segments are `flex: 1`
 *   and `ChipRow`'s measured fades would have nothing to do.
 *
 *   IT CARRIES A COUNT. "Reminders" has to be able to say 3, and to say it in
 *   red when one of them is late — that is the entire reason reminders earn a
 *   tab rather than living as a filter inside Activity. `FilterChip` is a
 *   label and a boolean, and widening it would make every filter row in the app
 *   carry a badge it never uses.
 *
 *   IT IS A TABLIST. `accessibilityRole="tab"` inside `"tablist"` is what tells
 *   a screen reader "1 of 3" and lets it move between them. A filter chip is a
 *   button and should stay one.
 *
 * Generic in the key so a caller's own union survives — `onChange` hands back
 * `'information' | 'activity' | 'reminders'`, not `string`, and a typo in a
 * `setTab` call is a compile error rather than a tab that silently never opens.
 */
export interface SegmentedTab<K extends string = string> {
  key: K;
  label: string;
  /** Shown beside the label. Undefined or 0 draws nothing — zero is not news. */
  count?: number;
  /** Draws that count in the alarm tone: something behind this tab is late. */
  alert?: boolean;
  /** Read instead of the label by a screen reader, which cannot see the badge. */
  a11yLabel?: string;
}

export function SegmentedTabs<K extends string>({
  tabs,
  active,
  onChange,
  style,
}: {
  tabs: readonly SegmentedTab<K>[];
  active: K;
  onChange: (key: K) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => styles(colors), [colors]);

  /*
    The segment is not generic — a memoised generic component needs a cast to
    keep its type through `memo`, and a cast in a shared component is how the
    next caller's union quietly becomes `string`. The narrowing happens here
    instead, on a key that provably came out of `tabs`.
  */
  const press = useCallback((key: string) => onChange(key as K), [onChange]);

  return (
    <View style={[s.track, style]} accessibilityRole="tablist">
      {tabs.map((tab) => (
        <Segment key={tab.key} tab={tab} selected={tab.key === active} onPress={press} />
      ))}
    </View>
  );
}

/**
 * One segment.
 *
 * Memoised and handed the callback itself rather than a closure over its own
 * key: `onPress={() => onChange(k)}` written in the map above is a new function
 * on every render of the bar, which would make the memo decorative. Three
 * segments are cheap either way — but a control written the careless way is the
 * one that gets copied into a list where it is not cheap at all.
 */
const Segment = memo(function Segment({
  tab,
  selected,
  onPress,
}: {
  tab: SegmentedTab;
  selected: boolean;
  onPress: (key: string) => void;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => styles(colors), [colors]);

  return (
    <PressableScale
      onPress={() => onPress(tab.key)}
      activeScale={0.97}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={tab.a11yLabel ?? tab.label}
      style={[s.tab, selected && s.tabOn]}
    >
      <Text
        numberOfLines={1}
        style={[
          s.label,
          { color: selected ? colors.textPrimary : colors.textMuted },
          selected && s.labelOn,
        ]}
      >
        {tab.label}
      </Text>
      {!!tab.count && (
        <View
          style={[
            s.badge,
            { backgroundColor: tab.alert ? COLORS.error : colors.primaryLight },
          ]}
        >
          {/* Three digits would push the label out of a segment that is a third
              of a phone; past ninety-nine the exact number is not the point. */}
          <Text style={[s.badgeText, { color: tab.alert ? COLORS.white : COLORS.primary }]}>
            {tab.count > 99 ? '99+' : tab.count}
          </Text>
        </View>
      )}
    </PressableScale>
  );
});

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    track: {
      flexDirection: 'row',
      backgroundColor: c.surfaceRaised,
      borderRadius: RADIUS.md,
      padding: 3,
      gap: 3,
    },
    tab: {
      // `flex: 1` and nothing else decides the width: three tabs are three
      // equal thirds in every language, so a long German label wraps to an
      // ellipsis instead of stealing room from the tab beside it.
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.xs,
      paddingVertical: SPACING.sm + 1,
      paddingHorizontal: SPACING.xs,
      borderRadius: RADIUS.sm + 1,
    },
    tabOn: {
      backgroundColor: c.card,
      ...SHADOWS.sm,
    },
    label: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium },
    labelOn: { fontWeight: FONT_WEIGHT.semibold },
    badge: {
      minWidth: 18,
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeText: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold },
  });
