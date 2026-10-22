import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CLIENT_FILTERS, CLIENT_FILTER_KEYS, clientFilterQuery, customerStageLabel, type ClientFilter } from '@hbcfield/shared/client';
import { useTheme } from '@/contexts/theme-context';
import { useAuth } from '@/contexts/auth-context';
import { crmCapsOf } from '@/lib/member-reach';
import { customersApi, type MobileCustomer } from '@/lib/api';
import { useCrmSpaces } from '@/hooks/use-crm-spaces';
import { useResponsive } from '@/lib/responsive';
import { AText, FilterPill, FilterRow, Ground, HeaderBack, ScreenHeader, SearchField } from '@/components/amazen';
import { centeredContent } from '@/components/screen-container';
import { ClientRow } from './client-row';
import { ClientsToday } from './clients-today';
import { AddClientSheet } from './add-client-sheet';

/**
 * One page of the client book. 40, not 100: a page is what somebody reads
 * before their thumb reaches the bottom, and the next arrives before they get there.
 */
const PAGE_SIZE = 40;
/** The search field waits this long after the last keystroke — and only the search field. */
const SEARCH_DEBOUNCE_MS = 300;
const keyOf = (c: MobileCustomer) => c.id;

/**
 * CLIENTS — what is owed today, then the book.
 *
 * The data rules are the old screen's and are kept exactly:
 *  - one query shape (`queryFor`), with the kind filter from `clientFilterQuery()`
 *    in shared, never hand-written;
 *  - ⚠️ `includeUnfiled` goes with a named workspace, always — most of a real
 *    book is filed in NO workspace, and a strict filter hides it;
 *  - every first page claims a number, and an answer carrying an older number
 *    is dropped, so a slow page 2 cannot land on a newer filter;
 *  - refresh re-asks the CURRENT question.
 */
export function ClientsScreen() {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const { user } = useAuth();
  const r = useResponsive();
  const wide = r.isTablet ? centeredContent(720) : null;

  const [items, setItems] = useState<MobileCustomer[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  /* Only workspaces that run CRM — a chip for one without it always returns nothing. */
  const spaces = useCrmSpaces();
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ClientFilter>('all');
  const [adding, setAdding] = useState(false);

  /*
    The right to ADD a client (`crmCreateClients`, or managing implies it),
    org-wide or in a workspace that runs CRM — `crmCapsOf`, the same reach the
    Add client tile and the server read, so the button never offers what the
    save would refuse. Absent, not disabled.
  */
  const canAdd = crmCapsOf(user as never).create;

  /* `?new=1` — the Add client shortcut. Opened once, then the flag is cleared. */
  const { new: startNew } = useLocalSearchParams<{ new?: string }>();
  useEffect(() => {
    if (startNew !== '1' || !canAdd) return;
    setAdding(true);
    router.setParams({ new: undefined } as never);
  }, [startNew, canAdd]);


  const queryFor = useCallback((q: string, space: string | null, f: ClientFilter, page: number) => ({
    search: q.trim() || undefined,
    spaceId: space || undefined,
    includeUnfiled: space ? true : undefined,
    ...clientFilterQuery(f),
    page,
    limit: PAGE_SIZE,
  }), []);

  const queryId = useRef(0);
  const paging = useRef({ page: 1, done: false });

  const load = useCallback(async (q: string, space: string | null, f: ClientFilter, mode: 'first' | 'refresh') => {
    const id = ++queryId.current;
    paging.current = { page: 1, done: false };
    if (mode === 'first') setLoading(true); else setRefreshing(true);
    try {
      const rows = await customersApi.list(queryFor(q, space, f, 1));
      if (id !== queryId.current) return;
      setItems(rows);
      paging.current = { page: 1, done: rows.length < PAGE_SIZE };
    } catch {
      // Pull-to-refresh is right there, and the offline layer already says when there is no signal.
      if (id === queryId.current) paging.current.done = true;
    } finally {
      if (id === queryId.current) { setLoading(false); setRefreshing(false); }
    }
  }, [queryFor]);

  /* Three guards, each for a real double-fetch: repeated onEndReached, a first page in flight, a server that has run out. */
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

  /* One effect for all three controls. The wait is the search field's only — a chip is a decision already made. */
  const lastSearch = useRef(search);
  useEffect(() => {
    const typing = search !== lastSearch.current;
    lastSearch.current = search;
    const tmr = setTimeout(() => load(search, spaceId, filter, 'first'), typing ? SEARCH_DEBOUNCE_MS : 0);
    return () => clearTimeout(tmr);
  }, [search, spaceId, filter, load]);

  const refresh = useCallback(() => load(search, spaceId, filter, 'refresh'), [load, search, spaceId, filter]);
  const openClient = useCallback((id: string) => router.push(`/(app)/customer/${id}` as Href), []);

  const spaceName = useCallback((id?: string | null) => (id ? spaces.find((s) => s.id === id)?.name ?? null : null), [spaces]);
  const stage = useCallback(
    (key?: string) => t(`customers.stages.${key || 'LEAD'}`, { defaultValue: customerStageLabel(key || 'LEAD') }),
    [t],
  );
  const tagContact = useMemo(() => ({ label: t('customers.list.contactTag', 'Contact'), tone: 'muted' as const }), [t]);
  const tagApp = useMemo(() => ({ label: t('customers.hasApp', 'App'), tone: 'accent' as const }), [t]);
  const filtered = !!search.trim() || filter !== 'all' || !!spaceId;

  const header = (
    <View style={{ gap: amazen.space(3), paddingBottom: amazen.space(3) }}>
      {!filtered ? <ClientsToday /> : null}
      <SearchField value={search} onChangeText={setSearch} placeholder={t('customers.search', 'Search clients')} />
      <FilterRow>
        {CLIENT_FILTERS.map((f) => <FilterPill key={f} label={t(CLIENT_FILTER_KEYS[f])} on={filter === f} onPress={() => setFilter(f)} />)}
      </FilterRow>
      {/* More than one to choose between, or it is a control that cannot do anything. */}
      {spaces.length > 1 ? (
        <FilterRow>
          {[{ id: null as string | null, name: t('customers.allSpaces', 'All workspaces') }, ...spaces].map((s) => (
            <FilterPill key={s.id ?? 'all'} label={s.name} on={spaceId === s.id} onPress={() => setSpaceId(s.id)} />
          ))}
        </FilterRow>
      ) : null}
    </View>
  );

  return (
    <Ground style={{ flex: 1 }}>
      <ScreenHeader
        title={t('customers.title', 'Clients')}
        leading={<HeaderBack onPress={() => (router.canGoBack() ? router.back() : router.navigate('/(app)/(tabs)/more' as Href))} />}
        actions={
          canAdd
            ? [
                {
                  label: `＋ ${t('customers.addShort', 'Add')}`,
                  a11yLabel: t('customers.add', 'Add client'),
                  onPress: () => setAdding(true),
                },
              ]
            : undefined
        }
        style={wide ?? undefined}
      />
      <FlatList
        data={loading ? [] : items}
        keyExtractor={keyOf}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[{ paddingHorizontal: amazen.space(4), paddingBottom: amazen.space(12) }, wide]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.accent} colors={[c.accent]} />}
        /* 0.4 of a screen: the next page arrives before the thumb gets there. `loadMore` refuses a second call itself. */
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          <View style={{ paddingVertical: amazen.space(8), alignItems: 'center' }}>
            {loading
              ? <ActivityIndicator color={c.accent} />
              : (
                  <AText variant="body" tone="onGlass" style={{ textAlign: 'center' }}>
                    {filtered ? t('customers.list.emptyFiltered') : t('customers.empty')}
                  </AText>
                )}
          </View>
        }
        ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: amazen.space(5) }} color={c.accent} /> : null}
        renderItem={({ item, index }) => {
          const where = spaces.length > 1 && (spaceId === null || !item.spaceId)
            ? spaceName(item.spaceId) ?? t('customers.noSpace', 'No workspace')
            : null;
          return (
            <ClientRow
              client={item}
              first={index === 0}
              last={index === items.length - 1}
              stage={stage(item.status)}
              detail={[item.phone || item.email, where].filter(Boolean).join(' · ')}
              tag={item.isContact ? tagContact : item.isPortalResident ? tagApp : null}
              onOpen={openClient}
            />
          );
        }}
      />
      {canAdd ? (
        <AddClientSheet
          visible={adding}
          onClose={() => setAdding(false)}
          spaces={spaces}
          startSpaceId={spaceId}
          onAdded={refresh}
        />
      ) : null}
    </Ground>
  );
}
