import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { customersApi, type MobileCustomer } from '../../src/lib/api';
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

  const load = useCallback(async (q?: string) => {
    try { setItems(await customersApi.list({ search: q || undefined })); } catch { /* ignore */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const tmr = setTimeout(() => load(search), 300); return () => clearTimeout(tmr); }, [search, load]);

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

      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} /> : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: SPACING.md }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => load(search)} tintColor={COLORS.primary} />}
          ListEmptyComponent={<Text style={{ textAlign: 'center', color: colors.textMuted, marginTop: 40 }}>{t('customers.empty', 'No customers')}</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => router.push(`/(app)/customer/${item.id}`)} style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.avatar, { backgroundColor: COLORS.primary }]}><Text style={styles.avatarTxt}>{initials(item.name)}</Text></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: colors.textPrimary, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold as any }} numberOfLines={1}>{item.name}</Text>
                <Text style={{ color: colors.textMuted, fontSize: FONT_SIZE.xs }} numberOfLines={1}>{[customerStageLabel(item.status || 'LEAD'), item.phone || item.email].filter(Boolean).join(' · ')}</Text>
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
  hTitle: { flex: 1, textAlign: 'center', fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold as any },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: SPACING.md, marginBottom: 0, paddingHorizontal: 12, borderWidth: 1, borderRadius: RADIUS.md, height: 42 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.sm, marginBottom: 8 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#fff', fontSize: FONT_SIZE.sm, fontWeight: '700' },
});
