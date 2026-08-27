import { View, Text, StyleSheet, Linking, Pressable, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/theme-context';
import { AnimatedLogo } from './animated-logo';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../lib/constants';
import type { VersionStatus } from '../lib/version-gate';
import { IN_APP_UPDATES_SUPPORTED, startStoreUpdate } from '../lib/in-app-updates';

/**
 * Shown INSTEAD of the app when this build is older than the server allows.
 *
 * The first version of this screen was a paragraph and a button, which is what
 * a dead end looks like when nobody has thought about the person reading it.
 * It now shows the app it belongs to, the two versions side by side so the
 * problem is legible in one glance, and — the part that was missing — what the
 * store is called on THIS device, because "Get the latest version" tells
 * someone nothing about where they are being sent.
 */
export function UpdateRequired({ status }: { status: VersionStatus }) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const storeName =
    Platform.OS === 'ios'
      ? t('updateRequired.appStore', 'the App Store')
      : t('updateRequired.playStore', 'Google Play');

  /*
    The blocking case, so Android asks Play for its IMMEDIATE flow: Play shows
    its own sheet, downloads, installs and restarts, and can only ever offer a
    version it genuinely has. That is what makes a hard block safe on Android
    and merely careful on iOS, where the store link is all Apple allows.
  */
  const open = async () => {
    if (IN_APP_UPDATES_SUPPORTED && (await startStoreUpdate(true))) return;
    if (status.downloadUrl) Linking.openURL(status.downloadUrl).catch(() => {});
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.inner}>
        <AnimatedLogo size="large" />

        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {t('updateRequired.title', 'Time to update')}
        </Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          {t('updateRequired.body', {
            store: storeName,
            defaultValue:
              'This version is no longer supported. Update from {{store}} to carry on — it only takes a moment.',
          })}
        </Text>

        {/* Both versions, side by side. One number on its own means nothing;
            the pair is what makes "yours is behind" obvious without reading. */}
        <View style={[styles.versions, { borderColor: colors.border }]}>
          <View style={styles.versionCol}>
            <Text style={[styles.versionLabel, { color: colors.textMuted }]}>
              {t('updateRequired.yours', 'You have')}
            </Text>
            <Text style={[styles.versionValue, { color: colors.textSecondary }]}>{status.current}</Text>
          </View>
          <Text style={[styles.arrow, { color: colors.textMuted }]}>→</Text>
          <View style={styles.versionCol}>
            <Text style={[styles.versionLabel, { color: colors.textMuted }]}>
              {t('updateRequired.needed', 'Required')}
            </Text>
            <Text style={[styles.versionValue, styles.versionValueStrong]}>
              {status.minimum ?? status.latest ?? '—'}
            </Text>
          </View>
        </View>

        {/* Only rendered when the server supplies a link. A button that goes
            nowhere is worse than no button on a screen with no way out. */}
        {!!status.downloadUrl && (
          <Pressable
            onPress={open}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>
              {t('updateRequired.actionStore', { store: storeName, defaultValue: 'Open {{store}}' })}
            </Text>
          </Pressable>
        )}

        {/* Says what to do when the store has not caught up yet — the case that
            turns this screen from an inconvenience into being stranded. */}
        <Text style={[styles.footnote, { color: colors.textMuted }]}>
          {t(
            'updateRequired.footnote',
            'If no update is offered yet, it is on its way — please check again shortly.',
          )}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.lg },
  inner: { width: '100%', maxWidth: 380, alignItems: 'center' },
  title: {
    fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.bold,
    marginTop: SPACING.lg, marginBottom: SPACING.sm, textAlign: 'center',
  },
  body: { fontSize: FONT_SIZE.md, lineHeight: 22, textAlign: 'center', marginBottom: SPACING.lg },
  versions: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    width: '100%', borderWidth: 1, borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md, marginBottom: SPACING.lg, gap: SPACING.lg,
  },
  versionCol: { alignItems: 'center', minWidth: 84 },
  versionLabel: { fontSize: FONT_SIZE.xs, marginBottom: 2 },
  versionValue: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.semibold },
  versionValueStrong: { color: COLORS.primary },
  arrow: { fontSize: FONT_SIZE.lg },
  button: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md, paddingHorizontal: SPACING.xl,
    width: '100%', alignItems: 'center',
  },
  buttonPressed: { opacity: 0.85 },
  buttonText: { color: COLORS.white, fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold },
  footnote: { fontSize: FONT_SIZE.xs, textAlign: 'center', marginTop: SPACING.md, lineHeight: 17 },
});
