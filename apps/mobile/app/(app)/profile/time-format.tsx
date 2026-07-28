import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../src/contexts/theme-context';
import { useAuth } from '../../../src/contexts/auth-context';
import { useToast } from '../../../src/contexts/toast-context';
import { userApi } from '../../../src/lib/api';
import { SheetHeader, ScreenContainer } from '../../../src/components';
import {
  SPACING,
  RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
  SHADOWS,
} from '../../../src/lib/constants';

const ACCENT = '#6366f1';

const OPTIONS: { value: '24h' | '12h'; sample: string }[] = [
  { value: '24h', sample: '14:30' },
  { value: '12h', sample: '2:30 PM' },
];

export default function TimeFormatScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { user, refreshUser } = useAuth();
  const toast = useToast();

  const current: '24h' | '12h' = user?.timeFormat === '12h' ? '12h' : '24h';
  const [saving, setSaving] = useState(false);

  const handleSelect = async (value: '24h' | '12h') => {
    if (value === current || saving) return;
    setSaving(true);
    try {
      await userApi.setTimeFormat(value);
      await refreshUser();
      toast.success(t('profile.timeFormat.updated'));
    } catch {
      toast.error(t('profile.timeFormat.failed'));
    } finally {
      setSaving(false);
    }
  };

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
          <View style={[styles.iconBox, { backgroundColor: isDark ? 'rgba(99,102,241,0.15)' : '#eef2ff' }]}>
            <Ionicons name="time-outline" size={40} color={ACCENT} />
          </View>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            {t('profile.timeFormat.title')}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {t('profile.timeFormat.subtitle')}
          </Text>
        </View>

        {/* Options */}
        <View style={styles.optionsContainer}>
          {OPTIONS.map((option, index) => {
            const isActive = current === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.option,
                  { backgroundColor: colors.card },
                  isActive && { borderColor: ACCENT, backgroundColor: isDark ? 'rgba(99,102,241,0.12)' : 'rgba(99,102,241,0.06)' },
                  index > 0 && { marginTop: SPACING.md },
                ]}
                activeOpacity={0.7}
                disabled={saving}
                onPress={() => handleSelect(option.value)}
              >
                <View style={styles.optionLeft}>
                  <View style={[styles.optionIcon, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#f8fafc' }]}>
                    <Ionicons name="time-outline" size={24} color={isActive ? ACCENT : colors.textSecondary} />
                  </View>
                  <View>
                    <Text style={[styles.optionLabel, { color: isActive ? ACCENT : colors.textPrimary }]}>
                      {t(`profile.timeFormat.${option.value}`)}
                    </Text>
                    <Text style={[styles.optionSample, { color: colors.textMuted }]}>{option.sample}</Text>
                  </View>
                </View>

                <View style={[
                  styles.radio,
                  isActive
                    ? [styles.radioActive, { backgroundColor: ACCENT, borderColor: ACCENT }]
                    : { borderColor: isDark ? '#4b5563' : '#d1d5db' },
                ]}>
                  {isActive && <Ionicons name="checkmark" size={16} color="#fff" />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Info Note */}
        <View style={[styles.infoCard, { backgroundColor: isDark ? 'rgba(99,102,241,0.08)' : '#eef2ff' }]}>
          <Ionicons name="information-circle-outline" size={18} color={ACCENT} />
          <Text style={[styles.infoText, { color: isDark ? '#c7d2fe' : '#4338ca' }]}>
            {t('profile.timeFormat.note')}
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
    textAlign: 'center',
    paddingHorizontal: SPACING.xl,
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
  optionSample: {
    fontSize: FONT_SIZE.sm,
    marginTop: 2,
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
