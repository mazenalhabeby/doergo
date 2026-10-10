import { ActivityIndicator, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { COLORS, SPACING } from '../../lib/constants';
import { formatShortDate } from '../../lib/utils';
import type { AvailabilityInsights } from './helpers';
import { styles } from './styles';

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
  const { colors } = useTheme();

  return (
    <View style={[styles.insightCard, { backgroundColor: colors.card }]}>
      <View style={styles.insightHeader}>
        <Ionicons name="people" size={18} color={COLORS.primary} />
        <Text style={[styles.insightTitle, { color: colors.textPrimary }]}>{t('timeOff.teamAvailability.title')}</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: SPACING.md }} />
      ) : failed ? (
        <Text style={[styles.insightMuted, { color: colors.textMuted }]}>{t('timeOff.teamAvailability.unableToLoad')}</Text>
      ) : insights ? (
        <View style={styles.insightContent}>
          <Text style={[styles.insightSummary, { color: colors.textPrimary }]}>
            {t('timeOff.teamAvailability.techsAvailable', { available: insights.worstAvailable, total: insights.worstTotal })}
            {insights.worstDay && (
              <Text style={[styles.insightMuted, { color: colors.textMuted }]}>
                {' '}{t('timeOff.teamAvailability.worst', { date: formatShortDate(insights.worstDay, locale) })}
              </Text>
            )}
          </Text>

          {insights.lowCoverage && (
            <View style={[styles.warningRow, { backgroundColor: colors.amberLight }]}>
              <Ionicons name="warning" size={16} color={COLORS.amber} />
              <Text style={styles.warningText}>
                {t('timeOff.teamAvailability.lowCoverage', { date: formatShortDate(insights.worstDay, locale) })}
              </Text>
            </View>
          )}

          {insights.userNotScheduledDays.length > 0 && (
            <View style={[styles.warningRow, { backgroundColor: colors.amberLight }]}>
              <Ionicons name="information-circle" size={16} color={COLORS.primary} />
              <Text style={styles.warningText}>
                {insights.userNotScheduledDays.length > 1
                  ? t('timeOff.teamAvailability.notScheduledPlural', { count: insights.userNotScheduledDays.length })
                  : t('timeOff.teamAvailability.notScheduled', { count: insights.userNotScheduledDays.length })}
              </Text>
            </View>
          )}

          {insights.teamOnTimeOff.length > 0 && (
            <View style={styles.teamOffSection}>
              <Text style={[styles.teamOffLabel, { color: colors.textSecondary }]}>{t('timeOff.teamAvailability.alsoOnTimeOff')}</Text>
              {insights.teamOnTimeOff.slice(0, 5).map((name, i) => (
                <Text key={i} style={[styles.teamOffName, { color: colors.textSecondary }]}>{name}</Text>
              ))}
              {insights.teamOnTimeOff.length > 5 && (
                <Text style={[styles.teamOffMore, { color: colors.textMuted }]}>
                  {t('common.more', { count: insights.teamOnTimeOff.length - 5 })}
                </Text>
              )}
            </View>
          )}
        </View>
      ) : (
        <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: SPACING.md }} />
      )}
    </View>
  );
}
