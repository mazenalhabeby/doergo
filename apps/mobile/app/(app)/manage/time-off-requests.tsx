import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTimeFormat } from '../../../src/hooks/useTimeFormat';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../../src/contexts/theme-context';
import { useToast } from '../../../src/contexts/toast-context';
import { timeOffApi } from '../../../src/lib/api';
import type { TimeOffRequest } from '../../../src/lib/api/types';
import { FilterChip } from '../../../src/components/filter-chip';
import {
  COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOWS,
} from '../../../src/lib/constants';
import { Skeleton, ConfirmSheet, ScreenContainer, ScreenHeader } from '../../../src/components';
import { getTimeOffStatusStyle } from '../../../src/lib/styles';

type StatusFilter = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';

const FILTER_KEYS: StatusFilter[] = ['PENDING', 'APPROVED', 'REJECTED', 'ALL'];

export default function TimeOffRequestsScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  // Dates follow the active language rather than a hardcoded en-US locale.
  const { locale } = useTimeFormat();
  const toast = useToast();
  const [requests, setRequests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>('PENDING');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<{ techId: string; requestId: string } | null>(null);

  const fetchRequests = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) setIsRefreshing(true);
      else setIsLoading(true);

      /*
        One request, not one per employee.

        This listed the whole staff and then asked each of them for their leave
        — a fan-out that grew with the payroll and capped silently at a hundred
        people. It also could not work for a supervisor at all: the employee
        directory is an org-wide read they are refused, so the loop had nobody
        to ask about.

        The org endpoint answers with what this caller may decide — everyone,
        or their own crew — and brings the member with each row.
      */
      const rows = await timeOffApi.listOrg();
      const allRequests = rows.map((r: any) => ({
        ...r,
        techName: `${r.technician?.firstName ?? ''} ${r.technician?.lastName ?? ''}`.trim(),
        techId: r.technician?.id ?? r.technicianId,
      }));

      // Sort: pending first, then by date
      allRequests.sort((a, b) => {
        if (a.status === 'PENDING' && b.status !== 'PENDING') return -1;
        if (b.status === 'PENDING' && a.status !== 'PENDING') return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      setRequests(allRequests);
    } catch (err: any) {
      if (err?.statusCode === 401) return;
      toast.error(t('common.error'), err?.message || t('manage.timeOffRequestsScreen.failedToLoad'));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchRequests(); }, [fetchRequests]));

  const handleApprove = async (techId: string, requestId: string) => {
    setActionLoading(requestId);
    try {
      await timeOffApi.approve(requestId, { approved: true });
      await fetchRequests();
    } catch (err: any) {
      toast.error(t('common.error'), err?.message || t('manage.timeOffRequestsScreen.failedToApprove'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = (techId: string, requestId: string) => {
    setRejectTarget({ techId, requestId });
  };

  const confirmReject = async () => {
    if (!rejectTarget) return;
    const { requestId } = rejectTarget;
    setRejectTarget(null);
    setActionLoading(requestId);
    try {
      await timeOffApi.approve(requestId, { approved: false });
      await fetchRequests();
    } catch (err: any) {
      toast.error(t('common.error'), err?.message || t('manage.timeOffRequestsScreen.failedToReject'));
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = useMemo(() => filter === 'ALL' ? requests : requests.filter(r => r.status === filter), [requests, filter]);

  const formatDate = (d: string) => new Date(d).toLocaleDateString(locale, { month: 'short', day: 'numeric' });

  const renderItem = ({ item }: { item: any }) => {
    const statusStyle = getTimeOffStatusStyle(item.status);
    const isPending = item.status === 'PENDING';
    const isActioning = actionLoading === item.id;

    return (
      <View style={[s.card, { backgroundColor: colors.card }]}>
        <View style={s.cardTop}>
          <View style={s.cardInfo}>
            <Text style={[s.techName, { color: colors.textPrimary }]}>{item.techName}</Text>
            <Text style={[s.dates, { color: colors.textSecondary }]}>
              {formatDate(item.startDate)} — {formatDate(item.endDate)}
            </Text>
            {item.reason && (
              <Text style={[s.reason, { color: colors.textMuted }]} numberOfLines={1}>{item.reason}</Text>
            )}
          </View>
          <View style={[s.statusBadge, { backgroundColor: statusStyle.bg }]}>
            <Text style={[s.statusText, { color: statusStyle.text }]}>{t(`timeOffStatus.${item.status}`)}</Text>
          </View>
        </View>
        {isPending && (
          <View style={s.actions}>
            <TouchableOpacity
              style={[s.actionBtn, s.rejectBtn, { borderColor: COLORS.error }]}
              onPress={() => handleReject(item.techId, item.id)}
              disabled={isActioning}
            >
              {isActioning ? <ActivityIndicator size="small" color={COLORS.error} /> : (
                <>
                  <Ionicons name="close" size={16} color={COLORS.error} />
                  <Text style={[s.actionBtnText, { color: COLORS.error }]}>{t('common.reject')}</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.actionBtn, s.approveBtn]}
              onPress={() => handleApprove(item.techId, item.id)}
              disabled={isActioning}
            >
              {isActioning ? <ActivityIndicator size="small" color={COLORS.white} /> : (
                <>
                  <Ionicons name="checkmark" size={16} color={COLORS.white} />
                  <Text style={[s.actionBtnText, { color: COLORS.white }]}>{t('common.approve')}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={[s.container, { backgroundColor: colors.surface }]}>
        <Skeleton.ListScreen />
      </View>
    );
  }

  return (
    <View style={[s.container, { backgroundColor: colors.surface, paddingTop: insets.top }]}>
      <ScreenHeader title={t('manage.titles.timeOffRequests')} />
      <View style={s.filterRow}>
        {FILTER_KEYS.map(f => (
          <FilterChip key={f} label={t(`manage.timeOffRequestsScreen.filters.${f.toLowerCase()}`)} active={filter === f} onPress={() => setFilter(f)} />
        ))}
      </View>
      <ScreenContainer width="content">
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => fetchRequests(true)} colors={[COLORS.primary]} tintColor={COLORS.primary} />}
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name="calendar-outline" size={40} color={colors.textMuted} />
              <Text style={[s.emptyText, { color: colors.textMuted }]}>{filter !== 'ALL' ? t('manage.timeOffRequestsScreen.noRequests', { filter: t(`manage.timeOffRequestsScreen.filters.${filter.toLowerCase()}`) }) : t('manage.timeOffRequestsScreen.noRequestsAll')}</Text>
            </View>
          }
        />
      </ScreenContainer>

      <ConfirmSheet
        visible={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        onConfirm={confirmReject}
        title={t('manage.timeOffRequestsScreen.rejectConfirmTitle')}
        message={t('manage.timeOffRequestsScreen.rejectConfirmMessage')}
        confirmLabel={t('common.reject')}
        cancelLabel={t('common.cancel')}
        variant="danger"
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  filterRow: { flexDirection: 'row', gap: SPACING.sm, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  list: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl },
  card: { borderRadius: RADIUS.md, padding: SPACING.lg, marginBottom: SPACING.md, ...SHADOWS.sm },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardInfo: { flex: 1, marginRight: SPACING.md },
  techName: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.semibold },
  dates: { fontSize: FONT_SIZE.sm, marginTop: 2 },
  reason: { fontSize: FONT_SIZE.sm, marginTop: 4 },
  statusBadge: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, borderRadius: RADIUS.sm },
  statusText: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold },
  actions: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.md },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs, paddingVertical: SPACING.sm + 2, borderRadius: RADIUS.md },
  rejectBtn: { borderWidth: 1 },
  approveBtn: { backgroundColor: COLORS.primary },
  actionBtnText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold },
  empty: { paddingVertical: SPACING.xxxl * 2, alignItems: 'center' },
  emptyText: { fontSize: FONT_SIZE.base, marginTop: SPACING.md },
});
