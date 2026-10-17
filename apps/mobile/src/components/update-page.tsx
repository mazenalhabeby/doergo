import { useEffect, useState } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, Platform, Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../lib/constants';
import type { VersionStatus } from '../lib/version-gate';
import { openUpdate } from '../lib/in-app-updates';
import type { ReleaseIcon } from '@hbcfield/shared/client';

const SNOOZE_KEY = 'update_page_snoozed';
/** The banner's own snooze: "Later" here quiets both for the day, or the banner pops up the moment the page closes. */
const BANNER_SNOOZE_KEY = 'update_banner_snoozed';
/** "Later" means tomorrow, never "never" — see update-banner.tsx for why a mute is a bug. */
const SNOOZE_MS = 24 * 60 * 60 * 1000;
/** Let the app settle first: the page never lands on a member mid-tap at launch. */
const SETTLE_MS = 2500;

/** The server names an icon from a closed list; this maps it to the app's set. */
const RELEASE_ICON: Record<ReleaseIcon, keyof typeof Ionicons.glyphMap> = {
  calendar: 'calendar-outline', crew: 'people-outline', role: 'hand-left-outline', scan: 'scan-outline',
  clock: 'time-outline', offline: 'cloud-offline-outline', star: 'sparkles-outline',
};

/*
  Tapping the "new version" notification opens this page even after "Later" — the person asked
  to see it. A tiny listener set rather than a context: one page, one call site.
*/
const forceListeners = new Set<() => void>();
export function showUpdatePageNow(): void {
  AsyncStorage.multiRemove([SNOOZE_KEY, BANNER_SNOOZE_KEY]).catch(() => {});
  forceListeners.forEach((fn) => fn());
}

/**
 * A new version exists — said on a page of its own, once a day, and the app
 * keeps working underneath.
 *
 * ⚠️ NOT A GATE. The old version goes on working for as long as the member
 * keeps it; "Later" closes the page until tomorrow. Blocking is `UpdateRequired`,
 * driven by a minimum version, and is a separate decision made much later.
 *
 * ⚠️ NO REQUEST OF ITS OWN. It reads the answer the version provider already
 * fetched (throttled, on foreground), so it costs nothing when there is no
 * update — which is every day but one.
 *
 * ⚠️ EVERY HOOK ABOVE THE EARLY RETURN — see update-banner.tsx for the crash
 * that rule was written in.
 */
export function UpdatePage({ status, onVisibleChange }: { status: VersionStatus; onVisibleChange?: (visible: boolean) => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [snoozed, setSnoozed] = useState<boolean | null>(null);
  const [settled, setSettled] = useState(false);
  const version = status.latest ?? '';

  useEffect(() => {
    const timer = setTimeout(() => setSettled(true), SETTLE_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const open = () => { setSnoozed(false); setSettled(true); };
    forceListeners.add(open);
    return () => { forceListeners.delete(open); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(SNOOZE_KEY)
      .then((raw) => {
        if (cancelled) return;
        const [snoozedVersion, at] = (raw ?? '').split('|');
        setSnoozed(snoozedVersion === version && Number(at) > 0 && Date.now() - Number(at) < SNOOZE_MS);
      })
      // A storage failure shows the page rather than hiding the news.
      .catch(() => {
        if (!cancelled) setSnoozed(false);
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  const visible = settled && snoozed === false && status.updateAvailable && !status.blocked && !!version;
  useEffect(() => {
    onVisibleChange?.(visible);
  }, [visible, onVisibleChange]);

  if (!visible) return null;

  const later = () => {
    setSnoozed(true);
    const stamp = `${version}|${Date.now()}`;
    AsyncStorage.multiSet([[SNOOZE_KEY, stamp], [BANNER_SNOOZE_KEY, stamp]]).catch(() => {});
  };
  const update = () => {
    later();
    void openUpdate(status.downloadUrl);
  };
  const store = Platform.OS === 'ios' ? t('updateRequired.appStore', 'the App Store') : t('updateRequired.playStore', 'Google Play');

  // What is new, from the server in this phone's language; the built-in lines only when it sent none.
  const note = status.whatsNew ?? null;
  const points: { icon: keyof typeof Ionicons.glyphMap; title?: string; text: string }[] = note
    ? note.points.map((p) => ({ icon: RELEASE_ICON[p.icon] ?? 'sparkles-outline', title: p.title, text: p.body }))
    : [
        { icon: 'cloud-offline-outline', text: t('updatePage.pointOffline') },
        { icon: 'log-in-outline', text: t('updatePage.pointClock') },
        { icon: 'time-outline', text: t('updatePage.pointShifts') },
      ];

  return (
    <Modal visible transparent={false} animationType="slide" statusBarTranslucent onRequestClose={later}>
      <View
        style={[
          styles.page,
          {
            backgroundColor: colors.background,
            paddingTop: insets.top + SPACING.xl,
            paddingBottom: insets.bottom + SPACING.lg,
          },
        ]}>
        <View style={styles.body}>
          <Image source={require('../../assets/icon.png')} style={styles.icon} />
          <Text style={[styles.version, { color: COLORS.primary }]}>{t('updatePage.version', { version })}</Text>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{note?.title ?? t('updatePage.title')}</Text>
          <Text style={[styles.lead, { color: colors.textSecondary }]}>
            {note ? note.lead.replace('{{store}}', store) : t('updatePage.lead', { store })}
          </Text>
          <View style={styles.points}>
            {points.map((p, i) => (
              <View key={`${p.icon}-${i}`} style={[styles.point, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name={p.icon} size={20} color={COLORS.primary} />
                <View style={{ flex: 1 }}>
                  {p.title ? <Text style={[styles.pointTitle, { color: colors.textPrimary }]}>{p.title}</Text> : null}
                  <Text
                    style={[
                      p.title ? styles.pointBody : styles.pointText,
                      { color: p.title ? colors.textSecondary : colors.textPrimary },
                    ]}
                  >
                    {p.text}
                  </Text>
                </View>
              </View>
            ))}
            {note?.footer ? <Text style={[styles.note, { color: colors.textMuted }]}>{note.footer}</Text> : null}
          </View>
        </View>
        <View style={styles.actions}>
          <Pressable onPress={update} style={({ pressed }) => [styles.primary, pressed && styles.pressed]} accessibilityRole="button">
            <Text style={styles.primaryText}>{t('updatePage.update')}</Text>
          </Pressable>
          <Pressable onPress={later} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]} accessibilityRole="button">
            <Text style={[styles.secondaryText, { color: colors.textSecondary }]}>{t('updatePage.later')}</Text>
          </Pressable>
          <Text style={[styles.note, { color: colors.textMuted }]}>{t('updatePage.note')}</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: SPACING.xl, justifyContent: 'space-between' },
  body: { alignItems: 'center', gap: SPACING.sm },
  icon: { width: 72, height: 72, borderRadius: 18, marginBottom: SPACING.md },
  version: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold },
  title: { fontSize: 26, fontWeight: FONT_WEIGHT.bold, textAlign: 'center' },
  lead: { fontSize: FONT_SIZE.md, textAlign: 'center', lineHeight: 22, marginBottom: SPACING.md },
  points: { alignSelf: 'stretch', gap: SPACING.sm },
  point: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, borderWidth: 1, borderRadius: RADIUS.lg, padding: SPACING.md },
  pointText: { flex: 1, fontSize: FONT_SIZE.md, lineHeight: 20 },
  pointTitle: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold, lineHeight: 20 },
  pointBody: { fontSize: FONT_SIZE.sm, lineHeight: 18 },
  actions: { gap: SPACING.sm },
  primary: { backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, paddingVertical: SPACING.md + 2, alignItems: 'center' },
  primaryText: { color: COLORS.white, fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.semibold },
  secondary: { paddingVertical: SPACING.md, alignItems: 'center' },
  secondaryText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.medium },
  note: { fontSize: FONT_SIZE.xs, textAlign: 'center', lineHeight: 16 },
  pressed: { opacity: 0.7 },
});
