import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '../../lib/constants';
import { useConnectivity, useSyncStatus } from '../offline-context';

/**
 * The one line that says what the network means for the member right now.
 *
 * In priority order: something needs them (always shown, taps through to Sync);
 * offline or limited (with what is waiting); sending. Online with nothing
 * pending renders nothing — the normal case stays quiet.
 */
export function OfflineBanner({ style }: { style?: object }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const connectivity = useConnectivity();
  const { snapshot } = useSyncStatus();

  let tone: 'attention' | 'offline' | 'sending' | null = null;
  let text = '';
  if (snapshot.attention > 0) {
    tone = 'attention';
    text = t('offline.banner.attention', { count: snapshot.attention });
  } else if (connectivity === 'offline') {
    tone = 'offline';
    text = snapshot.waiting > 0 ? t('offline.banner.offlineWaiting', { count: snapshot.waiting }) : t('offline.banner.offline');
  } else if (connectivity === 'limited') {
    tone = 'offline';
    text = t('offline.banner.limited');
  } else if (snapshot.waiting > 0 && snapshot.pushing) {
    tone = 'sending';
    text = t('offline.banner.sending', { count: snapshot.waiting });
  }
  if (!tone) return null;

  const palette =
    tone === 'attention'
      ? { bg: colors.errorLight, fg: COLORS.error, icon: 'alert-circle' as const }
      : tone === 'offline'
        ? { bg: colors.warningLight, fg: COLORS.warning, icon: 'cloud-offline-outline' as const }
        : { bg: colors.primaryLight, fg: COLORS.primary, icon: 'cloud-upload-outline' as const };

  return (
    <Pressable
      onPress={() => router.push('/sync' as Href)}
      accessibilityRole="button"
      style={({ pressed }) => [s.banner, { backgroundColor: palette.bg }, pressed && s.pressed, style]}
    >
      {tone === 'sending' ? (
        <ActivityIndicator size="small" color={palette.fg} />
      ) : (
        <Ionicons name={palette.icon} size={18} color={palette.fg} />
      )}
      <Text style={[s.text, { color: colors.textPrimary }]} numberOfLines={2}>
        {text}
      </Text>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.md,
  },
  text: { flex: 1, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium },
  pressed: { opacity: 0.85 },
});
