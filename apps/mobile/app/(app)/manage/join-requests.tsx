import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../../src/contexts/theme-context';
import { joinRequestsApi, type JoinRequest } from '../../../src/lib/api';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOWS } from '../../../src/lib/constants';
import { Skeleton } from '../../../src/components';

export default function JoinRequestsScreen() {
  const { colors } = useTheme();
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchRequests = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) setIsRefreshing(true);
      else setIsLoading(true);
      const result = await joinRequestsApi.list({ status: 'PENDING' });
      setRequests(result);
    } catch (err: any) {
      if (err?.statusCode === 401) return;
      Alert.alert('Error', err?.message || 'Failed to load join requests');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchRequests(); }, [fetchRequests]));

  const handleApprove = (req: JoinRequest) => {
    Alert.alert(
      'Approve Request',
      `Approve ${req.user.firstName} ${req.user.lastName} as Technician?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            setActionLoading(req.id);
            try {
              await joinRequestsApi.approve(req.id, { role: 'TECHNICIAN' });
              await fetchRequests();
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to approve');
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
  };

  const handleReject = (req: JoinRequest) => {
    Alert.alert(
      'Reject Request',
      `Reject ${req.user.firstName} ${req.user.lastName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(req.id);
            try {
              await joinRequestsApi.reject(req.id);
              await fetchRequests();
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to reject');
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: JoinRequest }) => {
    const isActioning = actionLoading === item.id;
    return (
      <View style={[s.card, { backgroundColor: colors.card }]}>
        <View style={s.cardTop}>
          <View style={[s.avatar, { backgroundColor: colors.surfaceRaised }]}>
            <Ionicons name="person-add-outline" size={20} color={colors.textSecondary} />
          </View>
          <View style={s.info}>
            <Text style={[s.name, { color: colors.textPrimary }]}>
              {item.user.firstName} {item.user.lastName}
            </Text>
            <Text style={[s.email, { color: colors.textMuted }]}>{item.user.email}</Text>
            <Text style={[s.date, { color: colors.textMuted }]}>
              Requested {new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </Text>
          </View>
        </View>
        <View style={s.actions}>
          <TouchableOpacity
            style={[s.actionBtn, s.rejectBtn, { borderColor: COLORS.error }]}
            onPress={() => handleReject(item)}
            disabled={isActioning}
          >
            {isActioning ? <ActivityIndicator size="small" color={COLORS.error} /> : (
              <>
                <Ionicons name="close" size={16} color={COLORS.error} />
                <Text style={[s.actionText, { color: COLORS.error }]}>Reject</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.actionBtn, s.approveBtn]}
            onPress={() => handleApprove(item)}
            disabled={isActioning}
          >
            {isActioning ? <ActivityIndicator size="small" color={COLORS.white} /> : (
              <>
                <Ionicons name="checkmark" size={16} color={COLORS.white} />
                <Text style={[s.actionText, { color: COLORS.white }]}>Approve</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
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
      <FlatList
        data={requests}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => fetchRequests(true)} colors={[COLORS.primary]} tintColor={COLORS.primary} />}
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="checkmark-done-circle-outline" size={48} color={colors.textMuted} />
            <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>All caught up</Text>
            <Text style={[s.emptyText, { color: colors.textMuted }]}>No pending join requests</Text>
          </View>
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.xxl },
  card: { borderRadius: RADIUS.md, padding: SPACING.lg, marginBottom: SPACING.md, ...SHADOWS.sm },
  cardTop: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md },
  info: { flex: 1 },
  name: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.semibold },
  email: { fontSize: FONT_SIZE.sm, marginTop: 1 },
  date: { fontSize: FONT_SIZE.xs, marginTop: 4 },
  actions: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.lg },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs, paddingVertical: SPACING.sm + 2, borderRadius: RADIUS.md },
  rejectBtn: { borderWidth: 1 },
  approveBtn: { backgroundColor: COLORS.primary },
  actionText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold },
  empty: { paddingVertical: SPACING.xxxl * 2, alignItems: 'center' },
  emptyTitle: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.semibold, marginTop: SPACING.lg },
  emptyText: { fontSize: FONT_SIZE.base, marginTop: SPACING.xs },
});
