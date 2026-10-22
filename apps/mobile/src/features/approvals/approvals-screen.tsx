import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, SectionList, View } from 'react-native';
import { router, useFocusEffect, type Href, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  APPROVAL_GROUPS,
  APPROVAL_KINDS,
  describeApproval,
  memberKey,
  type ApprovalDay,
  type ApprovalItem,
  type ApprovalKind,
  type ApprovalT,
} from '@hbcfield/shared/client';
import { useTheme } from '@/contexts/theme-context';
import { useAuth } from '@/contexts/auth-context';
import { isExternalMember } from '@/lib/member-reach';
import { formatDay } from '@/lib/money';
import { useResponsive } from '@/lib/responsive';
import { AText, FilterPill, FilterRow, Ground, HeaderBack, ScreenHeader, SectionLabel } from '@/components/amazen';
import { centeredContent } from '@/components/screen-container';
import { WellRow } from '../register/well-row';
import { approvalKey, loadApprovals } from './approvals-store';
import { StandInSheet } from './stand-in-sheet';
import { refreshControl } from '@/components/pull-refresh';
import { ApprovalDayRow } from './approval-day-row';

/** A list row: one item, or a person's working day that groups several. */
type Row = { day: ApprovalDay; item?: undefined } | { item: ApprovalItem; day?: undefined };

type Filter = ApprovalKind | 'all';

/**
 * APPROVALS — everything waiting for this member to decide, in one list: what
 * cannot wait, then today, then the rest. The gateway reads each kind's own
 * list as the member, so this shows exactly what those screens would.
 * Online only; read again every time the screen is shown.
 */
export function ApprovalsScreen() {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t, i18n } = useTranslation();
  const r = useResponsive();
  const wide = r.isTablet ? centeredContent(720) : null;

  const [items, setItems] = useState<ApprovalItem[] | null>(null);
  const [days, setDays] = useState<ApprovalDay[]>([]);
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Arriving with ?kind= (a notification, or a screen that used to decide it): open on that kind.
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  const [filter, setFilter] = useState<Filter>(() =>
    kind && (APPROVAL_KINDS as readonly string[]).includes(kind) ? (kind as ApprovalKind) : 'all');
  const [standIn, setStandIn] = useState(false);
  // An external member decides only in their workspace and never hands it on (the server refuses STAND_IN_EXTERNAL).
  const { user } = useAuth();
  const external = isExternalMember(user as never);

  const load = useCallback(async (mode: 'first' | 'refresh') => {
    if (mode === 'refresh') setRefreshing(true);
    try {
      const res = await loadApprovals();
      setItems(res.items);
      setDays(res.days ?? []);
      setUnavailable(res.unavailable);
      setFailed(false);
    } catch {
      setFailed(true);
      setItems((x) => x ?? []);
    } finally {
      setRefreshing(false);
    }
  }, []);
  // Back from a decision — the item is gone, the counts moved.
  useFocusEffect(useCallback(() => { void load(items ? 'refresh' : 'first'); }, [load])); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const n = new Map<ApprovalKind, number>();
    for (const i of items ?? []) n.set(i.kind, (n.get(i.kind) ?? 0) + 1);
    return n;
  }, [items]);
  // A person's working day is one row; the items it holds are opened from it.
  const grouped = useMemo(() => new Set(days.flatMap((d) => d.members.map(memberKey))), [days]);
  const shown = useMemo(
    () => (items ?? []).filter((i) => (filter === 'all' || i.kind === filter) && !grouped.has(approvalKey(i))),
    [items, filter, grouped],
  );
  const shownDays = useMemo(() => days.filter((d) => filter === 'all' || d.members.some((m) => m.kind === filter)), [days, filter]);
  const membersOf = (d: ApprovalDay) => (items ?? []).filter((i) => d.members.some((m) => memberKey(m) === approvalKey(i)));
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

  const tt = t as unknown as ApprovalT;
  // Whose decisions this member covers today — from the items themselves.
  const covering = useMemo(
    () => [...new Set((items ?? []).filter((i) => i.why?.via === 'DELEGATED' && i.why.fromName).map((i) => i.why!.fromName!))],
    [items],
  );
  const back = () => (router.canGoBack() ? router.back() : router.navigate('/(app)/(tabs)/more' as Href));

  const header = (
    <View style={{ gap: amazen.space(3), paddingBottom: amazen.space(2) }}>
      {counts.size > 1 ? (
        <FilterRow>
          <FilterPill label={`${t('approvals.all')} ${items?.length ?? 0}`} on={filter === 'all'} onPress={() => setFilter('all')} />
          {APPROVAL_KINDS.filter((k) => counts.has(k)).map((k) => (
            <FilterPill key={k} label={`${t(`approvals.kinds.${k}`)} ${counts.get(k)}`} on={filter === k} onPress={() => setFilter(k)} />
          ))}
        </FilterRow>
      ) : null}
      {covering.length ? (
        <AText variant="caption" tone="accent">{t('approvals.standIn.covering', { names: covering.join(', ') })}</AText>
      ) : null}
      {unavailable.length || failed ? (
        <AText variant="caption" tone="warn">
          {failed
            ? t('approvals.loadFailed')
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
        refreshControl={
          refreshControl({ refreshing: refreshing, onRefresh: () => void load('refresh'), color: c.accent })
        }
        renderSectionHeader={({ section }) => (
          <SectionLabel
            tone={section.group === 'NOW' ? 'critical' : 'muted'}
            style={{
              paddingTop: amazen.space(3),
              paddingBottom: amazen.space(1.5),
              paddingHorizontal: amazen.space(1),
            }}>
            {`${t(`approvals.groups.${section.group}`)} · ${section.data.length}`}
          </SectionLabel>
        )}
        ListEmptyComponent={
          <View style={{ paddingVertical: amazen.space(10), alignItems: 'center', gap: amazen.space(1.5) }}>
            {!items ? <ActivityIndicator color={c.accent} /> : (
              <>
                <AText variant="body" tone="strong" style={{ textAlign: 'center' }}>{t('approvals.empty')}</AText>
                <AText variant="caption" tone="onGlass" style={{ textAlign: 'center' }}>{t('approvals.emptyHint')}</AText>
              </>
            )}
          </View>
        }
        renderItem={({ item: row, index, section }) => {
          if (row.day) return <ApprovalDayRow day={row.day} members={membersOf(row.day)} onDone={() => void load('refresh')} />;
          const item = row.item;
          const text = describeApproval(item, tt, i18n.language);
          const lead = text.facts[0]?.value;
          return (
            <WellRow
              first={index === 0 || !!section.data[index - 1]?.day}
              last={index === section.data.length - 1}
              title={item.subject.name || t('approvals.someone')}
              detail={[
                text.headline,
                lead,
                item.space?.name,
                item.step ? t('approvals.step.short', { role: item.step.roleName }) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              trailing={
                <AText variant="caption" tone="muted" numeric>
                  {item.raisedAt ? formatDay(item.raisedAt, i18n.language) : ''}
                </AText>
              }
              onPress={() => router.push({ pathname: '/(app)/approval/[key]', params: { key: approvalKey(item) } } as never)}
            />
          );
        }}
      />
      <StandInSheet visible={standIn} onClose={() => setStandIn(false)} onChanged={() => void load('refresh')} />
    </Ground>
  );
}
