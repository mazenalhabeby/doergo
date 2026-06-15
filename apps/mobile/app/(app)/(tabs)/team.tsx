import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../src/contexts/theme-context';
import { useToast } from '../../../src/contexts/toast-context';
import { teamApi, type Colleague } from '../../../src/lib/api';
import { Avatar } from '../../../src/components/home/workspace/avatar';
import { getInitials } from '../../../src/components/home/workspace/helpers';
import { COLORS } from '../../../src/lib/constants';

export default function TeamScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const fetchedRef = useRef(false);

  const load = useCallback(async (refresh = false) => {
    try {
      if (refresh) setRefreshing(true); else setLoading(true);
      setColleagues(await teamApi.list());
    } catch {
      // leave list as-is
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

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[COLORS.primary]} tintColor={COLORS.primary} />}
      >
        <Text style={[styles.title, { color: colors.textPrimary }]}>Team</Text>
        <Text style={[styles.sub, { color: colors.textMuted }]}>Teammates in your spaces.</Text>

        {loading ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginTop: 32 }} />
        ) : colleagues.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="people-outline" size={26} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>No teammates in your spaces yet.</Text>
          </View>
        ) : (
          colleagues.map((c) => (
            <View key={c.id} style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Avatar id={c.id} initials={getInitials(c.firstName, c.lastName)} imageUrl={c.avatarUrl} size={40} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{c.firstName} {c.lastName}</Text>
                <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
                  {(c.position || 'Employee')}{c.spaceName ? ` · ${c.spaceName}` : ''}
                </Text>
              </View>
              <TouchableOpacity style={[styles.iconBtn, { backgroundColor: COLORS.primary }]} onPress={() => toast.info('Messaging coming soon')} activeOpacity={0.8}>
                <Ionicons name="chatbubble-ellipses" size={16} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.iconBtn, { backgroundColor: colors.surfaceRaised }]} onPress={() => toast.info('Calls coming soon')} activeOpacity={0.8}>
                <Ionicons name="call" size={15} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: 22, fontWeight: '700' },
  sub: { fontSize: 13, marginTop: 2, marginBottom: 16 },
  empty: { borderWidth: 1, borderRadius: 14, paddingVertical: 32, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderRadius: 13, padding: 11, marginBottom: 8 },
  name: { fontSize: 14, fontWeight: '600' },
  meta: { fontSize: 11, marginTop: 1 },
  iconBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});
