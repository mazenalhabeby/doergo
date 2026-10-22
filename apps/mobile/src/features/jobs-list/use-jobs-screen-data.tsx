import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { oversees } from '@/lib/permissions';
import { useResponsive } from '@/lib/responsive';
import { countRouteStops } from '@/lib/my-route';
import { drivesRoutes } from '@/lib/member-reach';
import { ROUTES } from '@/lib/constants';
import { ScreenHeader, useTabSafe } from '@/components/amazen';
import { useTourScroll } from '../tour';
import { centeredContent } from '@/components/screen-container';
import { isCanceled, isClosed, isMine, isUnderWay, stepLabelFor, stepsFor } from '../home/my-work';
import { useTaskFlows } from '../home/use-task-flows';
import type { OpenSheet } from '../job/job-logic';
import type { WriteStatus } from '../job/use-job-writes';
import {
  bandOf,
  canCreateJobs,
  chipsFor,
  effectiveFilter,
  groupJobs,
  passesFilter,
  pickNextUp,
  showsNextUp,
  showsRouteRow,
  type JobFacts,
  type JobsFilter,
  type Period,
} from './jobs-logic';
import { useJobsList, type ListTask } from './use-jobs-list';

export const s = StyleSheet.create({
  wellTop: { borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: 12, paddingBottom: 4 },
  wellBottom: { borderBottomLeftRadius: 26, borderBottomRightRadius: 26 },
});

/** useJobsScreen's state and handlers — everything before its markup, moved here unchanged. */
export function useJobsScreenData({
  writeStatus,
  renderDetail,
}: Pick<Pick<{
  /** The job page's one status write, handed down by the route (`task/[id].tsx`). */
  writeStatus: WriteStatus;
  /** The tablet's right-hand pane — `TaskDetailPane`, rendered by the route. */
  renderDetail: (taskId: string, sheet: OpenSheet | null, close: () => void) => ReactNode;
}, 'writeStatus' | 'renderDetail'>, 'writeStatus' | 'renderDetail'>) {
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
  // One pull refreshes the jobs AND what is open for my role.
  const [roleRefresh, setRoleRefresh] = useState(0);

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
  const factsOf = useCallback(
    (task: ListTask): JobFacts =>
      facts.get(task.id) ?? { mine: false, closed: false, canceled: false, underWay: false },
    [facts],
  );

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
    label:
      c.key === 'all'
        ? t('jobsList.filters.all')
        : t('jobsList.filters.withCount', { label: t(`jobsList.filters.${c.key}`), count: c.count }),
  }));

  /* ---------------- opening a job ---------------- */

  const open = useCallback((task: { id: string }, sheet?: OpenSheet) => {
    if (r.isSplit) { setSelected({ id: task.id, sheet: sheet ?? null }); return; }
    router.push((sheet ? `/task/${task.id}?sheet=${encodeURIComponent(sheet)}` : ROUTES.taskDetail(task.id)) as Href);
  }, [r.isSplit]);

  // One callback for every row, so `memo(JobRow)` holds (see sameJobRowProps).
  const openById = useCallback((id: string) => open({ id }), [open]);

  const labelFor = useCallback((task: ListTask) => {
    if (task.status === 'BLOCKED' && !stepsFor(task, flows)?.some((s) => s.key === 'BLOCKED')) return t('status.BLOCKED');
    return stepLabelFor(task, flows, t as never);
  }, [flows, t]);

  /* ---------------- the pieces ---------------- */

  const wide = r.isTablet && !r.isSplit ? centeredContent(720) : null;
  const tourScroll = useTourScroll();
  const pad = amazen.space(4);

  /*
    ⚠️ THE ONE HEADER — the amazen `ScreenHeader`, as on the home: the date,
    the screen's name, its actions, and the avatar top right from the same
    source and handler (`useProfileAvatar`). Outside the list, so it never
    scrolls away and nothing in it can move the column.
  */
  const header = (
    <ScreenHeader
      title={t('jobsList.title')}
      tour={{ title: 'tasks-header' }}
      actions={canCreateJobs(user as never) ? [{
        label: `＋ ${t('jobsList.newJob')}`,
        a11yLabel: t('jobsList.newJob'),
        onPress: () => router.push('/(app)/(tabs)/create-task' as Href),
        tourKey: 'tasks-new',
      }] : undefined}
      style={wide ?? undefined}
    />
  );

  return {
    amazen,
    t,
    tabSafe,
    r,
    c,
    oversee,
    period,
    setFilter,
    search,
    setSearch,
    mineOnly,
    setMineOnly,
    selected,
    setSelected,
    roleRefresh,
    setRoleRefresh,
    list,
    tasks,
    flows,
    changePeriod,
    factsOf,
    filter,
    next,
    sections,
    routeStops,
    routeShown,
    filterOptions,
    open,
    openById,
    labelFor,
    wide,
    tourScroll,
    pad,
    header,
  };
}
