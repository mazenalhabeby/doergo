import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/theme-context';
import { useReachSpaces } from '@/hooks/use-reach-spaces';
import { formatDay } from '@/lib/money';
import { useResponsive } from '@/lib/responsive';
import { AText, FilterPill, FilterRow, Ground, HeaderBack, ScreenHeader, Pill } from '@/components/amazen';
import { centeredContent } from '@/components/screen-container';
import { WellRow } from '../register/well-row';
import { requestsOfSpaces, stageOf, type ListedRequest, type RequestStage } from './requests-store';
import { workspaceFilter } from '@/components/workspace-filter';
import { refreshControl } from '@/components/pull-refresh';
import { useFetchData } from '@/hooks/use-fetch-data';

const STAGES: RequestStage[] = ['waiting', 'job', 'done'];

/**
 * CLIENT REQUESTS — what residents sent through the portals of the workspaces
 * where this member holds `canViewPortal`. Waiting ones first: those are the
 * ones somebody has to answer. A request that became a job opens as that job.
 */
export function RequestsScreen() {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t, i18n } = useTranslation();
  const r = useResponsive();
  const wide = r.isTablet ? centeredContent(720) : null;

  const { spaces, loaded } = useReachSpaces('b2c_portal', 'canViewPortal');
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [stage, setStage] = useState<RequestStage>('waiting');

  const ids = useMemo(() => (spaceId ? [spaceId] : spaces.map((s) => s.id)), [spaceId, spaces]);

  const fetcher = useCallback(() => requestsOfSpaces(ids), [ids]);
  const fetched = useFetchData<ListedRequest[]>({
    fetcher,
    // Every ask goes out, as before; ANY failure (a 401 included) shows an empty list.
    dedupe: false,
    ignore401: false,
    onError: () => [],
  });
  const items = fetched.data ?? null;
  const { fetchData, refresh, setData } = fetched;
  const load = useCallback(
    (mode: 'first' | 'refresh') => (mode === 'refresh' ? refresh() : fetchData()),
    [refresh, fetchData],
  );

  useEffect(() => {
    if (loaded) {
      setData(undefined);
      void load('first');
    }
  }, [loaded, load, setData]);
  /* Back from a request just turned into a job — it moves tabs. */
  useFocusEffect(
    useCallback(() => {
      if (loaded && items) void load('refresh');
    }, [loaded, load]),
  ); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const n: Record<RequestStage, number> = { waiting: 0, job: 0, done: 0 };
    for (const x of items ?? []) n[stageOf(x)] += 1;
    return n;
  }, [items]);
  const shown = useMemo(() => (items ?? []).filter((x) => stageOf(x) === stage), [items, stage]);
  const stageWord = (s: RequestStage) =>
    s === 'waiting'
      ? t('clientRequests.waiting', 'Waiting')
      : s === 'job'
        ? t('clientRequests.becameJob', 'Became a job')
        : t('clientRequests.done', 'Done');

  const open = useCallback((x: ListedRequest) => {
    if (x.triaged) router.push(`/(app)/task/${x.id}` as Href);
    else
      router.push({
        pathname: '/(app)/client-request/[id]',
        params: { id: x.id, portalId: x.portalId, spaceId: x.portalSpaceId },
      } as never);
  }, []);

  const header = (
    <View style={{ gap: amazen.space(3), paddingBottom: amazen.space(3) }}>
      {workspaceFilter({ spaces, spaceId, setSpaceId, t })}
      <FilterRow>
        {STAGES.map((s) => (
          <FilterPill key={s} label={`${stageWord(s)} ${counts[s]}`} on={stage === s} onPress={() => setStage(s)} />
        ))}
      </FilterRow>
    </View>
  );

  return (
    <Ground style={{ flex: 1 }}>
      <ScreenHeader
        title={t('clientRequests.title', 'Client requests')}
        leading={
          <HeaderBack
            onPress={() => (router.canGoBack() ? router.back() : router.navigate('/(app)/(tabs)/manage' as Href))}
          />
        }
        style={wide ?? undefined}
      />
      <FlatList
        data={items ? shown : []}
        keyExtractor={(x) => x.id}
        ListHeaderComponent={header}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[{ paddingHorizontal: amazen.space(4), paddingBottom: amazen.space(12) }, wide]}
        refreshControl={refreshControl({
          refreshing: fetched.isRefreshing,
          onRefresh: () => void load('refresh'),
          color: c.accent,
        })}
        ListEmptyComponent={
          <View style={{ paddingVertical: amazen.space(8), alignItems: 'center' }}>
            {!items || !loaded ? (
              <ActivityIndicator color={c.accent} />
            ) : (
              <AText variant="body" tone="onGlass" style={{ textAlign: 'center' }}>
                {stage === 'waiting'
                  ? t('clientRequests.noneWaiting', 'Nothing is waiting for an answer.')
                  : t('clientRequests.none', 'Nothing here.')}
              </AText>
            )}
          </View>
        }
        renderItem={({ item, index }) => (
          <WellRow
            first={index === 0}
            last={index === shown.length - 1}
            title={item.title}
            detail={[item.unitName, item.customerName, formatDay(item.createdAt, i18n.language)]
              .filter(Boolean)
              .join(' · ')}
            trailing={
              <Pill
                label={stageWord(stageOf(item))}
                tone={stageOf(item) === 'waiting' ? 'warn' : stageOf(item) === 'job' ? 'accent' : 'neutral'}
              />
            }
            onPress={() => open(item)}
          />
        )}
      />
    </Ground>
  );
}
