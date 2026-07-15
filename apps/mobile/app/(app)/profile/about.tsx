import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../src/contexts/theme-context';
import { SheetHeader, ScreenContainer } from '../../../src/components';
import {
  COLORS,
  SPACING,
  RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
} from '../../../src/lib/constants';

export default function AboutScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const appVersion = Constants.expoConfig?.version || '1.0.0';
  const extra = Constants.expoConfig?.extra ?? {};
  const gitCommit = (extra.gitCommit as string) || 'unknown';
  const buildProfile = (extra.buildProfile as string) || 'local';
  const builtAt = extra.builtAt as string | undefined;
  const builtAtLabel = builtAt
    ? new Date(builtAt).toLocaleString()
    : '—';

  return (
    <ScreenContainer width="content">
    <ScrollView
      style={[styles.container, { backgroundColor: colors.surface, paddingTop: insets.top }]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <SheetHeader />
      {/* App Branding */}
      <View style={styles.header}>
        <View style={[styles.logoContainer, { backgroundColor: colors.primaryLight }]}>
          <Ionicons name="construct" size={36} color={COLORS.primary} />
        </View>
        <Text style={[styles.appName, { color: colors.textPrimary }]}>{t('common.appName')}</Text>
        <Text style={[styles.tagline, { color: colors.textSecondary }]}>{t('profile.about.tagline')}</Text>
        <View style={[styles.versionBadge, { backgroundColor: colors.surfaceRaised }]}>
          <Text style={[styles.versionText, { color: colors.textMuted }]}>{t('common.version', { version: appVersion })}</Text>
        </View>
      </View>

      {/* About */}
      <View style={styles.section}>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.aboutText, { color: colors.textSecondary }]}>
            {t('profile.about.description')}
          </Text>
        </View>
      </View>

      {/* Build info */}
      <View style={styles.section}>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.buildRow}>
            <Text style={[styles.buildLabel, { color: colors.textMuted }]}>Commit</Text>
            <Text style={[styles.buildValue, { color: colors.textSecondary }]}>{gitCommit}</Text>
          </View>
          <View style={styles.buildRow}>
            <Text style={[styles.buildLabel, { color: colors.textMuted }]}>Profile</Text>
            <Text style={[styles.buildValue, { color: colors.textSecondary }]}>{buildProfile}</Text>
          </View>
          <View style={styles.buildRow}>
            <Text style={[styles.buildLabel, { color: colors.textMuted }]}>Built</Text>
            <Text style={[styles.buildValue, { color: colors.textSecondary }]}>{builtAtLabel}</Text>
          </View>
        </View>
      </View>

      {/* Footer */}
      <Text style={[styles.copyright, { color: colors.textMuted }]}>
        {t('common.copyrightYear', { year: new Date().getFullYear() })}
      </Text>
    </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: SPACING.xxxl + SPACING.lg,
  },
  header: {
    alignItems: 'center',
    paddingTop: SPACING.xxxl,
    paddingBottom: SPACING.xl,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  appName: {
    fontSize: FONT_SIZE.xxxl + 4,
    fontWeight: FONT_WEIGHT.bold,
  },
  tagline: {
    fontSize: FONT_SIZE.base,
    marginTop: SPACING.xs,
  },
  versionBadge: {
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
  },
  versionText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
  },
  section: {
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
  },
  card: {
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
  },
  aboutText: {
    fontSize: FONT_SIZE.base,
    lineHeight: 22,
  },
  buildRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
  },
  buildLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
  },
  buildValue: {
    fontSize: FONT_SIZE.sm,
    fontFamily: 'monospace',
  },
  copyright: {
    fontSize: FONT_SIZE.sm,
    textAlign: 'center',
    marginTop: SPACING.xxl,
  },
});
