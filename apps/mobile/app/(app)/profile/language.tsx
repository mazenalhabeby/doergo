import { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../src/contexts/theme-context';
import { SheetHeader, ScreenContainer } from '../../../src/components';
import { changeLanguage, getCurrentLanguage, supportedLanguages } from '../../../src/i18n';
import {
  COLORS,
  SPACING,
  RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
  SHADOWS,
} from '../../../src/lib/constants';

export default function LanguageScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const currentLang = getCurrentLanguage();

  const handleSelect = useCallback((code: string) => {
    if (code !== currentLang) {
      changeLanguage(code);
    }
  }, [currentLang]);

  return (
    <ScreenContainer width="content">
    <ScrollView
      style={[styles.container, { backgroundColor: colors.surface, paddingTop: insets.top }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <SheetHeader />

      {/* Header Illustration */}
      <View style={styles.header}>
        <View style={[styles.globe, { backgroundColor: isDark ? '#312e81' : '#e0e7ff' }]}>
          <Ionicons name="globe-outline" size={40} color="#6366f1" />
        </View>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {t('profile.menu.language')}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {t('profile.language.choosePreferred')}
        </Text>
      </View>

      {/* Language Options */}
      <View style={styles.optionsContainer}>
        {supportedLanguages.map((lang, index) => {
          const isActive = currentLang === lang.code;

          return (
            <TouchableOpacity
              key={lang.code}
              style={[
                styles.option,
                { backgroundColor: colors.card },
                isActive && styles.optionActive,
                isActive && { borderColor: '#6366f1', backgroundColor: isDark ? 'rgba(99,102,241,0.12)' : 'rgba(99,102,241,0.06)' },
                index > 0 && { marginTop: SPACING.md },
              ]}
              activeOpacity={0.7}
              onPress={() => handleSelect(lang.code)}
            >
              <View style={styles.optionLeft}>
                <Text style={styles.flag}>{lang.flag}</Text>
                <View>
                  <Text style={[
                    styles.langName,
                    { color: isActive ? '#6366f1' : colors.textPrimary },
                  ]}>
                    {lang.label}
                  </Text>
                  <Text style={[styles.langCode, { color: colors.textMuted }]}>
                    {lang.code.toUpperCase()}
                  </Text>
                </View>
              </View>

              <View style={[
                styles.radio,
                isActive
                  ? styles.radioActive
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
      <View style={[styles.infoCard, { backgroundColor: isDark ? 'rgba(99,102,241,0.08)' : '#f5f3ff' }]}>
        <Ionicons name="information-circle-outline" size={18} color="#6366f1" />
        <Text style={[styles.infoText, { color: isDark ? '#a5b4fc' : '#6366f1' }]}>
          {t('profile.language.appliedImmediately')}
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

  // Header
  header: {
    alignItems: 'center',
    paddingTop: SPACING.xxxl,
    paddingBottom: SPACING.xl,
  },
  globe: {
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

  // Options
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
  optionActive: {
    borderWidth: 2,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.lg,
  },
  flag: {
    fontSize: 32,
  },
  langName: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.semibold,
  },
  langCode: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
    marginTop: 2,
  },

  // Radio
  radio: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioActive: {
    backgroundColor: '#6366f1',
    borderColor: '#6366f1',
  },

  // Info
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
