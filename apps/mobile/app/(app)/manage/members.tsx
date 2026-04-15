import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../../src/contexts/auth-context';
import { useTheme } from '../../../src/contexts/theme-context';
import { useToast } from '../../../src/contexts/toast-context';
import { membersApi, type OrgMember } from '../../../src/lib/api';
import { FilterChip } from '../../../src/components/filter-chip';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOWS } from '../../../src/lib/constants';
import { Skeleton } from '../../../src/components';

const ROLE_COLORS: Record<string, string> = {
  ADMIN: COLORS.primary,
  CLIENT: COLORS.primary,
  DISPATCHER: COLORS.purple,
  TECHNICIAN: COLORS.amber,
};

export default function MembersScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const toast = useToast();
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [roleFilter, setRoleFilter] = useState<string>('ALL');

  const fetchMembers = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) setIsRefreshing(true);
      else setIsLoading(true);
      const result = await membersApi.list();
      setMembers(result);
    } catch (err: any) {
      if (err?.statusCode === 401) return;
      toast.error('Error', err?.message || 'Failed to load members');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchMembers(); }, [fetchMembers]));

  const handleRemove = (member: OrgMember) => {
    if (member.id === user?.id) {
      toast.warning('Cannot Remove', 'You cannot remove yourself.');
      return;
    }
    Alert.alert(
      'Remove Member',
      `Remove ${member.firstName} ${member.lastName} from the organization?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await membersApi.remove(member.id);
              await fetchMembers();
            } catch (err: any) {
              toast.error('Error', err?.message || 'Failed to remove member');
            }
          },
        },
      ]
    );
  };

  const filtered = useMemo(() => roleFilter === 'ALL'
    ? members
    : members.filter(m => m.role === roleFilter || (roleFilter === 'ADMIN' && m.role === 'CLIENT')),
    [members, roleFilter]);

  const getRoleLabel = useCallback((role: string) => {
    if (role === 'ADMIN' || role === 'CLIENT') return 'Admin';
    if (role === 'DISPATCHER') return 'Dispatcher';
    return 'Technician';
  }, []);

  const renderItem = ({ item }: { item: OrgMember }) => {
    const roleColor = ROLE_COLORS[item.role] || COLORS.slate500;
    const isSelf = item.id === user?.id;

    return (
      <View style={[s.card, { backgroundColor: colors.card }]}>
        <View style={s.cardRow}>
          <View style={[s.avatar, { backgroundColor: roleColor + '20' }]}>
            <Text style={[s.avatarText, { color: roleColor }]}>
              {item.firstName[0]}{item.lastName[0]}
            </Text>
          </View>
          <View style={s.info}>
            <View style={s.nameRow}>
              <Text style={[s.name, { color: colors.textPrimary }]}>
                {item.firstName} {item.lastName}
              </Text>
              {isSelf && <Text style={[s.youBadge, { color: colors.textMuted }]}>(you)</Text>}
            </View>
            <Text style={[s.email, { color: colors.textMuted }]}>{item.email}</Text>
            <View style={s.metaRow}>
              <View style={[s.roleBadge, { backgroundColor: roleColor + '20' }]}>
                <Text style={[s.roleText, { color: roleColor }]}>{getRoleLabel(item.role)}</Text>
              </View>
              {item.specialty && (
                <Text style={[s.specialty, { color: colors.textSecondary }]}>{item.specialty}</Text>
              )}
            </View>
          </View>
          {!isSelf && (
            <TouchableOpacity onPress={() => handleRemove(item)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="ellipsis-vertical" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          )}
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
      <View style={s.filterRow}>
        {['ALL', 'ADMIN', 'DISPATCHER', 'TECHNICIAN'].map(r => (
          <FilterChip key={r} label={r === 'ALL' ? 'All' : getRoleLabel(r)} active={roleFilter === r} onPress={() => setRoleFilter(r)} />
        ))}
      </View>
      <Text style={[s.count, { color: colors.textMuted }]}>{filtered.length} member{filtered.length !== 1 ? 's' : ''}</Text>
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => fetchMembers(true)} colors={[COLORS.primary]} tintColor={COLORS.primary} />}
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="people-outline" size={40} color={colors.textMuted} />
            <Text style={[s.emptyText, { color: colors.textMuted }]}>No members found</Text>
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
  count: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium },
  list: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl },
  card: { borderRadius: RADIUS.md, padding: SPACING.lg, marginBottom: SPACING.md, ...SHADOWS.sm },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md },
  avatarText: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold },
  info: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  name: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.semibold },
  youBadge: { fontSize: FONT_SIZE.sm },
  email: { fontSize: FONT_SIZE.sm, marginTop: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.xs },
  roleBadge: { paddingHorizontal: SPACING.sm, paddingVertical: 2, borderRadius: RADIUS.sm },
  roleText: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold },
  specialty: { fontSize: FONT_SIZE.xs },
  empty: { paddingVertical: SPACING.xxxl * 2, alignItems: 'center' },
  emptyText: { fontSize: FONT_SIZE.base, marginTop: SPACING.md },
});
