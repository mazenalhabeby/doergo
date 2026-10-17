import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { assetRegisterApi, REGISTER_PAGE_SIZE, type RegisterAsset } from '../../lib/api';
import { useReachSpaces } from '../../hooks/use-reach-spaces';
import { useResponsive } from '../../lib/responsive';
import { AText, FilterPill, FilterRow, Ground, HeaderBack, ScreenHeader, SearchField } from '../amazen';
import { centeredContent } from '../screen-container';
import { StatusDot, WellRow } from './well-row';
import { holderName, statusLabel } from './register-words';

const SEARCH_DEBOUNCE_MS = 300;

/**
 * EQUIPMENT — a workspace's register, for whoever holds `canViewAssets` there.
 *
 * The workspaces offered are the ones that run Assets AND where the member
 * holds the permission (`useReachSpaces`), so a chip never leads to an empty
 * 404. The server narrows the list again whatever is asked. Paging, the
 * dropped-stale-answer guard and the debounce follow the client book.
 */
export function RegisterScreen() {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const r = useResponsive();
  const wide = r.isTablet ? centeredContent(720) : null;

  const { spaces, loaded } = useReachSpaces('assets', 'canViewAssets');
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [kinds, setKinds] = useState<{ id: string; name: string; count: number }[]>([]);
  const [kindId, setKindId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<RegisterAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  /* One workspace: it is the screen's, no chip. Several: the first until one is picked. */
  useEffect(() => {
    if (spaces.length === 1) setSpaceId(spaces[0]!.id);
  }, [spaces]);

  useEffect(() => {
    let alive = true;
    setKindId(null);
    assetRegisterApi
      .kinds(spaceId ?? undefined)
      .then((k) => {
        if (alive) setKinds(k.filter((x) => x.count > 0));
      })
      .catch(() => {
        if (alive) setKinds([]);
      });
    return () => { alive = false; };
  }, [spaceId]);

  const queryId = useRef(0);
  const paging = useRef({ page: 1, done: false });

  const load = useCallback(async (mode: 'first' | 'refresh') => {
    const id = ++queryId.current;
    paging.current = { page: 1, done: false };
    if (mode === 'first') setLoading(true); else setRefreshing(true);
    try {
      const rows = await assetRegisterApi.list({ spaceId: spaceId ?? undefined, search, categoryId: kindId ?? undefined, page: 1 });
      if (id !== queryId.current) return;
      setItems(rows);
      paging.current = { page: 1, done: rows.length < REGISTER_PAGE_SIZE };
    } catch {
      if (id === queryId.current) { setItems([]); paging.current.done = true; }
    } finally {
      if (id === queryId.current) { setLoading(false); setRefreshing(false); }
    }
  }, [spaceId, search, kindId]);

  const loadMore = useCallback(async () => {
    if (loadingMore || loading || refreshing || paging.current.done) return;
    const id = queryId.current;
    const next = paging.current.page + 1;
    setLoadingMore(true);
    try {
      const rows = await assetRegisterApi.list({ spaceId: spaceId ?? undefined, search, categoryId: kindId ?? undefined, page: next });
      if (id !== queryId.current) return;
      setItems((prev) => [...prev, ...rows]);
      paging.current = { page: next, done: rows.length < REGISTER_PAGE_SIZE };
    } catch {
      if (id === queryId.current) paging.current.done = true;
    } finally {
      if (id === queryId.current) setLoadingMore(false);
    }
  }, [loadingMore, loading, refreshing, spaceId, search, kindId]);

  const lastSearch = useRef(search);
  useEffect(() => {
    if (!loaded) return;
    const typing = search !== lastSearch.current;
    lastSearch.current = search;
    const tmr = setTimeout(() => void load('first'), typing ? SEARCH_DEBOUNCE_MS : 0);
    return () => clearTimeout(tmr);
  }, [search, spaceId, kindId, loaded, load]);

  const open = useCallback((id: string) => router.push(`/(app)/equipment/${id}` as Href), []);
  const filtered = !!search.trim() || !!kindId;

  const header = (
    <View style={{ gap: amazen.space(3), paddingBottom: amazen.space(3) }}>
      {spaces.length > 1 ? (
        <FilterRow>
          {[{ id: null as string | null, name: t('register.allSpaces', 'All workspaces') }, ...spaces].map((s) => (
            <FilterPill key={s.id ?? 'all'} label={s.name} on={spaceId === s.id} onPress={() => setSpaceId(s.id)} />
          ))}
        </FilterRow>
      ) : spaces.length === 1 ? (
        <AText variant="caption" tone="onGlass">{spaces[0]!.name}</AText>
      ) : null}
      <SearchField value={search} onChangeText={setSearch} placeholder={t('register.search', 'Search name, serial, model')} />
      {kinds.length > 1 ? (
        <FilterRow>
          {[{ id: null as string | null, name: t('register.allKinds', 'All'), count: 0 }, ...kinds].map((k) => (
            <FilterPill
              key={k.id ?? 'all'}
              label={k.id ? `${k.name} ${k.count}` : k.name}
              on={kindId === k.id}
              onPress={() => setKindId(k.id)}
            />
          ))}
        </FilterRow>
      ) : null}
    </View>
  );

  return (
    <Ground style={{ flex: 1 }}>
      <ScreenHeader
        title={t('register.title', 'Equipment')}
        leading={<HeaderBack onPress={() => (router.canGoBack() ? router.back() : router.navigate('/(app)/(tabs)/manage' as Href))} />}
        style={wide ?? undefined}
      />
      <FlatList
        data={loading ? [] : items}
        keyExtractor={(a) => a.id}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[{ paddingHorizontal: amazen.space(4), paddingBottom: amazen.space(12) }, wide]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load('refresh')}
            tintColor={c.accent}
            colors={[c.accent]}
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          <View style={{ paddingVertical: amazen.space(8), alignItems: 'center' }}>
            {loading || !loaded
              ? <ActivityIndicator color={c.accent} />
              : (
                  <AText variant="body" tone="onGlass" style={{ textAlign: 'center' }}>
                    {filtered
                      ? t('register.emptyFiltered', 'Nothing matches.')
                      : t('register.empty', 'No equipment in this workspace yet.')}
                  </AText>
                )}
          </View>
        }
        ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: amazen.space(5) }} color={c.accent} /> : null}
        renderItem={({ item, index }) => {
          const who = holderName(item.holders);
          const detail = [
            item.status === 'ACTIVE' ? (who ? t('register.heldBy', '{{name}} has it', { name: who }) : t('register.notHanded', 'Not handed out')) : statusLabel(t, item.status),
            item.category?.name,
          ].filter(Boolean).join(' · ');
          return (
            <WellRow
              first={index === 0}
              last={index === items.length - 1}
              leading={<StatusDot status={item.status} />}
              title={item.name}
              detail={detail}
              onPress={() => open(item.id)}
            />
          );
        }}
      />
    </Ground>
  );
}
