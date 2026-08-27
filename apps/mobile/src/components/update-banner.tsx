import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../lib/constants';
import type { VersionStatus } from '../lib/version-gate';
import { IN_APP_UPDATES_SUPPORTED, startStoreUpdate, onDownloaded } from '../lib/in-app-updates';

const DISMISS_KEY = 'update_banner_dismissed_for';

/**
 * A newer version exists — said once, without taking the app away.
 *
 * This is the answer to "everyone should know about the update" that does not
 * strand anybody. Raising the minimum version blocks every older build the
 * moment it is set, and if the store has not published yet those people are
 * locked out of an app that works perfectly. That happened. This reaches the
 * same people with the same message and costs nothing when the store is behind.
 *
 * Dismissal is remembered PER VERSION: closing it means "not about 1.0.1
 * again", not "never tell me anything". The next release speaks up once more.
 */
export function UpdateBanner({ status }: { status: VersionStatus }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  const version = status.latest ?? '';

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(DISMISS_KEY)
      .then((v) => {
        if (!cancelled) setDismissed(v === version);
      })
      // Never let a storage failure hide the message — showing it twice is a
      // smaller cost than never showing it at all.
      .catch(() => {
        if (!cancelled) setDismissed(false);
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  if (!status.updateAvailable || status.blocked || dismissed !== false || !version) return null;

  const close = () => {
    setDismissed(true);
    AsyncStorage.setItem(DISMISS_KEY, version).catch(() => {});
  };

  /*
    Android updates in place; iOS opens the store, because Apple offers no
    equivalent. Falls back to the link whenever Play cannot start one — a
    device without Play Services, a managed install — so the button never
    appears to do nothing.
  */
  const open = async () => {
    if (IN_APP_UPDATES_SUPPORTED && (await startStoreUpdate(false))) return;
    if (status.downloadUrl) Linking.openURL(status.downloadUrl).catch(() => {});
  };

  // A flexible update that downloads and is never installed is the usual way
  // this feature quietly does nothing, so say when it is ready.
  const [ready, setReady] = useState(false);
  useEffect(() => onDownloaded(() => setReady(true)), []);

  const storeName =
    Platform.OS === 'ios'
      ? t('updateRequired.appStore', 'the App Store')
      : t('updateRequired.playStore', 'Google Play');

  return (
    <View style={[styles.wrap, { top: insets.top + SPACING.sm }]} pointerEvents="box-none">
      <View style={[styles.banner, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.dot} />
        <View style={styles.textCol}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
            {t('updateBanner.title', { version, defaultValue: 'Version {{version}} is available' })}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
            {t('updateBanner.subtitle', { store: storeName, defaultValue: 'Update from {{store}}' })}
          </Text>
        </View>
        {!!status.downloadUrl && (
          <Pressable onPress={open} hitSlop={8} style={({ pressed }) => pressed && styles.pressed}>
            <Text style={styles.action}>{t('updateBanner.action', 'Update')}</Text>
          </Pressable>
        )}
        <Pressable
          onPress={close}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('common.dismiss', 'Dismiss')}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Text style={[styles.close, { color: colors.textMuted }]}>✕</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, paddingHorizontal: SPACING.md, zIndex: 100 },
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    borderWidth: 1, borderRadius: RADIUS.lg,
    paddingVertical: SPACING.sm + 2, paddingHorizontal: SPACING.md,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary },
  textCol: { flex: 1, minWidth: 0 },
  title: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold },
  subtitle: { fontSize: FONT_SIZE.xs, marginTop: 1 },
  action: { color: COLORS.primary, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold },
  close: { fontSize: FONT_SIZE.md, paddingHorizontal: 2 },
  pressed: { opacity: 0.6 },
});
