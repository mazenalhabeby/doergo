import { memo, useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, ActivityIndicator, RefreshControl, ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { SheetPanel } from '../../src/components/sheet-panel';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader, ChipRow, FilterChip, PressableScale, Skeleton } from '../../src/components';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { customersApi, locationsApi, type MobileCustomer } from '../../src/lib/api';
import { useAuth } from '../../src/contexts/auth-context';
import { holds } from '../../src/lib/permissions';
import { BlurSheet } from '../../src/components/blur-sheet';
import { canScanCards } from '../../src/lib/card-scan';
import { useToast } from '../../src/contexts/toast-context';
import { useQueuedCreate } from '../../src/offline/actions/queued-create';
import { CLIENT_LOCALE_OPTIONS, newClientInput } from '../../src/lib/client-locale';
import {
  customerStageLabel,
  CLIENT_FILTERS, CLIENT_FILTER_KEYS, clientFilterQuery, isCompany,
  type ClientFilter,
} from '@hbcfield/shared/client';
import { useTheme } from '../../src/contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOWS } from '../../src/lib/constants';

const initials = (n: string) => n.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

/**
 * One page of the client book.
 *
 * 40, not 100: a page is what somebody reads before their thumb reaches the
 * bottom, and the next one arrives before they get there. The old screen asked
 * for a hundred and then told the reader it had stopped at a hundred — which is
 * an apology, not a list.
 */
const PAGE_SIZE = 40;

/** The search field waits this long after the last keystroke. */
const SEARCH_DEBOUNCE_MS = 300;

/** Hoisted, so FlatList is not handed a new function on every render. */
const keyOf = (c: MobileCustomer) => c.id;

/**
 * One client in the book.
 *
 * Memoized and given only primitives plus a stable `onPress`, because appending
 * a page re-renders the list and every row in it otherwise redraws — which on a
 * long book is the difference between paging that feels instant and a visible
 * stutter at every page boundary.
 */
const ClientRow = memo(function ClientRow({
  client, spaceLabel, contactLabel, appLabel, onPress,
}: {
  client: MobileCustomer;
  /** Which workspace it is filed in, or null when the line is not worth drawing. */
  spaceLabel: string | null;
  contactLabel: string;
  appLabel: string;
  onPress: (id: string) => void;
}) {
  const { colors } = useTheme();
  const company = isCompany(client);
  /*
    A contact is somebody else's person sitting in a list of your clients —
    still readable, plainly not the same thing. Dimming the whole row says that
    before a word is read; the pill says which word.
  */
  const contact = client.isContact === true;

  return (
    <PressableScale
      onPress={() => onPress(client.id)}
      accessibilityRole="button"
      accessibilityLabel={client.name}
      style={[
        styles.row,
        SHADOWS.sm,
        { backgroundColor: colors.card, borderColor: colors.border },
        contact && styles.rowMuted,
      ]}
    >
      {/*
        ⚠️ Square for a company, round for a person — the SHAPE carries it, and
        the colour is the same one either way. The same shape language as the
        web's client list, so somebody who learns it at a desk already knows it
        on a phone. A second hue would be a second thing to learn, and this
        product does not use multi-colour icons.
      */}
      <View style={[company ? styles.avatarSquare : styles.avatar, { backgroundColor: COLORS.primary }]}>
        {company
          ? <Ionicons name="business" size={19} color="#fff" />
          : <Text style={styles.avatarTxt}>{initials(client.name)}</Text>}
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: colors.textPrimary, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold as any }} numberOfLines={1}>
          {client.name}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: FONT_SIZE.xs }} numberOfLines={1}>
          {[customerStageLabel(client.status || 'LEAD'), client.phone || client.email].filter(Boolean).join(' · ')}
        </Text>
        {spaceLabel && (
          <Text style={{ color: colors.textMuted, fontSize: FONT_SIZE.xs, marginTop: 2 }} numberOfLines={1}>
            {spaceLabel}
          </Text>
        )}
      </View>

      {/*
        "This client has the app." It was a filled phone glyph at 16px, which at
        that size is a green rounded rectangle — a battery, and read as one. A
        marker that needs explaining is not working, so it carries its word.

        One tag at a time: a portal resident is never a contact, and two pills
        on a narrow row squeeze the name they are meant to qualify.
      */}
      {client.isPortalResident ? (
        <View style={[styles.appTag, { borderColor: '#16a34a' }]}>
          <Text style={styles.appTagText}>{appLabel}</Text>
        </View>
      ) : contact ? (
        <View style={[styles.appTag, { borderColor: colors.border }]}>
          <Text style={[styles.appTagText, { color: colors.textMuted }]}>{contactLabel}</Text>
        </View>
      ) : null}
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </PressableScale>
  );
});

export default function CustomersScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [items, setItems] = useState<MobileCustomer[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [spaces, setSpaces] = useState<{ id: string; name: string }[]>([]);
  const [spaceId, setSpaceId] = useState<string | null>(null); // null = every workspace
  const [filter, setFilter] = useState<ClientFilter>('all');
  const { user } = useAuth();
  const toast = useToast();
  // A client added with no signal waits in the outbox and is sent when there is one.
  const clientCreate = useQueuedCreate('customer.create');

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
  // "" = same as the organization; sent as null (see newClientInput).
  const [formLocale, setFormLocale] = useState('');


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

  /*
    What the three controls mean to the server, in ONE place.

    The kind filter is `clientFilterQuery()` in shared and nothing else — a
    hand-written `type: 'COMPANY'` at a call site is how the phone and the web
    end up meaning different things by "Companies".

    ⚠️ `includeUnfiled` goes with a named workspace, always. A client filed in
    NO workspace is invisible to a strict space filter, and in a real book most
    of them are — scoping strictly is what made the web's client picker come up
    empty. The row says which workspace a client is in (or that it is in none),
    so nothing appears here without an explanation on it.
  */
  const queryFor = useCallback(
    (q: string, space: string | null, f: ClientFilter, page: number) => ({
      search: q.trim() || undefined,
      spaceId: space || undefined,
      includeUnfiled: space ? true : undefined,
      ...clientFilterQuery(f),
      page,
      limit: PAGE_SIZE,
    }),
    [],
  );

  /*
    Which query the rows on screen belong to.

    Every first-page load claims a new number. A page-2 answer that arrives
    after the reader has changed the filter carries the OLD number and is
    dropped — otherwise "Companies" quietly gains a page of people, and the
    count of what is on screen stops matching what was asked for. It also stops
    `loadMore` from firing against a list that is being replaced.
  */
  const queryId = useRef(0);
  /** The page already on screen, and whether the server has run out. */
  const paging = useRef({ page: 1, done: false });

  const load = useCallback(
    async (q: string, space: string | null, f: ClientFilter, mode: 'first' | 'refresh') => {
      const id = ++queryId.current;
      paging.current = { page: 1, done: false };
      if (mode === 'first') setLoading(true); else setRefreshing(true);
      try {
        const rows = await customersApi.list(queryFor(q, space, f, 1));
        if (id !== queryId.current) return; // a newer query has taken over
        setItems(rows);
        paging.current = { page: 1, done: rows.length < PAGE_SIZE };
      } catch {
        // A failed list is not worth a toast — pull-to-refresh is right there,
        // and the offline layer already says when there is no signal.
        if (id === queryId.current) paging.current.done = true;
      } finally {
        if (id === queryId.current) { setLoading(false); setRefreshing(false); }
      }
    },
    [queryFor],
  );

  /*
    The next page, appended.

    Three guards, each for a real double-fetch: FlatList fires `onEndReached`
    more than once per rest position, a first page may still be in flight when
    the list is short enough to be at its own end, and a server that has run out
    must not be asked again on every scroll.
  */
  const loadMore = useCallback(async () => {
    if (loadingMore || loading || refreshing || paging.current.done) return;
    const id = queryId.current;
    const next = paging.current.page + 1;
    setLoadingMore(true);
    try {
      const rows = await customersApi.list(queryFor(search, spaceId, filter, next));
      if (id !== queryId.current) return;
      setItems((prev) => [...prev, ...rows]);
      paging.current = { page: next, done: rows.length < PAGE_SIZE };
    } catch {
      if (id === queryId.current) paging.current.done = true;
    } finally {
      if (id === queryId.current) setLoadingMore(false);
    }
  }, [loadingMore, loading, refreshing, queryFor, search, spaceId, filter]);

  /*
    One effect for all three controls — the screen used to have two, so it
    fetched twice on mount and raced its own answers.

    The 300ms wait is the SEARCH FIELD's, and only its: a chip is a decision
    already made, and making somebody watch a third of a second of nothing after
    tapping "Companies" reads as a stuck screen.
  */
  const lastSearch = useRef(search);
  useEffect(() => {
    const typing = search !== lastSearch.current;
    lastSearch.current = search;
    const tmr = setTimeout(() => load(search, spaceId, filter, 'first'), typing ? SEARCH_DEBOUNCE_MS : 0);
    return () => clearTimeout(tmr);
  }, [search, spaceId, filter, load]);

  /*
    ⚠️ Refresh re-asks the CURRENT question. It used to call `load(search)` and
    drop the workspace, so pulling down on a filtered list silently reverted it
    to every workspace while the chip stayed lit — the list disagreed with the
    controls above it and nothing on screen said why.
  */
  const refresh = useCallback(
    () => load(search, spaceId, filter, 'refresh'),
    [load, search, spaceId, filter],
  );

  const submit = useCallback(async () => {
    // Whatever workspace is being viewed, so the client lands where the person
    // is looking rather than nowhere. ONE body for the direct save and the
    // outbox, so the language cannot reach one and not the other.
    const input = newClientInput(form, formSpaceId, formLocale);
    if (!input) return;
    setSaving(true);
    try {
      const outcome = await clientCreate.run({ lane: 'crm:new', body: input }, () => customersApi.create(input));
      if (outcome.kind === 'refused') {
        toast.error((outcome.code && t(`offline.errors.${outcome.code}`, { defaultValue: '' })) || outcome.message || t('customers.addFailed', 'Could not add the client'));
        return;
      }
      setSheet('none');
      setForm({ name: '', contactName: '', email: '', phone: '' });
      setFormLocale('');
      toast.success(outcome.kind === 'queued' ? t('offline.savedForLater') : t('customers.added', 'Client added'));
      refresh();
    } catch (e: any) {
      toast.error(e?.message || t('customers.addFailed', 'Could not add the client'));
    } finally {
      setSaving(false);
    }
  }, [form, formSpaceId, formLocale, refresh, t, toast, clientCreate]);

  // Rows carry a spaceId and no name; this is the only place that can say which.
  const spaceName = useCallback(
    (id?: string | null) => (id ? spaces.find((s) => s.id === id)?.name ?? null : null),
    [spaces],
  );

  /*
    Stable across renders, so a memoized row is not re-rendered by the act of
    scrolling. A `() => router.push(...)` written in `renderItem` is a new
    function on every pass and defeats the memo entirely.
  */
  const openClient = useCallback((id: string) => router.push(`/(app)/customer/${id}`), []);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.surface }]} edges={['top']}>
      <ScreenHeader title={t('customers.title', 'Customers')} />

      <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput value={search} onChangeText={setSearch} placeholder={t('common.search', 'Search…')} placeholderTextColor={colors.textMuted}
          style={{ flex: 1, color: colors.textPrimary, fontSize: FONT_SIZE.sm }} />
      </View>

      {/*
        What KIND of record — companies, people, or the contacts who are neither.

        Always shown, unlike the workspace row: every book has all four answers
        in it, and "Contacts" is the only way to reach records the server hides
        by default (a contact is a person who works somewhere, not a client, and
        `contacts: 'exclude'` is the default in customers.service).

        The labels come from CLIENT_FILTER_KEYS and the parameters from
        `clientFilterQuery()` — the phone writes neither.
      */}
      <ChipRow fadeColor={colors.surface} style={styles.filterBar}>
        {CLIENT_FILTERS.map((f) => (
          <FilterChip
            key={f}
            label={t(CLIENT_FILTER_KEYS[f])}
            active={filter === f}
            onPress={() => setFilter(f)}
          />
        ))}
      </ChipRow>

      {/*
        Narrow to one workspace.

        Shown only when there is more than one to choose between — a single-site
        organization gets a filter with one option, which is a control that
        cannot do anything. "All" includes the clients filed in no workspace at
        all, which in a real book is most of them; so does a named workspace,
        which is what `includeUnfiled` is for, and those rows say so.
      */}
      {spaces.length > 1 && (
        <ChipRow fadeColor={colors.surface} style={styles.spaceBar}>
          {[{ id: null as string | null, name: t('customers.allSpaces', 'All workspaces') }, ...spaces].map((sp) => (
            <FilterChip
              key={sp.id ?? 'all'}
              label={sp.name}
              active={spaceId === sp.id}
              onPress={() => setSpaceId(sp.id)}
            />
          ))}
        </ChipRow>
      )}

      {loading ? (
        /*
          A skeleton, not a spinner. The list's shape is known before its
          contents are, so showing it means the screen does not jump when the
          answer lands — and a spinner in the middle of an empty screen is
          indistinguishable from a screen that is broken.
        */
        <View style={styles.listPad}>
          {Array.from({ length: 6 }).map((_, i) => <Skeleton.Card key={i} height={66} />)}
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={keyOf}
          /*
            ⚠️ The screen is inset at the TOP only, on purpose: the list
            should scroll under the home indicator / Android nav bar
            rather than stop above it. That makes clearing the bar the
            content's job — both here and on the button that floats over
            it, which otherwise sits half behind the three nav keys.
            FAB_CLEARANCE keeps the last row reachable above the button.
          */
          contentContainerStyle={{ padding: SPACING.md, paddingBottom: SPACING.md + FAB_CLEARANCE + insets.bottom }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={COLORS.primary} />}
          /*
            0.4 of a screen, not 0.1: the next page has to arrive before the
            thumb gets to the bottom, or paging is just a pause with a spinner
            in it. `loadMore` refuses a second call itself, so an early fire
            costs nothing.
          */
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.textMuted }]}>
              {search.trim() || filter !== 'all' || spaceId
                ? t('customers.list.emptyFiltered', 'No clients match what you are looking for.')
                : t('customers.empty', 'No customers')}
            </Text>
          }
          ListFooterComponent={
            loadingMore
              ? <ActivityIndicator style={{ marginVertical: SPACING.lg }} color={COLORS.primary} />
              : null
          }
          renderItem={({ item }) => (
            <ClientRow
              client={item}
              /*
                Which book this client came from. Worth a line when looking at
                more than one workspace, and ALWAYS for a client filed in none —
                under a named workspace those are the rows whose presence would
                otherwise need explaining, since `includeUnfiled` is what brought
                them here.
              */
              spaceLabel={
                spaces.length > 1 && (spaceId === null || !item.spaceId)
                  ? spaceName(item.spaceId) ?? t('customers.noSpace', 'No workspace')
                  : null
              }
              contactLabel={t('customers.list.contactTag', 'Contact')}
              appLabel={t('customers.hasApp', 'App')}
              onPress={openClient}
            />
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

                      ⚠️ The workspace travels with it. A scanned client used to
                      be created with no `spaceId` at all, so it landed filed in
                      nothing and was invisible in every workspace tab — the same
                      bug the typed form was fixed for, still live on the road
                      where most cards are actually scanned.
                    */
                    const target = formSpaceId;
                    setTimeout(
                      () => router.push({ pathname: '/(app)/scan-card', params: target ? { spaceId: target } : {} } as any),
                      280,
                    );
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

              {/*
                Which language the emails to this client are written in. Beside
                the address it belongs to, and client info like it: whoever may
                add the client may set it. Each language named in itself.
              */}
              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>
                  {t('customers.locale', 'Language for emails')}
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
                  <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                    {[{ value: '', label: t('customers.localeSame', 'Same as the organization') }, ...CLIENT_LOCALE_OPTIONS].map((o) => {
                      const on = formLocale === o.value;
                      return (
                        <TouchableOpacity
                          key={o.value || 'same'}
                          onPress={() => setFormLocale(o.value)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                          style={[styles.chip, { borderColor: on ? COLORS.primary : colors.border, backgroundColor: on ? COLORS.primary + '15' : 'transparent' }]}
                        >
                          <Text style={{ color: on ? COLORS.primary : colors.textMuted, fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold as any }}>
                            {o.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
                <Text style={[styles.fieldHint, { color: colors.textMuted }]}>
                  {t('customers.localeHint', 'Invitations and signing links to this client are written in this language.')}
                </Text>
              </View>

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
  // between the field and the filters belongs here. ChipRow supplies its own
  // horizontal padding and inner gap; these only place the rows.
  filterBar: { marginTop: SPACING.xs },
  spaceBar: { marginBottom: SPACING.xs },
  listPad: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md },
  empty: { textAlign: 'center', marginTop: 40 },
  chip: {
    paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full, borderWidth: 1, maxWidth: 180,
    // A chip is a target, not a label.
    minHeight: 34, justifyContent: 'center',
  },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: SPACING.md, marginBottom: 0, paddingHorizontal: 12, borderWidth: 1, borderRadius: RADIUS.md, height: 42 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.sm, marginBottom: 8 },
  // Readable, and plainly not one of your own clients.
  rowMuted: { opacity: 0.68 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  // The same 40px box, squared off — the one difference between the two kinds.
  avatarSquare: { width: 40, height: 40, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
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
  fieldHint: { fontSize: FONT_SIZE.xs, marginTop: 5 },
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
