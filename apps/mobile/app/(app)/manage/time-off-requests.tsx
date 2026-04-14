import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../../src/contexts/theme-context';
import { timeOffApi, techniciansApi } from '../../../src/lib/api';
import type { TimeOffRequest } from '../../../src/lib/api/types';
import { FilterChip } from '../../../src/components/filter-chip';
import {
  COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOWS,
} from '../../../src/lib/constants';
import { Skeleton } from '../../../src/components';
import { getTimeOffStatusStyle } from '../../../src/lib/styles';

type StatusFilter = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'PENDING', label: 'Pending' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'ALL', label: 'All' },
];

export default function TimeOffRequestsScreen() {
  const { colors } = useTheme();
  const [requests, setRequests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>('PENDING');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchRequests = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) setIsRefreshing(true);
      else setIsLoading(true);

      // Fetch all technicians, then get time-off for each
      const techResult = await techniciansApi.list({ status: 'active', limit: 100 });
      const techs = Array.isArray(techResult) ? techResult : (techResult as any)?.data || [];

      const allRequests: any[] = [];
      for (const tech of techs) {
        try {
          const reqs = await timeOffApi.list(tech.id);
          const list = Array.isArray(reqs) ? reqs : [];
          list.forEach((r: any) => {
            allRequests.push({ ...r, techName: `${tech.firstName} ${tech.lastName}`, techId: tech.id });
          });
        } catch { /* skip */ }
      }

      // Sort: pending first, then by date
      allRequests.sort((a, b) => {
        if (a.status === 'PENDING' && b.status !== 'PENDING') return -1;
        if (b.status === 'PENDING' && a.status !== 'PENDING') return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      setRequests(allRequests);
    } catch (err: any) {
      if (err?.statusCode === 401) return;
      Alert.alert('Error', err?.message || 'Failed to load time-off requests');
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
      Alert.alert('Error', err?.message || 'Failed to approve');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = (techId: string, requestId: string) => {
    Alert.prompt?.('Reject Request', 'Reason (optional):', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reject',
        style: 'destructive',
        onPress: async (reason?: string) => {
          setActionLoading(requestId);
          try {
            await timeOffApi.approve(requestId, { approved: false, rejectionReason: reason });
            await fetchRequests();
          } catch (err: any) {
            Alert.alert('Error', err?.message || 'Failed to reject');
          } finally {
            setActionLoading(null);
          }
        },
      },
    ]) || Alert.alert('Reject Request', 'Reject this time-off request?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reject',
        style: 'destructive',
        onPress: async () => {
          setActionLoading(requestId);
          try {
            await timeOffApi.approve(requestId, { approved: false });
            await fetchRequests();
          } catch (err: any) {
            Alert.alert('Error', err?.message || 'Failed to reject');
          } finally {
            setActionLoading(null);
          }
        },
      },
    ]);
  };

  const filtered = useMemo(() => filter === 'ALL' ? requests : requests.filter(r => r.status === filter), [requests, filter]);

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

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
            <Text style={[s.statusText, { color: statusStyle.color }]}>{item.status}</Text>
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
                  <Text style={[s.actionBtnText, { color: COLORS.error }]}>Reject</Text>
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
                  <Text style={[s.actionBtnText, { color: COLORS.white }]}>Approve</Text>
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
    <View style={[s.container, { backgroundColor: colors.surface }]}>
      <View style={s.filterRow}>
        {FILTERS.map(f => (
          <FilterChip key={f.key} label={f.label} active={filter === f.key} onPress={() => setFilter(f.key)} />
        ))}
      </View>
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
            <Text style={[s.emptyText, { color: colors.textMuted }]}>No {filter !== 'ALL' ? filter.toLowerCase() : ''} requests</Text>
          </View>
        }
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
