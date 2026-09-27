import React, { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/auth-context';
import { useTheme } from '../../contexts/theme-context';
import { oversees } from '../../lib/permissions';
import { useResponsive } from '../../lib/responsive';
import { countRouteStops } from '../../lib/my-route';
import { drivesRoutes } from '../../lib/member-reach';
import { ROUTES } from '../../lib/constants';
import { OfflineBanner } from '../../offline/components/offline-banner';
import { FreshnessLabel } from '../../offline/components/freshness-label';
import { Ground, AText, ScreenHeader, WellDivider, useTabSafe } from '../amazen';
import { TourTarget } from '../tour';
import { centeredContent } from '../screen-container';
import { isCanceled, isClosed, isMine, isUnderWay, stepLabelFor, stepsFor } from '../home/my-work';
import { useTaskFlows } from '../home/use-task-flows';
import { QuietButton, SectionLabel } from '../job/job-ui';
import type { OpenSheet } from '../job/job-logic';
import type { WriteStatus } from '../job/use-job-writes';
import {
  bandOf, canCreateJobs, chipsFor, effectiveFilter, emptyKind, groupJobs, passesFilter, pickNextUp, placeOf,
  rowRight, rowWho, showsNextUp, showsRouteRow, PERIODS,
  type JobBand, type JobFacts, type JobsFilter, type Period,
} from './jobs-logic';
import { useJobsList, type ListTask } from './use-jobs-list';
import { FilterChips, SearchField, Segmented } from './jobs-controls';
import { JobRow } from './job-row';
import { NextUp } from './next-up';
import { RouteRow } from './route-row';

/** The list is asked for 100 at a time; at the cap it says so rather than implying it is everything. */
const PAGE = 100;

const BAND_KEY: Record<JobBand, string> = {
  doing: 'jobsList.bands.doing',
  blocked: 'jobsList.bands.blocked',
  overdue: 'jobsList.bands.overdue',
  today: 'jobsList.bands.today',
  later: 'jobsList.bands.later',
  done: 'jobsList.bands.done',
};

/**
 * THE JOBS TAB — `docs/design/job-flow.html`, `renderJobs()`.
 *
 * It answers "what next": Next up is the reader's first open job with its
 * REAL next step on the button, and under it the jobs sit in wells by band —
 * Doing now, Blocked, Overdue, Today, Later, Done. For somebody overseeing,
 * Mine / Everyone; for everybody, Now / Upcoming / History and the chips.
 *
 * ⚠️ BANDS REPLACE THE SORT MENU. The old screen's "Sort by" popup (a raw
 * `<Modal>`) ordered by a column; the bands ARE the order, and inside each the
 * shared ranking decides — the same one the home widget reads.
 *
 * ⚠️ VIRTUALISED. Everyone can be hundreds of jobs, so the wells are a
 * `SectionList` whose rows draw their own slice of the well, never one tall
 * view holding them all.
 */
export function JobsScreen({
  writeStatus,
  renderDetail,
}: {
  /** The job page's one status write, handed down by the route (`task/[id].tsx`). */
  writeStatus: WriteStatus;
  /** The tablet's right-hand pane — `TaskDetailPane`, rendered by the route. */
  renderDetail: (taskId: string, sheet: OpenSheet | null, close: () => void) => ReactNode;
}) {
  const { user } = useAuth();
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const tabSafe = useTabSafe();
  const r = useResponsive();
  const c = amazen.color;

  /*
    The oversight view, not the admin one: somebody supervising a site sees
    that site's work and is not an admin.
  */
  const oversee = oversees(user);
  const [period, setPeriod] = useState<Period>('current');
  const [chosenFilter, setFilter] = useState<JobsFilter>('all');
  const [search, setSearch] = useState('');
  /* Opens on MINE — "what do I do now" is why a person unlocks a phone. */
  const [mineOnly, setMineOnly] = useState(true);
  const [selected, setSelected] = useState<{ id: string; sheet: OpenSheet | null } | null>(null);

  const list = useJobsList({ period, search, oversee, mineOnly });
  const { tasks } = list;
  const flows = useTaskFlows(tasks);

  // A new period is a new question — the chip goes back to All.
  const changePeriod = (p: Period) => { setPeriod(p); setFilter('all'); };

  /* ---------------- the facts, once per row ---------------- */

  const facts = useMemo(() => {
    const m = new Map<string, JobFacts>();
    for (const task of tasks) {
      const steps = stepsFor(task, flows);
      m.set(task.id, {
        mine: isMine(task, user?.id),
        closed: isClosed(task, steps),
        canceled: isCanceled(task, steps),
        underWay: isUnderWay(task, steps),
      });
    }
    return m;
  }, [tasks, flows, user?.id]);
  const factsOf = useCallback((task: ListTask): JobFacts => facts.get(task.id) ?? { mine: false, closed: false, canceled: false, underWay: false }, [facts]);

  /* ---------------- the chips: this period's, only those with jobs ---------------- */

  const chips = useMemo(() => chipsFor(tasks, { oversee, period }, factsOf), [tasks, oversee, period, factsOf]);
  // A chip that emptied (the last blocked job unblocked) quietly hands back to All.
  const filter = effectiveFilter(chosenFilter, chips);

  /* ---------------- what is drawn ---------------- */

  const nextShown = showsNextUp({ period, filter, search });
  const next = useMemo(() => (nextShown ? pickNextUp(tasks, factsOf) : null), [nextShown, tasks, factsOf]);
  const sections = useMemo(() => {
    const now = new Date();
    const visible = tasks.filter((task) => task !== next && passesFilter(task, filter, bandOf(task, factsOf(task), now), factsOf(task)));
    return groupJobs(visible, factsOf, now).map((g) => ({ key: g.band, band: g.band, data: g.items }));
  }, [tasks, next, filter, factsOf]);

  /*
    Stops for "Plan my route" — from the Now list only, and remembered: the
    other periods are date windows, and letting them answer made the row
    blink out the moment somebody looked at their history.
  */
  const [routeStops, setRouteStops] = useState(0);
  useEffect(() => {
    if (period !== 'current' || list.isLoading) return;
    setRouteStops(countRouteStops(tasks, user?.id));
  }, [period, list.isLoading, tasks, user?.id]);
  const routeShown = showsRouteRow({ drives: drivesRoutes(user as never), stops: routeStops, period, filter });

  const filterOptions = chips.map((c) => ({
    key: c.key,
    label: c.key === 'all' ? t('jobsList.filters.all') : t('jobsList.filters.withCount', { label: t(`jobsList.filters.${c.key}`), count: c.count }),
  }));

  /* ---------------- opening a job ---------------- */

  const open = useCallback((task: { id: string }, sheet?: OpenSheet) => {
    if (r.isSplit) { setSelected({ id: task.id, sheet: sheet ?? null }); return; }
    router.push((sheet ? `/task/${task.id}?sheet=${encodeURIComponent(sheet)}` : ROUTES.taskDetail(task.id)) as Href);
  }, [r.isSplit]);

  const labelFor = useCallback((task: ListTask) => {
    if (task.status === 'BLOCKED' && !stepsFor(task, flows)?.some((s) => s.key === 'BLOCKED')) return t('status.BLOCKED');
    return stepLabelFor(task, flows, t as never);
  }, [flows, t]);

  /* ---------------- the pieces ---------------- */

  const wide = r.isTablet && !r.isSplit ? centeredContent(720) : null;
  const pad = amazen.space(4);

  /*
    ⚠️ THE ONE HEADER — the amazen `ScreenHeader`, as on the home: the date,
    the screen's name, its actions, and the avatar top right from the same
    source and handler (`useProfileAvatar`). Outside the list, so it never
    scrolls away and nothing in it can move the column.
  */
  const header = (
    <TourTarget name="tasks-header">
      <ScreenHeader
        title={t('jobsList.title')}
        actions={canCreateJobs(user as never) ? [{
          label: `＋ ${t('jobsList.newJob')}`,
          a11yLabel: t('jobsList.newJob'),
          onPress: () => router.push('/(app)/(tabs)/create-task' as Href),
        }] : undefined}
        style={wide ?? undefined}
      />
    </TourTarget>
  );

  const listHeader = (
    <View style={{ gap: amazen.space(3.5), paddingBottom: amazen.space(1) }}>
      <TourTarget name="tasks-search">
        <SearchField value={search} onChange={setSearch} placeholder={t('jobsList.search')} clearLabel={t('common.clear')} />
      </TourTarget>
      {oversee ? (
        <Segmented
          options={[
            { key: 'mine', label: t('jobsList.scope.mine'), count: list.counts.mine },
            { key: 'all', label: t('jobsList.scope.everyone'), count: list.counts.all },
          ]}
          value={mineOnly ? 'mine' : 'all'}
          onChange={(k) => setMineOnly(k === 'mine')}
        />
      ) : null}
      <Segmented options={PERIODS.map((p) => ({ key: p, label: t(`jobsList.period.${p}`) }))} value={period} onChange={changePeriod} />
      <TourTarget name="tasks-filters">
        <FilterChips options={filterOptions} value={filter} onChange={setFilter} />
      </TourTarget>
      <OfflineBanner />
      {list.localUpdatedAt !== null ? (
        <View style={{ alignItems: 'flex-end', marginTop: -amazen.space(2) }}><FreshnessLabel at={list.localUpdatedAt} /></View>
      ) : null}
      {routeShown ? <RouteRow stops={routeStops} onPress={() => router.push('/(app)/route-planner' as Href)} /> : null}
      {next ? (
        <View style={{ gap: amazen.space(2) }}>
          <SectionLabel tone="accent">{t('tasks.myWork.next.label')}</SectionLabel>
          <NextUp task={next} flows={flows} writeStatus={writeStatus} onOpen={(sheet) => open(next, sheet)} onChanged={() => void list.fetchTasks()} />
        </View>
      ) : null}
      {list.isLoading && tasks.length > 0 ? <ActivityIndicator size="small" color={c.accent} /> : null}
    </View>
  );

  const kind = emptyKind({ search, filter, period });
  const empty = list.isLoading ? (
    <View style={{ paddingVertical: amazen.space(10), alignItems: 'center' }}><ActivityIndicator color={c.accent} /></View>
  ) : list.error ? (
    <View style={{ backgroundColor: c.well, borderRadius: amazen.radius.panel, padding: amazen.space(4), gap: amazen.space(3), marginTop: amazen.space(3.5) }}>
      <AText variant="body" tone="strong">{list.error}</AText>
      <QuietButton tone="accent" label={t('common.retry')} onPress={() => void list.fetchTasks()} />
    </View>
  ) : next ? null : (
    <View style={{ backgroundColor: c.well, borderRadius: amazen.radius.panel, padding: amazen.space(4), gap: amazen.space(1), marginTop: amazen.space(3.5) }}>
      <AText variant="body" tone="strong" style={{ fontFamily: amazen.font.sansMedium, fontSize: 16, lineHeight: 22 }}>{t(`jobsList.empty.${kind}`)}</AText>
      <AText variant="caption" tone="ink">{t(kind === 'search' ? 'jobsList.empty.searchHint' : 'jobsList.empty.hint')}</AText>
    </View>
  );

  const footer = tasks.length >= PAGE ? (
    <AText variant="caption" tone="ink" style={{ textAlign: 'center', marginTop: amazen.space(4) }}>{t('jobsList.capped', { count: PAGE })}</AText>
  ) : null;

  const firstId = sections[0]?.data[0]?.id;

  const listView = (
    <Ground style={{ flex: 1 }}>
      {header}
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        initialNumToRender={16}
        windowSize={11}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
        contentContainerStyle={[{ paddingHorizontal: pad, paddingTop: amazen.space(1), paddingBottom: tabSafe }, wide]}
        refreshControl={<RefreshControl refreshing={list.isRefreshing} onRefresh={() => void list.refresh()} colors={[c.accentSolid]} tintColor={c.accent} />}
        renderSectionHeader={({ section }) => (
          <View style={[s.wellTop, { backgroundColor: c.well, marginTop: amazen.space(3.5), paddingHorizontal: amazen.space(3.5) }]}>
            <SectionLabel tone={section.band === 'blocked' ? 'critical' : section.band === 'overdue' ? 'warn' : 'muted'}>
              {`${t(BAND_KEY[section.band])} · ${section.data.length}`}
            </SectionLabel>
          </View>
        )}
        ItemSeparatorComponent={WellSeparator}
        renderItem={({ item, index, section }) => {
          const f = factsOf(item);
          const band = section.band as JobBand;
          const last = index === section.data.length - 1;
          const row = (
            <JobRow
              id={item.id}
              title={item.title}
              urgent={item.priority === 'URGENT'}
              band={band}
              mine={f.mine}
              closed={f.closed}
              who={rowWho(item as never, f, { oversee, everyone: !mineOnly })}
              place={placeOf(item as never)}
              right={rowRight(item, f)}
              stepLabel={labelFor(item)}
              onPress={() => open(item)}
            />
          );
          return (
            <View style={[{ backgroundColor: c.well, paddingHorizontal: amazen.space(3.5) }, last ? [s.wellBottom, { paddingBottom: amazen.space(2) }] : null]}>
              {item.id === firstId ? <TourTarget name="tasks-card">{row}</TourTarget> : row}
            </View>
          );
        }}
      />
    </Ground>
  );

  if (!r.isSplit) return listView;

  /* Wide tablets: the list on the left, the job on the right. */
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: c.canvas }}>
      <View style={{ width: 380 }}>{listView}</View>
      <View style={{ flex: 1, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: c.lineWell }}>
        {selected ? (
          <React.Fragment key={`${selected.id}:${selected.sheet ?? ''}`}>
            {renderDetail(selected.id, selected.sheet, () => setSelected(null))}
          </React.Fragment>
        ) : (
          <Ground style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: amazen.space(6) }}>
            <AText variant="body" tone="ink" style={{ textAlign: 'center' }}>{t('tasks.selectTask')}</AText>
          </Ground>
        )}
      </View>
    </View>
  );
}

/** The hairline between two rows — drawn on the well, so the well has no gap in it. Module scope: one component type, never remounted. */
function WellSeparator() {
  const { amazen } = useTheme();
  return <View style={{ backgroundColor: amazen.color.well, paddingHorizontal: amazen.space(3.5) }}><WellDivider /></View>;
}

const s = StyleSheet.create({
  wellTop: { borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: 12, paddingBottom: 4 },
  wellBottom: { borderBottomLeftRadius: 26, borderBottomRightRadius: 26 },
});
