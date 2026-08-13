import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator,
  TextInput, Linking, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { customersApi, type MobileCustomer, type MobileCustomerActivity } from '../../../src/lib/api';
import { CUSTOMER_STAGES, customerStageLabel } from '@hbcfield/shared/client';
import { useTheme } from '../../../src/contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../../../src/lib/constants';

const initials = (n: string) => n.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const STAGE_DOT: Record<string, string> = { LEAD: '#94a3b8', CONTACTED: '#3b82f6', QUALIFIED: '#8b5cf6', CUSTOMER: '#16a34a', INACTIVE: '#9ca3af' };
const ACT_ICON: Record<string, any> = { NOTE: 'document-text', CALL: 'call', EMAIL: 'mail', MEETING: 'people', REMINDER: 'alarm', STATUS: 'sync', SYSTEM: 'settings' };
const COMPOSER = [
  { type: 'NOTE', label: 'Note', icon: 'document-text' },
  { type: 'CALL', label: 'Call', icon: 'call' },
  { type: 'REMINDER', label: 'Reminder', icon: 'alarm' },
] as const;
const relTime = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'now'; if (s < 3600) return `${Math.floor(s / 60)}m`; if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`; return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
const DUE = [{ k: 'today', h: 8 }, { k: 'tomorrow', h: 32 }, { k: 'week', h: 24 * 7 }];

export default function CustomerRecordScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [customer, setCustomer] = useState<MobileCustomer | null>(null);
  const [activities, setActivities] = useState<MobileCustomerActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState('NOTE');
  const [body, setBody] = useState('');
  const [due, setDue] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, acts] = await Promise.all([customersApi.get(id), customersApi.activities(id)]);
      setCustomer(c); setActivities(acts);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!body.trim() && type !== 'REMINDER') return;
    setSaving(true);
    try {
      let dueAt: string | undefined;
      if (type === 'REMINDER' && due) { const opt = DUE.find((d) => d.k === due); if (opt) dueAt = new Date(Date.now() + opt.h * 3600_000).toISOString(); }
      await customersApi.addActivity(id, { type, body: body.trim() || undefined, dueAt });
      setBody(''); setDue(null); await load();
    } catch { /* ignore */ } finally { setSaving(false); }
  };
  const setStage = async (s: string) => { if (!customer) return; setCustomer({ ...customer, status: s }); try { await customersApi.update(id, { status: s }); load(); } catch { /* ignore */ } };
  const toggleDone = async (a: MobileCustomerActivity) => { try { await customersApi.updateActivity(id, a.id, { done: !a.doneAt }); load(); } catch { /* ignore */ } };

  if (loading) return <SafeAreaView style={[styles.safe, { backgroundColor: colors.surface }]}><ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} /></SafeAreaView>;
  if (!customer) return <SafeAreaView style={[styles.safe, { backgroundColor: colors.surface }]}><Text style={{ textAlign: 'center', marginTop: 40, color: colors.textMuted }}>Not found</Text></SafeAreaView>;

  const status = customer.status || 'LEAD';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.surface }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.hBtn}><Ionicons name="chevron-back" size={24} color={colors.textPrimary} /></TouchableOpacity>
        <Text style={[styles.hTitle, { color: colors.textPrimary }]} numberOfLines={1}>{customer.name}</Text>
        <View style={styles.hBtn} />
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.md, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={COLORS.primary} />}>
        {/* Identity */}
        <View style={styles.idRow}>
          <View style={[styles.avatar, { backgroundColor: COLORS.primary }]}><Text style={styles.avatarTxt}>{initials(customer.name)}</Text></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.name, { color: colors.textPrimary }]}>{customer.name}</Text>
            {customer.isPortalResident && <Text style={styles.appAccess}>📱 {t('customers.appAccess', 'App access')}</Text>}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {!!customer.phone && <TouchableOpacity onPress={() => Linking.openURL(`tel:${customer.phone}`)} style={styles.actBtn}><Ionicons name="call" size={18} color={COLORS.primary} /></TouchableOpacity>}
            {!!customer.email && <TouchableOpacity onPress={() => Linking.openURL(`mailto:${customer.email}`)} style={styles.actBtn}><Ionicons name="mail" size={18} color={COLORS.primary} /></TouchableOpacity>}
          </View>
        </View>

        {/* Stage pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: SPACING.md }} contentContainerStyle={{ gap: 8 }}>
          {CUSTOMER_STAGES.map((s) => (
            <TouchableOpacity key={s.key} onPress={() => setStage(s.key)}
              style={[styles.stagePill, { borderColor: status === s.key ? COLORS.primary : colors.border, backgroundColor: status === s.key ? COLORS.primary + '20' : 'transparent' }]}>
              <View style={[styles.dot, { backgroundColor: STAGE_DOT[s.key] }]} />
              <Text style={{ fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.medium as any, color: status === s.key ? COLORS.primary : colors.textMuted }}>{customerStageLabel(s.key)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Composer */}
        <View style={[styles.composer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
            {COMPOSER.map((c) => (
              <TouchableOpacity key={c.type} onPress={() => setType(c.type)}
                style={[styles.typePill, { backgroundColor: type === c.type ? COLORS.primary + '20' : colors.surface }]}>
                <Ionicons name={c.icon as any} size={14} color={type === c.type ? COLORS.primary : colors.textMuted} />
                <Text style={{ fontSize: FONT_SIZE.xs, color: type === c.type ? COLORS.primary : colors.textMuted, fontWeight: '600' }}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput value={body} onChangeText={setBody} multiline placeholder={type === 'REMINDER' ? 'What to follow up on…' : 'Write a note…'}
            placeholderTextColor={colors.textMuted} style={{ color: colors.textPrimary, fontSize: FONT_SIZE.sm, minHeight: 40 }} />
          {type === 'REMINDER' && (
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
              {DUE.map((d) => (
                <TouchableOpacity key={d.k} onPress={() => setDue(d.k)} style={[styles.duePill, { borderColor: due === d.k ? COLORS.primary : colors.border }]}>
                  <Text style={{ fontSize: FONT_SIZE.xs, color: due === d.k ? COLORS.primary : colors.textMuted }}>{d.k === 'today' ? 'Today' : d.k === 'tomorrow' ? 'Tomorrow' : 'Next week'}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <TouchableOpacity onPress={add} disabled={saving} style={[styles.addBtn, { backgroundColor: COLORS.primary }]}>
            {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.addTxt}>Add</Text>}
          </TouchableOpacity>
        </View>

        {/* Timeline */}
        <Text style={[styles.section, { color: colors.textMuted }]}>Activity</Text>
        {activities.length === 0 ? (
          <Text style={{ textAlign: 'center', color: colors.textMuted, fontSize: FONT_SIZE.sm, paddingVertical: 24 }}>No activity yet.</Text>
        ) : activities.map((a) => {
          const overdue = a.type === 'REMINDER' && a.dueAt && !a.doneAt && new Date(a.dueAt).getTime() < Date.now();
          return (
            <View key={a.id} style={[styles.actItem, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name={ACT_ICON[a.type] as any} size={16} color={overdue ? '#dc2626' : COLORS.primary} style={{ marginTop: 2 }} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: FONT_SIZE.xs, color: colors.textMuted }}>
                  {a.type === 'STATUS' ? `Stage: ${customerStageLabel(a.metadata?.from || '')} → ${customerStageLabel(a.metadata?.to || '')}` : a.type}
                  {a.author ? ` · ${a.author.firstName}` : ''} · {relTime(a.createdAt)}
                </Text>
                {!!a.body && <Text style={{ color: colors.textPrimary, fontSize: FONT_SIZE.sm, marginTop: 2 }}>{a.body}</Text>}
                {a.type === 'REMINDER' && (
                  <TouchableOpacity onPress={() => toggleDone(a)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <Ionicons name={a.doneAt ? 'checkbox' : 'square-outline'} size={16} color={a.doneAt ? '#16a34a' : overdue ? '#dc2626' : '#d97706'} />
                    <Text style={{ fontSize: FONT_SIZE.xs, color: a.doneAt ? '#16a34a' : overdue ? '#dc2626' : '#d97706' }}>{a.doneAt ? 'Done' : a.dueAt ? `Due ${new Date(a.dueAt).toLocaleDateString()}` : 'Reminder'}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  hBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  hTitle: { flex: 1, textAlign: 'center', fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold as any },
  idRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#fff', fontSize: FONT_SIZE.md, fontWeight: '700' },
  name: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold as any },
  appAccess: { color: '#16a34a', fontSize: FONT_SIZE.xs, fontWeight: '600', marginTop: 2 },
  actBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: COLORS.primary + '15', alignItems: 'center', justifyContent: 'center' },
  stagePill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  composer: { borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.sm, marginTop: SPACING.md },
  typePill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  duePill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  addBtn: { alignSelf: 'flex-end', marginTop: 8, borderRadius: 8, paddingHorizontal: 18, paddingVertical: 8 },
  addTxt: { color: '#fff', fontSize: FONT_SIZE.sm, fontWeight: '600' },
  section: { fontSize: FONT_SIZE.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: SPACING.lg, marginBottom: SPACING.sm },
  actItem: { flexDirection: 'row', gap: 10, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.sm, marginBottom: 8 },
});
