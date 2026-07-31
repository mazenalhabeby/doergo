import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../src/contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE } from '../../../src/lib/constants';
import { portalApi } from '../../../src/lib/api/portal';
import { RequestRow } from '../../../src/components/customer/request-bits';

const CLOSED = /COMPLET|CLOSED|CANCEL|RESOLV|DONE/i;
type Filter = 'all' | 'open' | 'done';

export default function CustomerRequests() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();

  const q = useQuery({ queryKey: ['portal', 'requests'], queryFn: portalApi.requests });
  const goReport = () => router.push('/(customer)/report');

  const all = useMemo(() => q.data ?? [], [q.data]);
  const openList = useMemo(() => all.filter((r) => !CLOSED.test(r.status)), [all]);
  const doneList = useMemo(() => all.filter((r) => CLOSED.test(r.status)), [all]);

  const [filter, setFilter] = useState<Filter>('all');
  const list = filter === 'open' ? openList : filter === 'done' ? doneList : all;

  const FILTERS: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: t('portal.filterAll', 'All'), count: all.length },
    { key: 'open', label: t('portal.filterOpen', 'Open'), count: openList.length },
    { key: 'done', label: t('portal.filterDone', 'Done'), count: doneList.length },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + SPACING.md }}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{t('portal.myRequests', 'My requests')}</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            {t('portal.requestsSubtitle', 'Track everything you’ve reported.')}
          </Text>
        </View>
        <Pressable style={[styles.newBtn, { backgroundColor: COLORS.primary }]} onPress={goReport} hitSlop={8}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.newBtnText}>{t('portal.new', 'New')}</Text>
        </Pressable>
      </View>

      {/* Filter chips */}
      {all.length > 0 ? (
        <View style={styles.filters}>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[
                  styles.chip,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                  active && { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
                ]}
              >
                <Text style={[styles.chipText, { color: active ? '#fff' : colors.textSecondary }]}>
                  {f.label} {f.count > 0 ? `· ${f.count}` : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {q.isLoading ? (
        <ActivityIndicator style={{ marginTop: SPACING.xl }} color={COLORS.primary} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingTop: SPACING.md, paddingBottom: SPACING.xxxl, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={q.refetch} tintColor={COLORS.primary} />}
          renderItem={({ item }) => (
            <RequestRow
              title={item.title}
              reference={item.reference}
              status={item.status}
              icon={item.icon}
              color={item.color}
              onPress={() => router.push(`/(customer)/request/${item.id}`)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.surface }]}>
                <Ionicons name="file-tray-outline" size={30} color={colors.textMuted} />
              </View>
              <Text style={[styles.empty, { color: colors.textMuted }]}>
                {filter === 'all' ? t('portal.noRequestsShort', 'No requests yet.') : t('portal.noneHere', 'Nothing here.')}
              </Text>
              {filter === 'all' ? (
                <Pressable style={[styles.emptyBtn, { backgroundColor: COLORS.primary }]} onPress={goReport}>
                  <Ionicons name="add" size={18} color="#fff" />
                  <Text style={styles.emptyBtnText}>{t('portal.reportIssue', 'Report an issue')}</Text>
                </Pressable>
              ) : null}
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginHorizontal: SPACING.lg },
  title: { fontFamily: 'Outfit_800ExtraBold', fontSize: FONT_SIZE.title },
  subtitle: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.sm, marginTop: 2 },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.full },
  newBtnText: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.sm, color: '#fff' },
  filters: { flexDirection: 'row', gap: SPACING.sm, paddingHorizontal: SPACING.lg, marginTop: SPACING.md },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: RADIUS.full, borderWidth: 1 },
  chipText: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.sm, fontWeight: '600' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: SPACING.xxxl, paddingHorizontal: SPACING.xl, gap: SPACING.md },
  emptyIcon: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  empty: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.base, textAlign: 'center', lineHeight: 20 },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 11, borderRadius: RADIUS.full, marginTop: SPACING.xs },
  emptyBtnText: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.md, color: '#fff' },
});
