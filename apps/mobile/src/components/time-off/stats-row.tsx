import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { COLORS } from '../../lib/constants';
import { TourTarget } from '../tour';
import type { TimeOffStats } from './helpers';
import { styles } from './styles';

/** The four tiles: days used, upcoming, pending, rejected. */
export function TimeOffStatsRow({ stats }: { stats: TimeOffStats }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const tiles: { icon: keyof typeof Ionicons.glyphMap; bg: string; tone: string; value: number; label: string }[] = [
    { icon: 'checkmark-done', bg: colors.primaryLight, tone: COLORS.primary, value: stats.daysUsed, label: t('timeOff.stats.daysUsed') },
    { icon: 'sunny', bg: colors.successLight, tone: COLORS.success, value: stats.upcoming, label: t('timeOff.stats.upcoming') },
    { icon: 'hourglass', bg: colors.amberLight, tone: COLORS.amber, value: stats.pending, label: t('timeOff.stats.pending') },
    { icon: 'ban', bg: colors.errorLight, tone: COLORS.error, value: stats.rejected, label: t('timeOff.stats.rejected') },
  ];
  return (
    <TourTarget name="timeoff-header" style={styles.statsRow}>
      {tiles.map((tile) => (
        <View key={tile.icon} style={[styles.statCard, { backgroundColor: colors.card }]}>
          <View style={[styles.statIconWrap, { backgroundColor: tile.bg }]}>
            <Ionicons name={tile.icon} size={18} color={tile.tone} />
          </View>
          <Text style={[styles.statNumber, { color: tile.tone }]}>{tile.value}</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]} numberOfLines={2}>{tile.label}</Text>
        </View>
      ))}
    </TourTarget>
  );
}

/** "Your schedule is not set" — shown above the calendar when the member has none. */
export function ScheduleNotSetBanner() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={[styles.infoBanner, { backgroundColor: colors.primaryLight }]}>
      <Ionicons name="information-circle-outline" size={18} color={COLORS.primary} />
      <Text style={styles.infoBannerText}>
        {t('timeOff.scheduleNotSet')}
      </Text>
    </View>
  );
}
