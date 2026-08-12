import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/theme-context';
import { SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../lib/constants';
import type { GeofenceExcursion } from '../lib/api';

const ACCENT = '#ea580c';
const GREEN = '#059669';

/**
 * Compact out-of-ring banner for the home screen. Shows the active excursion's
 * state (needs a reason / waiting / approved countdown) and, when tappable,
 * routes the worker to the attendance tab to act. Renders nothing otherwise.
 */
export function OutOfRingHomeBanner({
  excursion,
  onPress,
}: {
  excursion: GeofenceExcursion | null | undefined;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [countdown, setCountdown] = React.useState('');

  const status = excursion?.status;
  const expiresAt = excursion?.expiresAt;

  React.useEffect(() => {
    if (status !== 'APPROVED' || !expiresAt) {
      setCountdown('');
      return;
    }
    const target = new Date(expiresAt).getTime();
    const tick = () => {
      const total = Math.max(0, Math.floor((target - Date.now()) / 1000));
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const s = total % 60;
      const pad = (n: number) => String(n).padStart(2, '0');
      setCountdown(h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [status, expiresAt]);

  if (!excursion || !['OUT_UNREPORTED', 'PENDING', 'APPROVED'].includes(status || '')) return null;

  const approved = status === 'APPROVED';
  const tint = approved ? GREEN : ACCENT;
  const bg = approved ? '#ECFDF5' : '#FFF7ED';
  const border = approved ? '#A7F3D0' : '#FED7AA';

  let title = '';
  let subtitle = '';
  let icon: keyof typeof Ionicons.glyphMap = 'navigate';
  if (status === 'OUT_UNREPORTED') {
    icon = 'navigate';
    title = t('attendance.outOfRing.homeOutTitle');
    subtitle = t('attendance.outOfRing.homeOutBody');
  } else if (status === 'PENDING') {
    icon = 'hourglass-outline';
    title = t('attendance.outOfRing.bannerPendingTitle');
    subtitle = t('attendance.outOfRing.homePendingBody');
  } else {
    icon = 'timer-outline';
    title = t('attendance.outOfRing.bannerApprovedTitle');
    subtitle = countdown ? t('attendance.outOfRing.bannerApprovedBody', { time: countdown }) : t('attendance.outOfRing.timeExpired');
  }

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={[styles.banner, { backgroundColor: bg, borderColor: border }]}
    >
      <Ionicons name={icon} size={22} color={tint} />
      <View style={styles.textWrap}>
        <Text style={[styles.title, { color: tint }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
      {status === 'OUT_UNREPORTED' && (
        <View style={[styles.cta, { backgroundColor: tint }]}>
          <Text style={styles.ctaText}>{t('attendance.outOfRing.tellUsWhy')}</Text>
        </View>
      )}
      {status !== 'OUT_UNREPORTED' && <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
    </TouchableOpacity>
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
