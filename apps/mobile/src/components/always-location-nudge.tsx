import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, AppState } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as Location from 'expo-location';
import { useTheme } from '../contexts/theme-context';
import { SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../lib/constants';
import { remindAlwaysLocationIfNeeded, clearAlwaysLocationReminder } from '../services/always-location-reminder';
import { AlwaysLocationSheet } from './always-location-sheet';

const AMBER = '#d97706';

/**
 * Nudge shown to a clocked-in worker at a physical space who granted only
 * "While using the app" location. Without "Always", the OS won't wake the app in
 * the background, so out-of-ring detection silently only works while the app is
 * open — the single biggest real-world reliability gap. Tapping opens the OS
 * settings so they can switch to Always. Re-checks on app foreground and hides
 * itself once fixed. Renders nothing when not needed.
 */
export function AlwaysLocationNudge({ active }: { active: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [needsAlways, setNeedsAlways] = React.useState(false);
  const [sheetVisible, setSheetVisible] = React.useState(false);

  const check = React.useCallback(async () => {
    if (!active) {
      setNeedsAlways(false);
      return;
    }
    try {
      const fg = await Location.getForegroundPermissionsAsync();
      const bg = await Location.getBackgroundPermissionsAsync();
      // Foreground granted (they could clock in) but background not "Always".
      const gap = fg.status === 'granted' && bg.status !== 'granted';
      setNeedsAlways(gap);
      if (gap) {
        // Smart local notification (cooldown-deduped) so they hear about it even
        // with the app closed — the banner alone only shows in-app.
        remindAlwaysLocationIfNeeded({ title: t('attendance.alwaysLocation.title'), body: t('attendance.alwaysLocation.body') });
      } else {
        clearAlwaysLocationReminder();
      }
    } catch {
      setNeedsAlways(false);
    }
  }, [active, t]);

  React.useEffect(() => {
    check();
  }, [check]);

  // Re-check when the user returns from Settings so the banner clears once fixed.
  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') check();
    });
    return () => sub.remove();
  }, [check]);

  // Tap: try the OS prompt first (Android 10 / iOS can grant "Always" directly);
  // if that doesn't grant it (later Android opens Settings, or already denied),
  // open the guided sheet with the exact steps.
  const handlePress = React.useCallback(async () => {
    try {
      const res = await Location.requestBackgroundPermissionsAsync();
      if (res.status === 'granted') {
        await check();
        return;
      }
    } catch {
      // fall through to the guide
    }
    setSheetVisible(true);
  }, [check]);

  if (!needsAlways) return null;

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={handlePress}
        style={[styles.banner, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}
      >
        <Ionicons name="location" size={22} color={AMBER} />
        <View style={styles.textWrap}>
          <Text style={[styles.title, { color: AMBER }]} numberOfLines={1}>
            {t('attendance.alwaysLocation.title')}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={3}>
            {t('attendance.alwaysLocation.body')}
          </Text>
        </View>
        <View style={[styles.cta, { backgroundColor: AMBER }]}>
          <Text style={styles.ctaText}>{t('attendance.alwaysLocation.cta')}</Text>
        </View>
      </TouchableOpacity>

      <AlwaysLocationSheet
        visible={sheetVisible}
        onClose={() => {
          setSheetVisible(false);
          // Re-check shortly after (they may have toggled it in Settings).
          setTimeout(() => check(), 500);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    marginBottom: SPACING.md,
  },
  textWrap: { flex: 1 },
  title: { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold },
  subtitle: { fontSize: FONT_SIZE.sm, marginTop: 2 },
  cta: { paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, borderRadius: RADIUS.full },
  ctaText: { color: '#fff', fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold },
});
