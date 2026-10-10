import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { COLORS } from '../../lib/constants';
import { getTimeOffStatusStyle } from '../../lib/styles';
import { formatShortDate } from '../../lib/utils';
import type { TimeOffRequest } from '../../lib/api/types';
import { SyncChip } from '../../offline/components/sync-chip';
import { FilterChip } from '../filter-chip';
import { TourTarget } from '../tour';
import { getDayCount, getTypeIcon, getTypeLabelKey, type RequestFilter } from './helpers';
import { styles } from './styles';

/** My requests: Upcoming / Past / All, each card with its status and — while pending — Cancel. */
export function TimeOffRequestsList({
  requests,
  filter,
  onFilter,
  locale,
  onCancel,
}: {
  /** Already filtered by `filter`. */
  requests: TimeOffRequest[];
  filter: RequestFilter;
  onFilter: (f: RequestFilter) => void;
  locale: string;
  onCancel: (request: TimeOffRequest) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  return (
    <TourTarget name="timeoff-list" style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('timeOff.myRequests')}</Text>

      {/* Segmented filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
        <View style={styles.filterRow}>
          <FilterChip
            label={t('timeOff.filters.upcoming')}
            active={filter === 'upcoming'}
            onPress={() => onFilter('upcoming')}
          />
          <FilterChip
            label={t('timeOff.filters.past')}
            active={filter === 'past'}
            onPress={() => onFilter('past')}
          />
          <FilterChip
            label={t('timeOff.filters.all')}
            active={filter === 'all'}
            onPress={() => onFilter('all')}
          />
        </View>
      </ScrollView>

      {requests.length === 0 ? (
        <View style={[styles.emptyState, { backgroundColor: colors.card }]}>
          <Ionicons name="calendar-outline" size={48} color={colors.textMuted} />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            {t(`timeOff.empty.${filter}`)}
          </Text>
          {filter === 'upcoming' && (
            <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>
              {t('timeOff.empty.hint')}
            </Text>
          )}
        </View>
      ) : (
        requests.map(request => {
          const statusStyle = getTimeOffStatusStyle(request.status, colors);
          const days = getDayCount(request.startDate, request.endDate);
          const typeLabel = t(getTypeLabelKey(request.reason));
          const typeIcon = getTypeIcon(request.reason);

          return (
            <View key={request.id} style={[styles.requestCard, { backgroundColor: colors.card }]}>
              <View style={styles.requestHeader}>
                <View style={styles.requestType}>
                  <Ionicons name={typeIcon} size={20} color={COLORS.primary} />
                  <Text style={[styles.requestTypeText, { color: colors.textPrimary }]}>{typeLabel}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <SyncChip entityId={request.id} />
                  <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg, borderColor: statusStyle.border }]}>
                    <Text style={[styles.statusText, { color: statusStyle.text }]}>
                      {t(`timeOffStatus.${request.status}`)}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.requestDetails}>
                <View style={styles.detailRow}>
                  <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
                  <Text style={[styles.detailText, { color: colors.textSecondary }]}>
                    {formatShortDate(request.startDate, locale)}
                    {request.startDate !== request.endDate && ` – ${formatShortDate(request.endDate, locale)}`}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Ionicons name="time-outline" size={16} color={colors.textMuted} />
                  <Text style={[styles.detailText, { color: colors.textSecondary }]}>{days} {days > 1 ? t('common.days') : t('common.day')}</Text>
                </View>
              </View>

              {request.reason && (
                <Text style={[styles.reasonText, { color: colors.textSecondary }]} numberOfLines={2}>{request.reason}</Text>
              )}

              {request.status === 'APPROVED' && request.approvedBy && (
                <View style={[styles.approvedRow, { borderTopColor: colors.border }]}>
                  <Ionicons name="checkmark-circle" size={14} color={COLORS.success} />
                  <Text style={styles.approvedText}>
                    {t('timeOff.approvedBy', { firstName: request.approvedBy.firstName, lastName: request.approvedBy.lastName })}
                  </Text>
                </View>
              )}

              {request.rejectionReason && (
                <View style={[styles.rejectionRow, { borderTopColor: colors.border }]}>
                  <Ionicons name="information-circle-outline" size={14} color={COLORS.error} />
                  <Text style={styles.rejectionText}>{request.rejectionReason}</Text>
                </View>
              )}

              {request.status === 'PENDING' && (
                <TouchableOpacity
                  style={[styles.cancelButton, { borderTopColor: colors.border }]}
                  onPress={() => onCancel(request)}
                >
                  <Ionicons name="close-circle-outline" size={16} color={COLORS.error} />
                  <Text style={styles.cancelButtonText}>{t('timeOff.cancelRequest')}</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })
      )}
    </TourTarget>
  );
}
