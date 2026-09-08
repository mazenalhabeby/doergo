import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, ActivityIndicator, RefreshControl, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { customersApi, locationsApi, type MobileCustomer } from '../../src/lib/api';
import { customerStageLabel } from '@hbcfield/shared/client';
import { useTheme } from '../../src/contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../../src/lib/constants';

const initials = (n: string) => n.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export default function CustomersScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [items, setItems] = useState<MobileCustomer[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [spaces, setSpaces] = useState<{ id: string; name: string }[]>([]);
  const [spaceId, setSpaceId] = useState<string | null>(null); // null = every workspace
  const [capped, setCapped] = useState(false);

  /*
    Which workspaces run CRM.

    Only those are offered: a workspace without the module has no client list to
    show, so a chip for it is a filter that always returns nothing and tells the
    person nothing about why. One request — `GET /locations` already carries
    `enabledModules`, so this costs no extra round trip per workspace.
  */
  useEffect(() => {
    locationsApi.list()
      .then((rows) => setSpaces(
        rows.filter((r) => (r.enabledModules ?? []).includes('crm')).map((r) => ({ id: r.id, name: r.name })),
      ))
      .catch(() => { /* the filter simply does not appear */ });
  }, []);

  const LIMIT = 100;
  const load = useCallback(async (q?: string, space?: string | null) => {
    try {
      const rows = await customersApi.list({
        search: q || undefined,
        spaceId: space || undefined,
        limit: LIMIT,
      });
      setItems(rows);
      // A list that simply stops at a hundred looks like the whole book.
      setCapped(rows.length >= LIMIT);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(undefined, spaceId); }, [load, spaceId]);
  useEffect(() => {
    const tmr = setTimeout(() => load(search, spaceId), 300);
    return () => clearTimeout(tmr);
  }, [search, spaceId, load]);

  // Rows carry a spaceId and no name; this is the only place that can say which.
  const spaceName = useCallback(
    (id?: string | null) => (id ? spaces.find((s) => s.id === id)?.name ?? null : null),
    [spaces],
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.surface }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.hBtn}><Ionicons name="chevron-back" size={24} color={colors.textPrimary} /></TouchableOpacity>
        <Text style={[styles.hTitle, { color: colors.textPrimary }]}>{t('customers.title', 'Customers')}</Text>
        <View style={styles.hBtn} />
      </View>

      <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput value={search} onChangeText={setSearch} placeholder={t('common.search', 'Search…')} placeholderTextColor={colors.textMuted}
          style={{ flex: 1, color: colors.textPrimary, fontSize: FONT_SIZE.sm }} />
      </View>

      {/*
        Narrow to one workspace.

        Shown only when there is more than one to choose between — a single-site
        organization gets a filter with one option, which is a control that
        cannot do anything. "All" includes the clients filed in no workspace at
        all, which in a real book is most of them.
      */}
      {spaces.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          /*
            ⚠️ `flexGrow: 0` is not optional here. A horizontal ScrollView in a
            column is still a flex child: without it the row is squeezed by the
            list below and the chips render with their text sliced off at the
            baseline — which is what shipped the first time.
          */
          style={styles.filterBar}
          contentContainerStyle={styles.filters}
        >
          {[{ id: null as string | null, name: t('customers.allSpaces', 'All workspaces') }, ...spaces].map((sp) => {
            const on = spaceId === sp.id;
            return (
              <TouchableOpacity
                key={sp.id ?? 'all'}
                onPress={() => setSpaceId(sp.id)}
                style={[
                  styles.chip,
                  { borderColor: on ? COLORS.primary : colors.border, backgroundColor: on ? COLORS.primary + '15' : colors.card },
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={{ color: on ? COLORS.primary : colors.textMuted, fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold as any }}
                >
                  {sp.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} /> : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: SPACING.md }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => load(search)} tintColor={COLORS.primary} />}
          ListEmptyComponent={<Text style={{ textAlign: 'center', color: colors.textMuted, marginTop: 40 }}>{t('customers.empty', 'No customers')}</Text>}
          ListFooterComponent={capped ? (
            <Text style={{ textAlign: 'center', color: colors.textMuted, fontSize: FONT_SIZE.xs, paddingVertical: SPACING.lg }}>
              {t('customers.capped', 'Showing the first {{n}}. Search to narrow it down.', { n: 100 })}
            </Text>
          ) : null}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => router.push(`/(app)/customer/${item.id}`)} style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.avatar, { backgroundColor: COLORS.primary }]}><Text style={styles.avatarTxt}>{initials(item.name)}</Text></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: colors.textPrimary, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold as any }} numberOfLines={1}>{item.name}</Text>
                <Text style={{ color: colors.textMuted, fontSize: FONT_SIZE.xs }} numberOfLines={1}>{[customerStageLabel(item.status || 'LEAD'), item.phone || item.email].filter(Boolean).join(' · ')}</Text>
                {/* Which book this client came from. Only meaningful while
                    looking at more than one, and "no workspace" is a real
                    answer worth showing — it is why a client can be missing
                    from every workspace tab. */}
                {spaceId === null && spaces.length > 1 && (
                  <Text style={{ color: colors.textMuted, fontSize: FONT_SIZE.xs, marginTop: 2 }} numberOfLines={1}>
                    {spaceName(item.spaceId) ?? t('customers.noSpace', 'No workspace')}
                  </Text>
                )}
              </View>
              {item.isPortalResident && <Ionicons name="phone-portrait" size={16} color="#16a34a" />}
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  hBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  filterBar: { flexGrow: 0, flexShrink: 0 },
  filters: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm, gap: SPACING.sm, alignItems: 'center' },
  chip: {
    paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full, borderWidth: 1, maxWidth: 180,
    // A chip is a target, not a label.
    minHeight: 34, justifyContent: 'center',
  },
  hTitle: { flex: 1, textAlign: 'center', fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold as any },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: SPACING.md, marginBottom: 0, paddingHorizontal: 12, borderWidth: 1, borderRadius: RADIUS.md, height: 42 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.sm, marginBottom: 8 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#fff', fontSize: FONT_SIZE.sm, fontWeight: '700' },
});
