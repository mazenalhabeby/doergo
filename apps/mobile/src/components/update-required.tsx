import { View, Text, StyleSheet, Linking, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../lib/constants';
import type { VersionStatus } from '../lib/version-gate';

/**
 * Shown INSTEAD of the app when this build is older than the server allows.
 *
 * There is no dismiss and no "later". The screen exists because a sideloaded
 * Android build never updates itself, so "later" is how a phone stays on a
 * two-year-old release — the exact situation this is meant to end. It always
 * says which version it is and which is needed, because a user who cannot act
 * on the message has to be able to read it to someone who can.
 */
export function UpdateRequired({ status }: { status: VersionStatus }) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const open = () => {
    if (status.downloadUrl) Linking.openURL(status.downloadUrl).catch(() => {});
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.inner}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {t('updateRequired.title', 'Update required')}
        </Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          {t(
            'updateRequired.body',
            'This version of the app is no longer supported. Please install the latest version to continue.',
          )}
        </Text>

        <View style={[styles.versions, { borderColor: colors.border }]}>
          <Text style={[styles.versionLine, { color: colors.textSecondary }]}>
            {t('updateRequired.yours', 'You have')} <Text style={{ color: colors.textPrimary }}>{status.current}</Text>
          </Text>
          {!!status.minimum && (
            <Text style={[styles.versionLine, { color: colors.textSecondary }]}>
              {t('updateRequired.needed', 'Required')} <Text style={{ color: colors.textPrimary }}>{status.minimum}</Text>
            </Text>
          )}
        </View>

        {/* Only offered when the server actually supplies a link — a button
            that goes nowhere is worse than no button on a screen with no exit. */}
        {!!status.downloadUrl && (
          <Pressable
            onPress={open}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>{t('updateRequired.action', 'Get the latest version')}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.lg },
  inner: { width: '100%', maxWidth: 380, alignItems: 'center' },
  title: { fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.bold, marginBottom: SPACING.sm, textAlign: 'center' },
  body: { fontSize: FONT_SIZE.md, lineHeight: 22, textAlign: 'center', marginBottom: SPACING.lg },
  versions: {
    width: '100%', borderWidth: 1, borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg, marginBottom: SPACING.lg, gap: 4,
  },
  versionLine: { fontSize: FONT_SIZE.sm, textAlign: 'center' },
  button: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md, paddingHorizontal: SPACING.xl, width: '100%', alignItems: 'center',
  },
  buttonPressed: { opacity: 0.85 },
  buttonText: { color: COLORS.white, fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold },
});
