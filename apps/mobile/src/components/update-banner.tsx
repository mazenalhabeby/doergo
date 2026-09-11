import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../lib/constants';
import type { VersionStatus } from '../lib/version-gate';
import { openUpdate, onDownloaded, IN_APP_UPDATES_SUPPORTED } from '../lib/in-app-updates';

const DISMISS_KEY = 'update_banner_snoozed';

/**
 * ⚠️ "Not now" is not "never".
 *
 * Dismissal used to be stored as the version and checked for equality, so ONE
 * tap of the X — including an accidental one — silenced that release for good.
 * The whole point of this banner is that everybody hears about an update, and a
 * permanent hide from a single tap defeats it.
 *
 * A snooze expires. The same release speaks up again the next day, and the
 * entry in Profile (which cannot be dismissed at all) is there the whole time.
 */
const SNOOZE_MS = 24 * 60 * 60 * 1000;

/**
 * A newer version exists — said once, without taking the app away.
 *
 * This is the answer to "everyone should know about the update" that does not
 * strand anybody. Raising the minimum version blocks every older build the
 * moment it is set, and if the store has not published yet those people are
 * locked out of an app that works perfectly. That happened. This reaches the
 * same people with the same message and costs nothing when the store is behind.
 *
 * Closing it is a SNOOZE, not a mute — see SNOOZE_MS. And it is not the only
 * channel: Profile carries an entry that cannot be dismissed at all, so a tap
 * here never costs somebody the news.
 */
export function UpdateBanner({ status }: { status: VersionStatus }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  /*
    ⚠️ EVERY HOOK IN THIS COMPONENT BELONGS ABOVE THE EARLY RETURN.

    `ready` and its listener used to sit BELOW it, next to the markup that uses
    them, which reads naturally and crashes the app: React counts hooks per
    render, and this component returns null on most of them. The first render
    that got past the guard called two more hooks than the one before it —
    "Rendered more hooks than during the previous render", a red screen, and no
    way back except force-quitting.

    It never fired while the banner was effectively unreachable. Fixing the
    banner so it ACTUALLY APPEARS is what detonated it, on a real member's phone
    within hours. A latent crash behind a feature that does not run is still a
    crash; fixing the feature is what ships it.
  */
  const [ready, setReady] = useState(false);
  useEffect(() => onDownloaded(() => setReady(true)), []);

  const version = status.latest ?? '';

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(DISMISS_KEY)
      .then((raw) => {
        if (cancelled) return;
        // `{version}|{when}`. A snooze belongs to one release AND expires.
        const [snoozedVersion, at] = (raw ?? '').split('|');
        const fresh = Number(at) > 0 && Date.now() - Number(at) < SNOOZE_MS;
        setDismissed(snoozedVersion === version && fresh);
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
    AsyncStorage.setItem(DISMISS_KEY, `${version}|${Date.now()}`).catch(() => {});
  };

  const open = () => openUpdate(status.downloadUrl);

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
            {ready
              ? t('updateBanner.readyTitle')
              : t('updateBanner.title', { version, defaultValue: 'Version {{version}} is available' })}
          </Text>
          {/*
            A download that finished and was never installed is the usual way
            this feature quietly does nothing. `ready` was being tracked and
            never shown — so on Android the update downloaded in the background
            and the banner went on saying "update from Google Play", with
            nothing to tell anybody the only step left was a restart.
          */}
          <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
            {ready
              ? t('updateBanner.readySubtitle')
              : IN_APP_UPDATES_SUPPORTED
                ? t('updateBanner.subtitleInApp')
                : t('updateBanner.subtitle', { store: storeName, defaultValue: 'Update from {{store}}' })}
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
