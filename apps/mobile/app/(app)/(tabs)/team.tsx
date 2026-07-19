import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { SocketEvents } from '@hbcfield/shared/client';
import { useTheme } from '../../../src/contexts/theme-context';
import { useToast } from '../../../src/contexts/toast-context';
import { useSocketContext } from '../../../src/contexts/socket-context';
import { teamApi, type Colleague } from '../../../src/lib/api';
import { Avatar } from '../../../src/components/home/workspace/avatar';
import { getInitials, type WorkerStatus } from '../../../src/components/home/workspace/helpers';
import { ScreenContainer } from '../../../src/components';
import { COLORS } from '../../../src/lib/constants';

function presenceStatus(p?: string | null): WorkerStatus {
  return p === 'AVAILABLE' ? 'on' : p === 'BUSY' ? 'busy' : p === 'AWAY' ? 'away' : 'off';
}
function presenceLabel(p: string | null | undefined, t: import('i18next').TFunction) {
  if (p === 'AVAILABLE') return t('chat.presence.active', 'Active now');
  if (p === 'BUSY') return t('chat.presence.busy', 'Busy');
  if (p === 'AWAY') return t('chat.presence.away', 'Away');
  return t('chat.presence.offline', 'Offline');
}

export default function TeamScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const { t } = useTranslation();
  const router = useRouter();
  const { subscribe, isAuthenticated } = useSocketContext();
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [managerList, setManagerList] = useState<Colleague[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const fetchedRef = useRef(false);

  const load = useCallback(async (refresh = false) => {
    try {
      if (refresh) setRefreshing(true); else setLoading(true);
      const [team, mgrs] = await Promise.all([
        teamApi.list().catch(() => [] as Colleague[]),
        teamApi.managers().catch(() => [] as Colleague[]),
      ]);
      setColleagues(team);
      setManagerList(mgrs);
    } catch {
      // leave lists as-is
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    load();
  }, [load]);

  // Live presence: patch the matching colleague when anyone's status changes.
  useEffect(() => {
    if (!isAuthenticated) return;
    return subscribe(SocketEvents.PRESENCE_CHANGED, (d: { userId: string; presence: string | null }) => {
      const patch = (prev: Colleague[]) => prev.map((c) => (c.id === d.userId ? { ...c, presence: d.presence as Colleague['presence'] } : c));
      setColleagues(patch);
      setManagerList(patch);
    });
  }, [isAuthenticated, subscribe]);

  // Managers come from the org-wide Contact-management directory; the Team section
  // is everyone else (drop anyone already shown as a manager, and the current user).
  const { managers, members } = useMemo(() => {
    const managerIds = new Set(managerList.map((m) => m.id));
    return {
      managers: managerList,
      members: colleagues.filter((c) => !managerIds.has(c.id)),
    };
  }, [managerList, colleagues]);

  const renderRow = (c: Colleague) => (
    <View key={c.id} style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Avatar id={c.id} initials={getInitials(c.firstName, c.lastName)} imageUrl={c.avatarUrl} size={40} status={presenceStatus(c.presence)} ringColor={colors.card} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{c.firstName} {c.lastName}</Text>
        <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
          {[presenceLabel(c.presence, t), c.position, c.spaceName].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <TouchableOpacity style={[styles.iconBtn, { backgroundColor: COLORS.primary }]} onPress={() => router.push({ pathname: '/chat', params: { userId: c.id } })} activeOpacity={0.8}>
        <Ionicons name="chatbubble-ellipses" size={16} color="#fff" />
      </TouchableOpacity>
      <TouchableOpacity style={[styles.iconBtn, { backgroundColor: colors.surfaceRaised }]} onPress={() => toast.info(t('team.callsSoon'))} activeOpacity={0.8}>
        <Ionicons name="call" size={15} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <ScreenContainer width="content">
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[COLORS.primary]} tintColor={COLORS.primary} />}
      >
        <Text style={[styles.title, { color: colors.textPrimary }]}>{t('team.title')}</Text>
        <Text style={[styles.sub, { color: colors.textMuted }]}>{t('team.subtitle')}</Text>

        {loading ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginTop: 32 }} />
        ) : managers.length === 0 && members.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="people-outline" size={26} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>{t('team.empty')}</Text>
          </View>
        ) : (
          <>
            {managers.length > 0 && (
              <>
                <Text style={[styles.section, { color: colors.textMuted }]}>{t('team.managers', 'Managers')}</Text>
                {managers.map(renderRow)}
              </>
            )}
            {members.length > 0 && (
              <>
                <Text style={[styles.section, { color: colors.textMuted }]}>{t('team.members', 'Team')}</Text>
                {members.map(renderRow)}
              </>
            )}
          </>
        )}
      </ScrollView>
      </ScreenContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: 22, fontWeight: '700' },
  sub: { fontSize: 13, marginTop: 2, marginBottom: 16 },
  section: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8, marginTop: 4 },
  empty: { borderWidth: 1, borderRadius: 14, paddingVertical: 32, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderRadius: 13, padding: 11, marginBottom: 8 },
  name: { fontSize: 14, fontWeight: '600' },
  meta: { fontSize: 11, marginTop: 1 },
  iconBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});
