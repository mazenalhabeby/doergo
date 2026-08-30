import type { ReactNode } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, useWindowDimensions,
  type StyleProp, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/theme-context';
import { SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../lib/constants';

/**
 * The surface inside a `BlurSheet`.
 *
 * `BlurSheet` owns the modal, the backdrop and the animation and deliberately
 * nothing else — its docstring says callers bring their own surface. Every
 * caller then wrote the same twenty lines: card background, rounded top, grab
 * handle, a header with a title and a close cross, and bottom padding for the
 * home indicator.
 *
 * Writing it a fourth time is how one of them ends up without a background at
 * all, which is exactly what happened: a sheet whose content floated over the
 * blurred page it had covered, with the screen behind showing through the text.
 * The repetition was not a style problem, it was the bug.
 */
export function SheetPanel({
  title,
  onClose,
  closeDisabled = false,
  maxHeightFraction = 0.85,
  style,
  children,
}: {
  title: string;
  onClose: () => void;
  /** While work is in flight — the cross greys out rather than disappearing. */
  closeDisabled?: boolean;
  /**
   * A share of the screen, NOT a percentage string.
   *
   * `maxHeight: '85%'` resolves against the parent's height, and the parent
   * here is an auto-height flex child inside BlurSheet — so the cap silently
   * did nothing and a tall sheet ran off the bottom of the screen with its
   * action button clipped. Resolved against the window instead.
   */
  maxHeightFraction?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  return (
    <View
      style={[
        s.sheet,
        {
          backgroundColor: colors.card,
          // The home indicator sits over anything drawn to the bottom edge.
          paddingBottom: insets.bottom + SPACING.md,
          maxHeight: Math.round(height * maxHeightFraction),
        },
        style,
      ]}
    >
      <View style={[s.handle, { backgroundColor: isDark ? '#4b5563' : '#d1d5db' }]} />

      <View style={s.header}>
        <Text style={[s.title, { color: colors.textPrimary }]} numberOfLines={2}>
          {title}
        </Text>
        <TouchableOpacity
          onPress={closeDisabled ? undefined : onClose}
          disabled={closeDisabled}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        >
          <Ionicons
            name="close"
            size={24}
            color={closeDisabled ? colors.textMuted : colors.textSecondary}
          />
        </TouchableOpacity>
      </View>

      {children}
    </View>
  );
}

const s = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
  },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: SPACING.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: SPACING.sm },
  title: { flex: 1, fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold },
});
