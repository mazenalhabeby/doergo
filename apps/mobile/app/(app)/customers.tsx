import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, ActivityIndicator, RefreshControl, ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { SheetPanel } from '../../src/components/sheet-panel';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '../../src/components';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { customersApi, locationsApi, type MobileCustomer } from '../../src/lib/api';
import { useAuth } from '../../src/contexts/auth-context';
import { holds } from '../../src/lib/permissions';
import { BlurSheet } from '../../src/components/blur-sheet';
import { canScanCards } from '../../src/lib/card-scan';
import { useToast } from '../../src/contexts/toast-context';
import { customerStageLabel } from '@hbcfield/shared/client';
import { useTheme } from '../../src/contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../../src/lib/constants';

const initials = (n: string) => n.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export default function CustomersScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [items, setItems] = useState<MobileCustomer[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [spaces, setSpaces] = useState<{ id: string; name: string }[]>([]);
  const [spaceId, setSpaceId] = useState<string | null>(null); // null = every workspace
  const [capped, setCapped] = useState(false);
  const { user } = useAuth();
  const toast = useToast();

  /*
    May this person add a client?

    `crmCreateClients` — deliberately not `crmManageClients`, which also covers
    deleting and reassigning somebody else's client. A rep holding a business
    card should be able to enter it without either. The server asks the same
    question, so the button never offers something the save would refuse.
  */
  const canAdd = holds(user, 'crmCreateClients') || holds(user, 'crmManageClients');
  /*
    ⚠️ ONE sheet, two states — not two sheets.

    BlurSheet is a Modal, and it stays mounted for 250ms while it animates out.
    Closing one and opening another in the same tick therefore leaves two
    modals mounted at once, and iOS will not present a modal while another is
    dismissing: the second never appears and its invisible backdrop swallows
    every touch. The app looks frozen, which is exactly what it did.

    Switching content inside a single sheet cannot hit that at all.
  */
  const [sheet, setSheet] = useState<'none' | 'choose' | 'form'>('none');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', contactName: '', email: '', phone: '' });
  const [formSpaceId, setFormSpaceId] = useState<string | null>(null);


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

  const submit = useCallback(async () => {
    const name = form.name.trim();
    if (!name) return;
    setSaving(true);
    try {
      await customersApi.create({
        name,
        contactName: form.contactName.trim() || undefined,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        // Whatever workspace is being viewed, so the client lands where the
        // person is looking rather than nowhere.
        spaceId: formSpaceId ?? undefined,
      });
      setSheet('none');
      setForm({ name: '', contactName: '', email: '', phone: '' });
      toast.success(t('customers.added', 'Client added'));
      load(search, spaceId);
    } catch (e: any) {
      toast.error(e?.message || t('customers.addFailed', 'Could not add the client'));
    } finally {
      setSaving(false);
    }
  }, [form, formSpaceId, load, search, spaceId, t, toast]);

  // Rows carry a spaceId and no name; this is the only place that can say which.
  const spaceName = useCallback(
    (id?: string | null) => (id ? spaces.find((s) => s.id === id)?.name ?? null : null),
    [spaces],
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.surface }]} edges={['top']}>
      <ScreenHeader title={t('customers.title', 'Customers')} />

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
          /*
            ⚠️ The screen is inset at the TOP only, on purpose: the list
            should scroll under the home indicator / Android nav bar
            rather than stop above it. That makes clearing the bar the
            content's job — both here and on the button that floats over
            it, which otherwise sits half behind the three nav keys.
            FAB_CLEARANCE keeps the last row reachable above the button.
          */
          contentContainerStyle={{ padding: SPACING.md, paddingBottom: SPACING.md + FAB_CLEARANCE + insets.bottom }}
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
              {/*
                "This client has the app." It was a filled phone glyph at 16px,
                which at that size is a green rounded rectangle — a battery, and
                read as one. A marker that needs explaining is not working, so it
                carries its word.
              */}
              {item.isPortalResident && (
                <View style={[styles.appTag, { borderColor: '#16a34a' }]}>
                  <Text style={styles.appTagText}>{t('customers.hasApp', 'App')}</Text>
                </View>
              )}
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        />
      )}

      {/*
        Adding a client. The button is absent — not disabled — for anyone
        without the permission: a control that exists only to refuse is worse
        than no control.
      */}
      {canAdd && (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: COLORS.primary, bottom: SPACING.xl + insets.bottom }]}
          onPress={() => { setFormSpaceId(spaceId); setSheet('choose'); }}
          accessibilityRole="button"
          accessibilityLabel={t('customers.add', 'Add client')}
        >
          <Ionicons name="add" size={26} color="#fff" />
        </TouchableOpacity>
      )}

      <BlurSheet visible={sheet !== 'none'} onClose={() => setSheet('none')}>
        {/*
          Surface, handle and the safe bottom come from SheetPanel. Hand-drawn
          here it had a flat foot, so on Android the save button sat behind the
          navigation keys. No title prop: each branch names itself, because
          "Add client" and the form are two steps of one sheet.
        */}
        <SheetPanel onClose={() => setSheet('none')} style={styles.addSheet}>

          {sheet === 'choose' ? (
            <>
              {/*
                Scan or type. Scanning is an accelerator, never the only door —
                a bent card, a phone call, or no card at all still has to work.
              */}
              <Text style={[styles.addTitle, { color: colors.textPrimary }]}>{t('customers.add', 'Add client')}</Text>

              {/* Hidden on a build without the reader — see canScanCards. */}
              {canScanCards() && (
                <TouchableOpacity
                  style={[styles.choice, { borderColor: colors.border }]}
                  onPress={() => {
                    setSheet('none');
                    /*
                      Push AFTER the sheet has left.

                      Same conflict that froze "Enter details", one step along:
                      pushing a screen while a modal is dismissing races the
                      same presentation the sheet is still using. The camera
                      would arrive underneath a backdrop that is on its way out.
                      280ms is the sheet's exit plus a frame.
                    */
                    setTimeout(() => router.push('/(app)/scan-card' as any), 280);
                  }}
                >
                  <View style={[styles.choiceIcon, { backgroundColor: COLORS.primary + '22' }]}>
                    <Ionicons name="scan" size={20} color={COLORS.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.choiceTitle, { color: colors.textPrimary }]}>{t('customers.scanCard', 'Scan a business card')}</Text>
                    <Text style={[styles.choiceSub, { color: colors.textMuted }]}>{t('customers.scanCardSub', 'Fills the form for you')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.choice, { borderColor: colors.border }]}
                onPress={() => setSheet('form')}
              >
                <View style={[styles.choiceIcon, { backgroundColor: 'rgba(139,147,167,.18)' }]}>
                  <Ionicons name="create-outline" size={20} color={colors.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.choiceTitle, { color: colors.textPrimary }]}>{t('customers.enterDetails', 'Enter details')}</Text>
                  <Text style={[styles.choiceSub, { color: colors.textMuted }]}>{t('customers.enterDetailsSub', 'Type it in')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </>
          ) : (
            /*
              Scrollable: SheetPanel caps the sheet at a share of the screen, and
              with the keyboard up this form is taller than what is left. Without
              it the save button is the thing that gets clipped.
            */
            <ScrollView
              /*
                ⚠️ `flexShrink: 1` is what makes it scroll. RN defaults children
                to flexShrink: 0, so inside SheetPanel's clamped height the list
                keeps its full content height and is simply cut off instead.
              */
              style={{ flexShrink: 1 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={[styles.addTitle, { color: colors.textPrimary }]}>
                {t('customers.add', 'Add client')}
              </Text>

              {[
                { k: 'name' as const, label: t('customers.fName', 'Name'), ph: 'Siemens AG', req: true },
                { k: 'contactName' as const, label: t('customers.fContact', 'Contact person'), ph: 'Anna Gruber' },
                { k: 'email' as const, label: t('customers.fEmail', 'Email'), ph: 'a.gruber@siemens.com' },
                { k: 'phone' as const, label: t('customers.fPhone', 'Phone'), ph: '+43 1 234 5601' },
              ].map((f) => (
                <View key={f.k} style={styles.field}>
                  <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>
                    {f.label}{f.req ? ' *' : ''}
                  </Text>
                  <TextInput
                    value={form[f.k]}
                    onChangeText={(v) => setForm((p) => ({ ...p, [f.k]: v }))}
                    placeholder={f.ph}
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize={f.k === 'email' ? 'none' : 'words'}
                    keyboardType={f.k === 'email' ? 'email-address' : f.k === 'phone' ? 'phone-pad' : 'default'}
                    style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
                  />
                </View>
              ))}

              {/* Where it lands. A client filed in no workspace is invisible in
                  every workspace tab, so this is not an afterthought. */}
              {spaces.length > 0 && (
                <View style={styles.field}>
                  <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>
                    {t('customers.fWorkspace', 'Workspace')}
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
                    <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                      {[{ id: null as string | null, name: t('customers.noSpace', 'No workspace') }, ...spaces].map((sp) => {
                        const on = formSpaceId === sp.id;
                        return (
                          <TouchableOpacity
                            key={sp.id ?? 'none'}
                            onPress={() => setFormSpaceId(sp.id)}
                            style={[styles.chip, { borderColor: on ? COLORS.primary : colors.border, backgroundColor: on ? COLORS.primary + '15' : 'transparent' }]}
                          >
                            <Text style={{ color: on ? COLORS.primary : colors.textMuted, fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold as any }}>
                              {sp.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>
              )}

              <TouchableOpacity
                onPress={submit}
                disabled={saving || !form.name.trim()}
                style={[styles.saveBtn, { backgroundColor: form.name.trim() ? COLORS.primary : colors.border }]}
              >
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.saveText}>{t('customers.save', 'Save client')}</Text>}
              </TouchableOpacity>
            </ScrollView>
          )}
        </SheetPanel>
      </BlurSheet>
    </SafeAreaView>
  );
}

/** The floating add button, plus the gap that keeps it off the last row. */
const FAB_SIZE = 56;
const FAB_CLEARANCE = FAB_SIZE + SPACING.xl;

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  // `searchBar` deliberately ends with marginBottom: 0, so the separation
  // between the field and the filters belongs here.
  filterBar: { flexGrow: 0, flexShrink: 0, marginTop: SPACING.md },
  filters: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.md, gap: SPACING.sm, alignItems: 'center' },
  chip: {
    paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full, borderWidth: 1, maxWidth: 180,
    // A chip is a target, not a label.
    minHeight: 34, justifyContent: 'center',
  },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: SPACING.md, marginBottom: 0, paddingHorizontal: 12, borderWidth: 1, borderRadius: RADIUS.md, height: 42 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.sm, marginBottom: 8 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#fff', fontSize: FONT_SIZE.sm, fontWeight: '700' },
  fab: {
    // `bottom` is set inline — it carries the safe-area inset.
    position: 'absolute', right: SPACING.lg,
    width: FAB_SIZE, height: FAB_SIZE, borderRadius: FAB_SIZE / 2,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  addSheet: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md },
  addTitle: { fontSize: FONT_SIZE.xxl, fontWeight: '700', marginBottom: SPACING.md },
  field: { marginBottom: SPACING.md },
  fieldLabel: { fontSize: FONT_SIZE.xs, marginBottom: 5 },
  input: { borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, height: 44, fontSize: FONT_SIZE.sm },
  saveBtn: { borderRadius: RADIUS.md, height: 48, alignItems: 'center', justifyContent: 'center', marginTop: SPACING.sm },
  saveText: { color: '#fff', fontSize: FONT_SIZE.lg, fontWeight: '700' },
  choice: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm },
  choiceIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  choiceTitle: { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold as any },
  choiceSub: { fontSize: FONT_SIZE.xs, marginTop: 1 },
  appTag: { borderWidth: 1, borderRadius: RADIUS.full, paddingHorizontal: SPACING.sm, paddingVertical: 2 },
  appTagText: { color: '#16a34a', fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
});
