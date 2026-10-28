import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, SectionList, View } from 'react-native';
import { router, useFocusEffect, type Href, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  APPROVAL_GROUPS,
  APPROVAL_KINDS,
  dayMatchesFilter,
  filterAfterRead,
  filterFromQuery,
  matchesApprovalFilter,
  memberKey,
  WAITS_FOR_YOU_FILTER,
  type ApprovalDay,
  type ApprovalItem,
  type ApprovalKind,
} from '@hbcfield/shared/client';
import { useTheme } from '@/contexts/theme-context';
import { useAuth } from '@/contexts/auth-context';
import { isExternalMember } from '@/lib/member-reach';
import { useResponsive } from '@/lib/responsive';
import {
  AText,
  FilterPill,
  FilterRow,
  GhostButton,
  Ground,
  HeaderBack,
  ScreenHeader,
  SectionLabel,
} from '@/components/amazen';
import { centeredContent } from '@/components/screen-container';
import { approvalKey, loadApprovals } from './approvals-store';
import { StandInSheet } from './stand-in-sheet';
import { refreshControl } from '@/components/pull-refresh';
import { ApprovalDayRow } from './approval-day-row';
import { ApprovalItemRow } from './approval-item-row';

/** A list row: one item, or a person's working day that groups several. */
type Row = { day: ApprovalDay; item?: undefined } | { item: ApprovalItem; day?: undefined };

/** A kind, everything, or only what waits for the caller's own approval. */
type Filter = ApprovalKind | 'all' | typeof WAITS_FOR_YOU_FILTER;

/**
 * APPROVALS — everything waiting for this member to decide, in one list: what
 * cannot wait, then today, then the rest. The gateway reads each kind's own
 * list as the member, so this shows exactly what those screens would.
 * Online only; read again every time the screen is shown.
 */
export function ApprovalsScreen() {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const r = useResponsive();
  const wide = r.isTablet ? centeredContent(720) : null;

  const [items, setItems] = useState<ApprovalItem[] | null>(null);
  const [days, setDays] = useState<ApprovalDay[]>([]);
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Arriving with ?kind= (a notification, or a screen that used to decide it): open on that kind.
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  // `?kind=waitsForYou` (and the older `yours`) opens "Waiting for you" — the shared reading of a link.
  const [chosen, setChosen] = useState<Filter>(() => (filterFromQuery(kind, APPROVAL_KINDS) as Filter | null) ?? 'all');
  // A second link while the screen is open (a notification tapped here) moves the filter too.
  useEffect(() => {
    const next = filterFromQuery(kind, APPROVAL_KINDS) as Filter | null;
    if (next) setChosen(next);
  }, [kind]);
  const [standIn, setStandIn] = useState(false);
  // An external member decides only in their workspace and never hands it on (the server refuses STAND_IN_EXTERNAL).
  const { user } = useAuth();
  const external = isExternalMember(user as never);

  // The list as it stands now — the focus reload reads it, not the first render's null.
  const itemsRef = useRef<ApprovalItem[] | null>(null);
  itemsRef.current = items;
  const load = useCallback(async (mode: 'first' | 'refresh') => {
    if (mode === 'refresh') setRefreshing(true);
    try {
      const res = await loadApprovals();
      setItems(res.items);
      setDays(res.days ?? []);
      setUnavailable(res.unavailable);
      setFailed(false);
    } catch {
      // Never loaded: the error state with Retry. Loaded before: the list stays, with a warning line.
      setFailed(true);
    } finally {
      setRefreshing(false);
    }
  }, []);
  const retry = () => {
    setFailed(false);
    void load('first');
  };
  // Back from a decision — the item is gone, the counts moved. Over a list: quietly. Never loaded: the spinner.
  useFocusEffect(
    useCallback(() => {
      if (itemsRef.current) void load('refresh');
      else retry();
    }, [load]), // eslint-disable-line react-hooks/exhaustive-deps
  );

  const counts = useMemo(() => {
    const n = new Map<ApprovalKind, number>();
    for (const i of items ?? []) n.set(i.kind, (n.get(i.kind) ?? 0) + 1);
    return n;
  }, [items]);
  const waitsForYouCount = useMemo(() => (items ?? []).filter((i) => i.step?.waitsForYou).length, [items]);
  // Nothing left waiting for you (the last one just decided): back to everything, as on the web — from this render.
  const filter = filterAfterRead(chosen, items ?? undefined) as Filter;
  useEffect(() => {
    if (filter !== chosen) setChosen(filter);
  }, [filter, chosen]);
  const fits = (i: ApprovalItem) => matchesApprovalFilter(i, filter);
  const membersOf = (d: ApprovalDay) =>
    (items ?? []).filter((i) => d.members.some((m) => memberKey(m) === approvalKey(i)));
  // A person's working day is one row; the items it holds are opened from it.
  const grouped = useMemo(() => new Set(days.flatMap((d) => d.members.map(memberKey))), [days]);
  const shown = useMemo(
    () => (items ?? []).filter((i) => fits(i) && !grouped.has(approvalKey(i))),
    [items, filter, grouped], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const shownDays = useMemo(
    () => days.filter((d) => dayMatchesFilter(membersOf(d), filter)),
    [days, filter, items], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const sections = useMemo(
    () =>
      APPROVAL_GROUPS.map((g) => ({
        group: g,
        data: [
          ...shownDays.filter((d) => d.group === g).map((day): Row => ({ day })),
          ...shown.filter((i) => i.group === g).map((item): Row => ({ item })),
        ],
      })).filter((s) => s.data.length > 0),
    [shown, shownDays],
  );

  // Whose decisions this member covers today — from the items themselves.
  const covering = useMemo(
    () => [
      ...new Set(
        (items ?? []).filter((i) => i.why?.via === 'DELEGATED' && i.why.fromName).map((i) => i.why!.fromName!),
      ),
    ],
    [items],
  );
  const back = () => (router.canGoBack() ? router.back() : router.navigate('/(app)/(tabs)/more' as Href));

  const header = (
    <View style={{ gap: amazen.space(3), paddingBottom: amazen.space(2) }}>
      {/* Filtered (often from a notification): the pills stay, so "All" is always one tap away. */}
      {counts.size > 1 || filter !== 'all' || waitsForYouCount > 0 ? (
        <FilterRow>
          {waitsForYouCount > 0 ? (
            <FilterPill
              label={`${t('approvals.tag.waitsForYou')} ${waitsForYouCount}`}
              on={filter === WAITS_FOR_YOU_FILTER}
              onPress={() => setChosen(WAITS_FOR_YOU_FILTER)}
            />
          ) : null}
          <FilterPill
            label={`${t('approvals.all')} ${items?.length ?? 0}`}
            on={filter === 'all'}
            onPress={() => setChosen('all')}
          />
          {APPROVAL_KINDS.filter((k) => counts.has(k) || k === filter).map((k) => (
            <FilterPill
              key={k}
              label={`${t(`approvals.kinds.${k}`)} ${counts.get(k) ?? 0}`}
              on={filter === k}
              onPress={() => setChosen(k)}
            />
          ))}
        </FilterRow>
      ) : null}
      {covering.length ? (
        <AText variant="caption" tone="accent">
          {t('approvals.standIn.covering', { names: covering.join(', ') })}
        </AText>
      ) : null}
      {items && (unavailable.length || failed) ? (
        <AText variant="caption" tone="warn">
          {failed
            ? t('approvals.refreshFailed')
            : t('approvals.unavailable', { kinds: unavailable.map((k) => t(`approvals.kinds.${k}`)).join(', ') })}
        </AText>
      ) : null}
    </View>
  );

  return (
    <Ground style={{ flex: 1 }}>
      <ScreenHeader
        title={t('approvals.title')}
        leading={<HeaderBack onPress={back} />}
        actions={external ? [] : [{ label: t('approvals.standIn.open'), onPress: () => setStandIn(true) }]}
        style={wide ?? undefined}
      />
      <SectionList
        sections={items ? sections : []}
        keyExtractor={(x) => (x.day ? x.day.key : approvalKey(x.item))}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={header}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[{ paddingHorizontal: amazen.space(4), paddingBottom: amazen.space(12) }, wide]}
        refreshControl={refreshControl({
          refreshing: refreshing,
          onRefresh: () => void load('refresh'),
          color: c.accent,
        })}
        renderSectionHeader={({ section }) => (
          <SectionLabel
            tone={section.group === 'NOW' ? 'critical' : 'muted'}
            style={{
              paddingTop: amazen.space(3),
              paddingBottom: amazen.space(1.5),
              paddingHorizontal: amazen.space(1),
            }}
          >
            {`${t(`approvals.groups.${section.group}`)} · ${section.data.length}`}
          </SectionLabel>
        )}
        ListEmptyComponent={
          <View style={{ paddingVertical: amazen.space(10), alignItems: 'center', gap: amazen.space(1.5) }}>
            {!items && failed ? (
              <>
                <AText variant="body" tone="strong" style={{ textAlign: 'center' }}>
                  {t('approvals.loadFailed')}
                </AText>
                <GhostButton label={t('common.retry')} onPress={retry} />
              </>
            ) : !items ? (
              <ActivityIndicator color={c.accent} />
            ) : filter !== 'all' && items.length > 0 ? (
              <>
                <AText variant="body" tone="strong" style={{ textAlign: 'center' }}>
                  {t('approvals.emptyKind', { kind: t(`approvals.kinds.${filter}`) })}
                </AText>
                <GhostButton label={t('approvals.showAll')} onPress={() => setChosen('all')} />
              </>
            ) : (
              <>
                <AText variant="body" tone="strong" style={{ textAlign: 'center' }}>
                  {t('approvals.empty')}
                </AText>
                <AText variant="caption" tone="onGlass" style={{ textAlign: 'center' }}>
                  {t('approvals.emptyHint')}
                </AText>
              </>
            )}
          </View>
        }
        renderItem={({ item: row, index, section }) => {
          if (row.day)
            return <ApprovalDayRow day={row.day} members={membersOf(row.day)} onDone={() => void load('refresh')} />;
          return (
            <ApprovalItemRow
              item={row.item}
              first={index === 0 || !!section.data[index - 1]?.day}
              last={index === section.data.length - 1}
            />
          );
        }}
      />
      <StandInSheet visible={standIn} onClose={() => setStandIn(false)} onChanged={() => void load('refresh')} />
    </Ground>
  );
}
