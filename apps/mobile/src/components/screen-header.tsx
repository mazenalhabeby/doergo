import React, { type ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/theme-context';
import { SPACING, FONT_SIZE, FONT_WEIGHT } from '../lib/constants';

/**
 * The bar at the top of a pushed screen: back, title, and optionally one action.
 *
 * ⚠️ Fourteen screens each wrote their own, and they drifted exactly as far as
 * you would expect: the chevron was 22px, 24px or 26px depending on the screen;
 * the touch target 36 or 40; the title `FONT_SIZE.md` or `lg`; the bottom rule
 * 1px or hairline; the horizontal inset `SPACING.sm` or `md`. Nothing looked
 * broken on any one screen, and every transition between two of them did.
 *
 * The numbers below are the majority of what was already there — a 40px target
 * (the smallest every platform asks for is 44, and this sits in a padded bar),
 * a 24px chevron, an `lg` semibold title, a hairline rule — so most screens
 * kept their exact appearance and only the outliers moved.
 *
 * ⚠️ It does NOT own the safe area. Screens paint their own background and
 * clear the notch at their root (`paddingTop: insets.top`, or SafeAreaView),
 * and a header that also inset itself would double the gap on every one of
 * them.
 */

/** One back affordance, for the native-header stacks that cannot use the bar. */
export function HeaderBackButton({ color, fallback }: { color: string; fallback?: Href }) {
  const { t } = useTranslation();
  return (
    <TouchableOpacity
      onPress={() => goBack(fallback)}
      accessibilityRole="button"
      accessibilityLabel={t('common.back', 'Back')}
      hitSlop={12}
      style={s.btn}
    >
      <Ionicons name="chevron-back" size={ICON} color={color} />
    </TouchableOpacity>
  );
}

/**
 * ⚠️ `canGoBack()` matters: several of these screens are also opened by a push
 * notification or a deep link, which can mount them with no history behind —
 * `router.back()` alone silently does nothing there.
 */
export function goBack(fallback: Href = '/(app)/(tabs)' as Href) {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

const ICON = 24;
const TARGET = 40;

export interface ScreenHeaderProps {
  title?: string;
  /** Defaults to leaving the screen. Pass one to go back a step WITHIN it. */
  onBack?: () => void;
  /** Where to land when there is no history — a deep link or a notification. */
  fallback?: Href;
  /**
   * One action on the right. Left out, the slot still reserves its width, so
   * the title stays optically centred rather than shifting per screen.
   */
  right?: ReactNode;
  /** Hide the rule when the content below supplies its own separation. */
  divider?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function ScreenHeader({
  title,
  onBack,
  fallback,
  right,
  divider = true,
  style,
}: ScreenHeaderProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <View
      style={[
        s.bar,
        divider && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
        style,
      ]}
    >
      <TouchableOpacity
        onPress={onBack ?? (() => goBack(fallback))}
        accessibilityRole="button"
        accessibilityLabel={t('common.back', 'Back')}
        hitSlop={12}
        style={s.btn}
      >
        <Ionicons name="chevron-back" size={ICON} color={colors.textPrimary} />
      </TouchableOpacity>

      <Text style={[s.title, { color: colors.textPrimary }]} numberOfLines={1}>
        {title ?? ''}
      </Text>

      {/* Always the same width as the back button, action or not. */}
      <View style={s.btn}>{right}</View>
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  btn: { width: TARGET, height: TARGET, alignItems: 'center', justifyContent: 'center' },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.semibold,
  },
});
