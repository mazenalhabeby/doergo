import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { formatShortDate } from '../../lib/utils';
import { AText, Well, Banner, SectionLabel } from '../amazen';
import type { AvailabilityInsights } from './helpers';
import { LoadingLine } from '../loading-line';

/** Who else is out over the picked range, and how thin the team gets — for somebody who may read it. */
export function TeamAvailabilityPanel({
  loading,
  failed,
  insights,
  locale,
}: {
  loading: boolean;
  failed: boolean;
  insights: AvailabilityInsights | null;
  locale: string;
}) {
  const { t } = useTranslation();
  const { amazen } = useTheme();

  return (
    <Well style={{ padding: amazen.space(3.5), gap: amazen.space(2) }}>
      <SectionLabel>{t('timeOff.teamAvailability.title')}</SectionLabel>
      {failed ? (
        <AText variant="caption" tone="muted">{t('timeOff.teamAvailability.unableToLoad')}</AText>
      ) : loading || !insights ? (
        <LoadingLine />
      ) : (
        <>
          <AText variant="body" tone="strong" style={{ fontSize: 14 }}>
            {t('timeOff.teamAvailability.techsAvailable', { available: insights.worstAvailable, total: insights.worstTotal })}
            {insights.worstDay ? (
              <AText
                variant="caption"
                tone="muted"
              >{` ${t('timeOff.teamAvailability.worst', { date: formatShortDate(insights.worstDay, locale) })}`}</AText>
            ) : null}
          </AText>
          {insights.lowCoverage ? (
            <Banner tone="warn" text={t('timeOff.teamAvailability.lowCoverage', { date: formatShortDate(insights.worstDay, locale) })} />
          ) : null}
          {insights.userNotScheduledDays.length > 0 ? (
            <Banner
              tone="neutral"
              text={insights.userNotScheduledDays.length > 1
                ? t('timeOff.teamAvailability.notScheduledPlural', { count: insights.userNotScheduledDays.length })
                : t('timeOff.teamAvailability.notScheduled', { count: insights.userNotScheduledDays.length })}
            />
          ) : null}
          {insights.teamOnTimeOff.length > 0 ? (
            <View style={{ gap: 2 }}>
              <AText variant="caption" tone="muted">{t('timeOff.teamAvailability.alsoOnTimeOff')}</AText>
              <AText variant="caption" tone="ink" numberOfLines={3}>
                {insights.teamOnTimeOff.slice(0, 5).join(' · ')}
                {insights.teamOnTimeOff.length > 5 ? ` · ${t('common.more', { count: insights.teamOnTimeOff.length - 5 })}` : ''}
              </AText>
            </View>
          ) : null}
        </>
      )}
    </Well>
  );
}
