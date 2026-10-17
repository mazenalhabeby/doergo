import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { AText } from '../amazen';
import { Banner } from '../job/job-ui';
import { TourTarget } from '../tour';
import type { TimeOffStats } from './helpers';

/**
 * The four figures: leave days used, leave days coming up, requests waiting,
 * requests declined. Glass tiles on the ground, a figure over a word — the
 * same tile the extra-time queue uses.
 *
 * ⚠️ Four across is a measured slot (`tools/i18n/check-slot-widths.mjs`,
 * "time-off stat tile"): 4pt gaps, 8pt side padding, two lines of 11pt.
 */
export function TimeOffStatsRow({ stats }: { stats: TimeOffStats }) {
  const { t } = useTranslation();
  const { amazen } = useTheme();
  const c = amazen.color;
  const tiles: { key: string; value: number; label: string; tone?: string }[] = [
    { key: 'used', value: stats.daysUsed, label: t('timeOff.stats.daysUsed') },
    { key: 'upcoming', value: stats.upcoming, label: t('timeOff.stats.upcoming') },
    { key: 'pending', value: stats.pending, label: t('timeOff.stats.pending'), tone: stats.pending ? c.warn : undefined },
    { key: 'rejected', value: stats.rejected, label: t('timeOff.stats.rejected') },
  ];
  return (
    <TourTarget name="timeoff-header" style={{ flexDirection: 'row', gap: 4 }}>
      {tiles.map((tile) => (
        <View
          key={tile.key}
          style={{
            flex: 1,
            borderRadius: 18,
            paddingVertical: amazen.space(2.5),
            paddingHorizontal: 8,
            backgroundColor: c.glass,
            borderWidth: 1,
            borderColor: c.lineGlass,
          }}>
          <AText
            numeric
            style={{ fontFamily: amazen.font.mono, fontSize: 22, lineHeight: 28, color: tile.tone ?? c.inkStrong }}
          >
            {tile.value}
          </AText>
          <AText variant="caption" tone="onGlass" numberOfLines={2} style={{ fontSize: 11, lineHeight: 14 }}>{tile.label}</AText>
        </View>
      ))}
    </TourTarget>
  );
}

/** "Your schedule is not set" — shown above the calendar when the member has none. */
export function ScheduleNotSetBanner() {
  const { t } = useTranslation();
  return <Banner tone="neutral" text={t('timeOff.scheduleNotSet')} />;
}
