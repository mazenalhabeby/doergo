import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, type ThemeMode } from '../../../src/contexts/theme-context';
import { SheetHeader, ScreenContainer } from '../../../src/components';
import {
  COLORS,
  SPACING,
  RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
  SHADOWS,
} from '../../../src/lib/constants';

const THEME_OPTIONS: { mode: ThemeMode; icon: string; color: string }[] = [
  { mode: 'system', icon: 'phone-portrait-outline', color: '#6366f1' },
  { mode: 'light', icon: 'sunny-outline', color: '#f59e0b' },
  { mode: 'dark', icon: 'moon-outline', color: '#6366f1' },
];

export default function AppearanceScreen() {
  const { colors, isDark, mode, setMode } = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  return (
    <ScreenContainer width="content">
    <ScrollView
      style={[styles.container, { backgroundColor: colors.surface, paddingTop: insets.top }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <SheetHeader />

      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.iconBox, { backgroundColor: isDark ? 'rgba(245,158,11,0.15)' : '#fffbeb' }]}>
          <Ionicons name="color-palette-outline" size={40} color="#f59e0b" />
        </View>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {t('profile.theme.title')}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {t('profile.theme.chooseTheme')}
        </Text>
      </View>

      {/* Theme Options */}
      <View style={styles.optionsContainer}>
        {THEME_OPTIONS.map((option, index) => {
          const isActive = mode === option.mode;

          return (
            <TouchableOpacity
              key={option.mode}
              style={[
                styles.option,
                { backgroundColor: colors.card },
                isActive && { borderColor: option.color, backgroundColor: isDark ? 'rgba(99,102,241,0.12)' : 'rgba(99,102,241,0.06)' },
                index > 0 && { marginTop: SPACING.md },
              ]}
              activeOpacity={0.7}
              onPress={() => setMode(option.mode)}
            >
              <View style={styles.optionLeft}>
                <View style={[styles.optionIcon, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#f8fafc' }]}>
                  <Ionicons name={option.icon as any} size={24} color={isActive ? option.color : colors.textSecondary} />
                </View>
                <Text style={[
                  styles.optionLabel,
                  { color: isActive ? option.color : colors.textPrimary },
                ]}>
                  {t(`profile.theme.${option.mode}`)}
                </Text>
              </View>

              <View style={[
                styles.radio,
                isActive
                  ? [styles.radioActive, { backgroundColor: option.color, borderColor: option.color }]
                  : { borderColor: isDark ? '#4b5563' : '#d1d5db' },
              ]}>
                {isActive && (
                  <Ionicons name="checkmark" size={16} color="#fff" />
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Info Note */}
      <View style={[styles.infoCard, { backgroundColor: isDark ? 'rgba(245,158,11,0.08)' : '#fffbeb' }]}>
        <Ionicons name="information-circle-outline" size={18} color="#f59e0b" />
        <Text style={[styles.infoText, { color: isDark ? '#fcd34d' : '#b45309' }]}>
          {t('profile.theme.appliedImmediately')}
        </Text>
      </View>
    </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: SPACING.xxxl + SPACING.lg,
  },
  header: {
    alignItems: 'center',
    paddingTop: SPACING.xxxl,
    paddingBottom: SPACING.xl,
  },
  iconBox: {
    width: 80,
    height: 80,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZE.xxxl + 2,
    fontWeight: FONT_WEIGHT.bold,
  },
  subtitle: {
    fontSize: FONT_SIZE.base,
    marginTop: SPACING.xs,
  },
  optionsContainer: {
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.lg,
    borderWidth: 2,
    borderColor: 'transparent',
    ...SHADOWS.sm,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.lg,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionLabel: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.semibold,
  },
  radio: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioActive: {},
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.xxl,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.md,
  },
  infoText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
    flex: 1,
  },
});
