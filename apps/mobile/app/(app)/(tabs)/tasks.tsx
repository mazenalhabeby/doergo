import { useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../../src/contexts/auth-context';
import { useTheme } from '../../../src/contexts/theme-context';
import { tasksApi, TaskStatus, type Task, type TasksListParams } from '../../../src/lib/api';
import { Role, getStartOfMonth, getEndOfMonth, toISODateString, rankMyWork, bandsOf, summariseMyWork } from '@hbcfield/shared/client';
import { WorkScope } from '../../../src/components/tasks/work-scope';
import { NextUpCard } from '../../../src/components/tasks/next-up-card';
import { oversees } from '../../../src/lib/permissions';
import { countRouteStops } from '../../../src/lib/my-route';
import { TaskCard, FilterChip, Skeleton, ScreenContainer, PressableScale } from '../../../src/components';
import { LinearGradient } from 'expo-linear-gradient';
import { useConnectivity, useOffline, useSyncStatus } from '../../../src/offline/offline-context';
import { filterTasksLocally } from '../../../src/offline/tasks/task-list-query';
import { overlayTask } from '../../../src/offline/tasks/overlay';
import { FreshnessLabel } from '../../../src/offline/components/freshness-label';
import { OfflineBanner } from '../../../src/offline/components/offline-banner';
import { SyncChip } from '../../../src/offline/components/sync-chip';
import { TourTarget } from '../../../src/components/tour';
import { useResponsive } from '../../../src/lib/responsive';
import { TaskDetailPane } from '../task/[id]';
import { useSocketContext } from '../../../src/contexts/socket-context';
import { SocketEvents } from '../../../src/lib/socket';
import {
  COLORS,
  SPACING,
  RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
  SHADOWS,
  ROUTES,
} from '../../../src/lib/constants';

// ---------------------------------------------------------------------------
// Tab / filter definitions
// ---------------------------------------------------------------------------

type TabKey = 'current' | 'upcoming' | 'history';

const TAB_KEYS: TabKey[] = ['current', 'upcoming', 'history'];

// Filter option keys for technicians
const TECH_FILTER_KEYS = ['ALL', 'ACTIVE', 'COMPLETED', 'BLOCKED'] as const;
const TECH_FILTER_I18N: Record<string, string> = {
  ALL: 'tasks.filters.all',
  ACTIVE: 'tasks.filters.active',
  COMPLETED: 'tasks.filters.completed',
  BLOCKED: 'tasks.filters.blocked',
};

// Filter option keys for admin (more granular)
const ADMIN_FILTER_KEYS = ['ALL', 'NEW', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED'] as const;
const ADMIN_FILTER_I18N: Record<string, string> = {
  ALL: 'tasks.filters.all',
  NEW: 'tasks.filters.new',
  ASSIGNED: 'tasks.filters.assigned',
  IN_PROGRESS: 'tasks.filters.inProgress',
  COMPLETED: 'tasks.filters.done',
  BLOCKED: 'tasks.filters.blocked',
};

type FilterKey = string;

type SortKey = 'dueDate' | 'priority' | 'status' | 'title' | 'createdAt';

const SORT_OPTIONS: { key: SortKey; i18nKey: string; icon: string }[] = [
  { key: 'dueDate', i18nKey: 'tasks.sort.dueDate', icon: 'calendar-outline' },
  { key: 'priority', i18nKey: 'tasks.sort.priority', icon: 'flag-outline' },
  { key: 'status', i18nKey: 'tasks.sort.status', icon: 'pulse-outline' },
  { key: 'title', i18nKey: 'tasks.sort.name', icon: 'text-outline' },
  { key: 'createdAt', i18nKey: 'tasks.sort.created', icon: 'time-outline' },
];

const PRIORITY_ORDER: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const STATUS_ORDER: Record<string, number> = {
  BLOCKED: 0, IN_PROGRESS: 1, EN_ROUTE: 2, ARRIVED: 3, ACCEPTED: 4,
  ASSIGNED: 5, NEW: 6, COMPLETED: 7, CLOSED: 8, CANCELED: 9, DRAFT: 10,
};

// ---------------------------------------------------------------------------
// Date-range helpers per tab
// ---------------------------------------------------------------------------

function getTabDateParams(tab: TabKey): Pick<TasksListParams, 'startDate' | 'endDate' | 'includeNoDueDate'> {
  const now = new Date();

  switch (tab) {
    case 'current': {
      const start = getStartOfMonth(now);
      const end = getEndOfMonth(now);
      return {
        startDate: toISODateString(start),
        endDate: toISODateString(end),
        includeNoDueDate: true,
      };
    }
    case 'upcoming': {
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const start = getStartOfMonth(nextMonth);
      return {
        startDate: toISODateString(start),
        // No upper bound
      };
    }
    case 'history': {
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = getEndOfMonth(prevMonth);
      return {
        // No lower bound
        endDate: toISODateString(end),
      };
    }
  }
}

const TAB_EMPTY_I18N: Record<TabKey, string> = {
  current: 'tasks.empty.current',
  upcoming: 'tasks.empty.upcoming',
  history: 'tasks.empty.history',
};

// ---------------------------------------------------------------------------
// Master-detail layout (module scope so `children` reconcile in place, no remount)
// ---------------------------------------------------------------------------

function TasksSplitLayout({
  isSplit,
  detail,
  borderColor,
  children,
}: {
  isSplit: boolean;
  detail: ReactNode;
  borderColor: string;
  children: ReactNode;
}) {
  // Narrow screens: the list centered in a grid column (existing behaviour).
  if (!isSplit) return <ScreenContainer width="grid">{children}</ScreenContainer>;
  // Wide tablets: list on the left, task detail on the right.
  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      <View style={{ width: 380 }}>{children}</View>
      <View style={{ flex: 1, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: borderColor }}>
        {detail}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TasksScreen() {
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const r = useResponsive();
  /*
    The oversight view of the task list, not the admin one.

    This asked `role === ADMIN`, which decided the filter set and whether a card
    shows its assignee and priority. Somebody supervising a site needs all
    three — the list they see is that site's work, not their own — and is not an
    admin, so they were given a field worker's list of jobs they do not do.
  */
  const isAdmin = oversees(user);
  // In master-detail split the list lives in a narrow left pane → single column.
  const listColumns = r.isSplit ? 1 : r.columns;
  // Fixed card width for the tablet grid: split the (capped) row into columns.
  const gridWidth = r.isSplit ? 380 : Math.min(r.width, r.gridMaxWidth);
  const cardWidth = listColumns > 1
    ? (gridWidth - SPACING.lg * 2 - SPACING.md * (listColumns - 1)) / listColumns
    : gridWidth;

  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('current');
  const [filter, setFilter] = useState<FilterKey>('ALL');
  const [sortBy, setSortBy] = useState<SortKey>('dueDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  /*
    Mine, or everything I oversee.

    Only meaningful for somebody who can see more than their own work — a field
    member's list already IS their own, so `isAdmin` decides whether the scope
    exists at all rather than what it defaults to.

    Opens on MINE. "What do I do now" is why a person unlocks a phone, and an
    admin's own job is otherwise one row among the hundred the app fetches.
  */
  const [mineOnly, setMineOnly] = useState(true);
  const [counts, setCounts] = useState<{ mine: number | null; all: number | null }>({ mine: null, all: null });

  /*
    Is this list somebody's own work?

    True for a field member always — their list IS their own — and for an
    overseer only while the scope says Mine. It decides the ordering and the
    "next up" card, both of which are answers to "what do I do now" and make no
    sense over a list of other people's jobs.
  */
  const showMyWork = !isAdmin || mineOnly;


  const initialFetchDoneRef = useRef(false);
  const fetchingRef = useRef(false);

  const filterKeys = isAdmin ? ADMIN_FILTER_KEYS : TECH_FILTER_KEYS;
  const filterI18n = isAdmin ? ADMIN_FILTER_I18N : TECH_FILTER_I18N;

  // Debounce search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // ---------------------------------------------------------------------------
  // Fetch tasks with server-side filtering
  // ---------------------------------------------------------------------------

  const lastFetchTimeRef = useRef(0);
  const offline = useOffline();
  const connectivity = useConnectivity();
  const { operations: outbox } = useSyncStatus();
  const lastParamsRef = useRef<TasksListParams | null>(null);

  /** The list from the phone's copy, with the member's unsent changes on top. */
  // When the phone's copy was last brought up to date — shown while the list comes from it.
  const [localUpdatedAt, setLocalUpdatedAt] = useState<number | null>(null);
  const readLocalTasks = useCallback(async (params: TasksListParams) => {
    if (!offline.records) return;
    lastParamsRef.current = params;
    void offline.records.cursor('tasks').then((c) => setLocalUpdatedAt(c.lastPullAt)).catch(() => undefined);
    const rows = await offline.records.list<Task>('tasks');
    const ops = offline.engine?.operations() ?? [];
    const visible = filterTasksLocally(
      rows.map((r) => overlayTask(r.data, ops)),
      params,
      user?.id,
    );
    setTasks(visible as Task[]);
  }, [offline.records, offline.engine, user?.id]);

  // The copy changed (a pull landed) or a queued change moved: re-read, no request.
  useEffect(() => {
    if (!offline.records) return;
    return offline.records.onChange((scope) => {
      if (scope === 'tasks' && lastParamsRef.current) void readLocalTasks(lastParamsRef.current);
    });
  }, [offline.records, readLocalTasks]);
  useEffect(() => {
    if (lastParamsRef.current) void readLocalTasks(lastParamsRef.current);
  }, [outbox, readLocalTasks]);

  const fetchTasks = useCallback(async (showRefresh = false) => {
    if (fetchingRef.current && !showRefresh) return;

    try {
      fetchingRef.current = true;
      lastFetchTimeRef.current = Date.now();
      if (showRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      const dateParams = getTabDateParams(activeTab);
      const params: TasksListParams = {
        ...dateParams,
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
        // Narrowed by the SERVER when the scope is "mine": the list is paged, so
        // filtering here would filter the page rather than the work — and an
        // admin's own task may not be in it. Never sent for somebody who only
        // ever sees their own; the request is already that.
        ...(isAdmin && mineOnly ? { assignedToMe: true } : {}),
        limit: 100,
      };

      /*
        From the phone's copy whenever it can answer — instantly, with or without
        a connection — and a pull in the background brings it up to date (the
        copy re-reads itself when that lands). The "current" and "upcoming" tabs
        are entirely inside what the phone keeps; history reaches further back,
        so it asks the server while there is one.

        A phone that has never pulled has nothing to show, so its first load
        still comes from the server.
      */
      if (offline.records && offline.engine) {
        const { lastPullAt } = await offline.records.cursor('tasks');
        const useLocal = lastPullAt !== null && (activeTab !== 'history' || connectivity !== 'online');
        if (useLocal) {
          await readLocalTasks(params);
          if (connectivity === 'online') void offline.engine.pull('tasks').catch(() => undefined);
          return;
        }
      }

      const fetchedTasks = await tasksApi.list(params);
      setLocalUpdatedAt(null);
      setTasks(fetchedTasks || []);
    } catch (err: any) {
      if (err?.statusCode === 401 || err?.message?.includes('Session expired')) {
        return;
      }
      setError(err instanceof Error ? err.message : t('tasks.failedToLoad'));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      fetchingRef.current = false;
    }
  }, [activeTab, debouncedSearch, isAdmin, mineOnly, offline.records, offline.engine, connectivity, readLocalTasks]);

  /*
    The badges, from the server.

    Both counts arrive in ONE cached reply — counting rows the app has not
    fetched is the only way a badge can be true, since the list is paged. Asked
    only for somebody who has a scope to switch; for everybody else the list is
    already the whole answer.
  */
  const refreshCounts = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const c = await tasksApi.counts();
      setCounts({ mine: c?.mine ?? null, all: c?.all ?? null });
    } catch {
      // A badge that could not be fetched simply does not show a number; it is
      // decoration on a control that works without it.
      setCounts({ mine: null, all: null });
    }
  }, [isAdmin]);

  // Initial fetch
  useEffect(() => {
    if (initialFetchDoneRef.current) return;
    initialFetchDoneRef.current = true;
    fetchTasks();
  }, [fetchTasks]);

  // Re-fetch when tab, search or scope changes (after initial)
  useEffect(() => {
    if (!initialFetchDoneRef.current) return;
    fetchTasks();
  }, [activeTab, debouncedSearch, mineOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  // Counts follow the list: a decision made on one screen changes both numbers.
  useEffect(() => { void refreshCounts(); }, [refreshCounts, tasks.length]);

  // Refetch when screen regains focus — throttled to avoid redundant calls
  useFocusEffect(
    useCallback(() => {
      if (!initialFetchDoneRef.current) return;
      // Skip if fetched less than 30 seconds ago
      if (Date.now() - lastFetchTimeRef.current < 30000) return;
      fetchTasks();
    }, [fetchTasks])
  );

  // Real-time updates via Socket.IO — debounced to batch multiple events
  const { isConnected, subscribe } = useSocketContext();
  const socketDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isConnected) return;

    const debouncedFetch = () => {
      if (socketDebounceRef.current) clearTimeout(socketDebounceRef.current);
      // With the offline copy, an event only says "tasks changed": pull, and the
      // list re-reads itself when the copy updates.
      socketDebounceRef.current = setTimeout(
        () => (offline.engine ? void offline.engine.pull('tasks').catch(() => undefined) : fetchTasks()),
        2000,
      );
    };

    const unsubs = [
      subscribe(SocketEvents.TASK_ASSIGNED, debouncedFetch),
      subscribe(SocketEvents.TASK_STATUS_CHANGED, debouncedFetch),
      subscribe(SocketEvents.TASK_CREATED, debouncedFetch),
      subscribe(SocketEvents.TASK_UPDATED, debouncedFetch),
    ];

    return () => {
      unsubs.forEach(fn => fn());
      if (socketDebounceRef.current) clearTimeout(socketDebounceRef.current);
    };
  }, [isConnected, subscribe, fetchTasks, offline.engine]);

  // Tab switch resets status filter
  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    setFilter('ALL');
  };

  const handleRefresh = async () => {
    // Pull-to-refresh means "sync now": send what waits, then bring the copy up to date.
    if (offline.engine && connectivity === 'online') {
      setIsRefreshing(true);
      try {
        await offline.engine.syncAll();
      } finally {
        setIsRefreshing(false);
      }
    }
    return fetchTasks(true);
  };

  const handleTaskPress = (task: Task) => {
    // In the master-detail split, open the task in the right pane instead of
    // navigating away.
    if (r.isSplit) {
      setSelectedTaskId(task.id);
      return;
    }
    router.push(ROUTES.taskDetail(task.id));
  };

  // ---------------------------------------------------------------------------
  // Client-side status filtering (same multi-status aggregates as before)
  // ---------------------------------------------------------------------------

  /*
    Is there a route to plan — my own open jobs with a place to be?

    Derived from the list already loaded, so the banner costs no request. Read
    from the CURRENT tab only, and remembered: the other two tabs are date
    windows (what is coming, what is done), and letting them answer made the
    banner blink out the moment somebody looked at their history.
  */
  // Stops drive both the banner's visibility and what it says, so they are
  // one number rather than two answers that could disagree.
  const [routeStops, setRouteStops] = useState(0);
  const hasRoute = routeStops > 0;
  useEffect(() => {
    if (activeTab !== 'current' || isLoading) return;
    setRouteStops(countRouteStops(tasks, user?.id));
  }, [activeTab, isLoading, tasks, user?.id]);

  // Derive blocked tasks from existing fetched data (no extra API call)
  const blockedTasks = useMemo(
    () => tasks.filter(t => t.status === TaskStatus.BLOCKED),
    [tasks],
  );

  const filteredTasks = useMemo(() => {
    let result = tasks;

    if (filter !== 'ALL') {
      if (filter === 'ACTIVE' || filter === 'IN_PROGRESS') {
        result = result.filter(task =>
          [TaskStatus.ASSIGNED, TaskStatus.ACCEPTED, TaskStatus.EN_ROUTE, TaskStatus.ARRIVED, TaskStatus.IN_PROGRESS].includes(task.status)
        );
      } else if (filter === 'NEW') {
        result = result.filter(task => task.status === TaskStatus.NEW);
      } else if (filter === 'ASSIGNED') {
        result = result.filter(task =>
          [TaskStatus.ASSIGNED, TaskStatus.ACCEPTED].includes(task.status)
        );
      } else if (filter === 'COMPLETED') {
        result = result.filter(task =>
          [TaskStatus.COMPLETED, TaskStatus.CLOSED].includes(task.status)
        );
      } else if (filter === 'BLOCKED') {
        result = result.filter(task => task.status === TaskStatus.BLOCKED);
      }
    }

    /*
      Somebody's OWN work is ordered by what to do next, not by a column.

      `rankMyWork` is the product's answer and lives in shared, so the phone and
      the web cannot come to different opinions about which job is next: doing
      beats blocked beats overdue beats today. It applies only while the reader
      is looking at their own list and has not chosen a sort of their own —
      picking a column is an explicit request to see it that way instead.
    */
    if (showMyWork && sortBy === 'dueDate') {
      return rankMyWork(result as never) as typeof result;
    }

    // Sort
    const sorted = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'dueDate': {
          const aDate = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
          const bDate = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
          cmp = aDate - bDate;
          break;
        }
        case 'priority':
          cmp = (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99);
          break;
        case 'status':
          cmp = (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99);
          break;
        case 'title':
          cmp = a.title.localeCompare(b.title);
          break;
        case 'createdAt':
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
      }
      return sortOrder === 'desc' ? -cmp : cmp;
    });

    return sorted;
  }, [tasks, filter, sortBy, sortOrder]);

  /*
    One line about the day, from the same ordering the list uses. Derived rather
    than fetched: these are counts of what is already on screen, and the badges
    that must be true across pages come from the server instead.
  */
  const myWork = useMemo(
    () => summariseMyWork(filteredTasks as never),
    [filteredTasks],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (isLoading && tasks.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.surface }]}>
        <Skeleton.TasksList />
      </View>
    );
  }

  if (error && tasks.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.surface }]}>
        <View style={styles.centerContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={COLORS.error} />
          <Text style={[styles.errorText, { color: colors.textSecondary }]}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => fetchTasks()}>
            <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <TasksSplitLayout
        isSplit={r.isSplit}
        borderColor={colors.border}
        detail={
          selectedTaskId ? (
            <TaskDetailPane
              key={selectedTaskId}
              taskId={selectedTaskId}
              embedded
              onClose={() => setSelectedTaskId(null)}
            />
          ) : (
            <View style={styles.splitEmpty}>
              <Ionicons name="clipboard-outline" size={48} color={colors.textMuted} />
              <Text style={[styles.splitEmptyText, { color: colors.textMuted }]}>
                {t('tasks.selectTask', 'Select a task to view its details')}
              </Text>
            </View>
          )
        }
      >
      {/* Search Bar */}
      <TourTarget name="tasks-search" style={[styles.searchContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: colors.textPrimary }]}
          placeholder={t('tasks.searchPlaceholder')}
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </TourTarget>

      {/* Plan route — optimize MY open location jobs into a driving route.

          Sits between the search field and the status filters, not above the
          search: as the first thing under the title it split the header from
          the field it belongs to. Here it reads as an action on the list below
          it, which is what it is.

          Offered only when there is a route to plan — an open job assigned to
          me, with a place to be, on a flow that actually travels. A
          supervisor's list is other people's work and a route through it means
          nothing; a list of desk jobs has nowhere to drive however many
          addresses it carries. */}
      {hasRoute && (
      <PressableScale
        onPress={() => router.push('/(app)/route-planner')}
        activeScale={0.97}
        style={styles.planRouteWrap}
        accessibilityRole="button"
        accessibilityLabel={t('route.planRouteA11y', {
          defaultValue: 'Plan my route, {{count}} stops',
          count: routeStops,
        })}
      >
        <LinearGradient
          colors={[COLORS.primary, COLORS.primaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.planRouteGradient}
        >
          <View style={styles.planRouteIconChip}>
            <Ionicons name="navigate" size={17} color="#fff" />
          </View>
          <View style={styles.planRouteCopy}>
            <Text style={styles.planRouteText}>{t('route.planRoute', 'Plan my route')}</Text>
            {/* The one fact that makes the band worth its width: two stops is a
                detour, nine is the morning. */}
            <Text style={styles.planRouteMeta} numberOfLines={1}>
              {t('route.stopCount', { defaultValue: '{{count}} stops', count: routeStops })}
            </Text>
          </View>
          <View style={styles.planRouteChevron}>
            <Ionicons name="chevron-forward" size={15} color="#fff" />
          </View>
        </LinearGradient>
      </PressableScale>
      )}

      {/* Tab Bar */}
      <TourTarget name="tasks-header" style={[styles.tabBar, { borderBottomColor: colors.border }]}>
        {TAB_KEYS.map(tabKey => {
          const active = activeTab === tabKey;
          return (
            <TouchableOpacity
              key={tabKey}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => handleTabChange(tabKey)}
            >
              <Text style={[styles.tabText, { color: colors.textMuted }, active && styles.tabTextActive]}>
                {t(`tasks.tabs.${tabKey}`)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </TourTarget>

      {/* Filter Chips */}
      <TourTarget name="tasks-filters" style={styles.filterContainer}>
        <FlatList
          data={filterKeys as readonly string[]}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item}
          renderItem={({ item }) => (
            <FilterChip
              label={t(filterI18n[item]!)}
              active={filter === item}
              onPress={() => setFilter(item)}
            />
          )}
          contentContainerStyle={{ gap: SPACING.sm }}
        />
      </TourTarget>

      {/* Tasks Count + Sort */}
      <View style={styles.countContainer}>
        <View style={styles.countLeft}>
          <Text style={[styles.countText, { color: colors.textMuted }]}>
            {filteredTasks.length !== 1 ? t('tasks.taskCountPlural', { count: filteredTasks.length }) : t('tasks.taskCount', { count: filteredTasks.length })}
          </Text>
          {isLoading && (
            <ActivityIndicator size="small" color={COLORS.primary} style={{ marginLeft: SPACING.sm }} />
          )}
        </View>
        <TouchableOpacity
          style={[styles.sortButton, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => setShowSortMenu(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="swap-vertical" size={16} color={COLORS.primary} />
          <Text style={[styles.sortButtonText, { color: colors.textSecondary }]}>
            {t(SORT_OPTIONS.find(o => o.key === sortBy)?.i18nKey ?? '')}
          </Text>
          <Ionicons name={sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'} size={12} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Sort Menu Modal */}
      <Modal visible={showSortMenu} transparent animationType="fade" onRequestClose={() => setShowSortMenu(false)}>
        <Pressable style={styles.sortOverlay} onPress={() => setShowSortMenu(false)}>
          <View style={[styles.sortMenu, { backgroundColor: colors.card }]}>
            <Text style={[styles.sortMenuTitle, { color: colors.textPrimary }]}>{t('tasks.sort.title')}</Text>
            {SORT_OPTIONS.map(option => {
              const isActive = sortBy === option.key;
              return (
                <TouchableOpacity
                  key={option.key}
                  style={[styles.sortMenuItem, isActive && { backgroundColor: colors.primaryLight }]}
                  onPress={() => {
                    if (sortBy === option.key) {
                      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                    } else {
                      setSortBy(option.key);
                      setSortOrder('asc');
                    }
                    setShowSortMenu(false);
                  }}
                  activeOpacity={0.6}
                >
                  <Ionicons
                    name={option.icon as any}
                    size={18}
                    color={isActive ? COLORS.primary : colors.textMuted}
                  />
                  <Text style={[styles.sortMenuItemText, { color: isActive ? COLORS.primary : colors.textPrimary }]}>
                    {t(option.i18nKey)}
                  </Text>
                  {isActive && (
                    <Ionicons
                      name={sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'}
                      size={16}
                      color={COLORS.primary}
                      style={{ marginLeft: 'auto' }}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Modal>

      {/* Blocked Tasks Banner */}
      {blockedTasks.length > 0 && filter !== 'BLOCKED' && (
        <View style={[styles.blockedBanner, { backgroundColor: colors.errorLight }]}>
          <View style={styles.blockedBannerContent}>
            <Ionicons name="warning" size={20} color={COLORS.error} />
            <View style={{ flex: 1 }}>
              <Text style={styles.blockedBannerTitle}>
                {blockedTasks.length !== 1 ? t('tasks.blockedBanner.titlePlural', { count: blockedTasks.length }) : t('tasks.blockedBanner.title', { count: blockedTasks.length })}
              </Text>
              <Text style={[styles.blockedBannerSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                {blockedTasks.map(t => t.title).join(', ')}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.blockedBannerAction}
              onPress={() => setFilter('BLOCKED')}
            >
              <Text style={styles.blockedBannerActionText}>{t('common.view')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Tasks List */}
      <FlatList
        data={filteredTasks}
        keyExtractor={(item) => item.id}
        /*
          The scope, and the one job to open.

          In the header rather than above the list so both scroll away — an
          admin scanning a hundred jobs should not lose a row of screen to a
          control they have already used. `myWork.next` is `rankMyWork`'s first
          result, so the card and the list beneath it cannot disagree.
        */
        ListHeaderComponent={
          <View>
            <OfflineBanner style={styles.offlineBanner} />
            {localUpdatedAt !== null && (
              <View style={styles.freshnessRow}>
                <FreshnessLabel at={localUpdatedAt} />
              </View>
            )}
            {isAdmin && (
              <View style={styles.scopeWrap}>
                <WorkScope
                  mine={mineOnly}
                  onChange={setMineOnly}
                  mineCount={counts.mine}
                  allCount={counts.all}
                />
              </View>
            )}
            {showMyWork && myWork.next && (
              <NextUpCard
                task={myWork.next as never}
                onOpen={() => handleTaskPress(myWork.next as never)}
              />
            )}
          </View>
        }
        // numColumns can't change on a live list — key forces a remount when it does.
        key={`cols-${listColumns}`}
        numColumns={listColumns}
        columnWrapperStyle={listColumns > 1 ? styles.gridRow : undefined}
        renderItem={({ item, index }) => {
          const card = (
            <View>
              <TaskCard task={item} onPress={() => handleTaskPress(item)} showAssignee={isAdmin} showPriority={isAdmin} showDate />
              {/* Only while this job has a change on its way. */}
              <SyncChip entityId={item.id} />
            </View>
          );
          // Spotlight only the first card for the guided tour.
          const content = index === 0 ? <TourTarget name="tasks-card">{card}</TourTarget> : card;
          return listColumns > 1 ? (
            // Fixed-width cell so cards fill half/third of the (capped) row
            // instead of collapsing. A lone last card stays left-aligned.
            <View style={{ width: cardWidth }}>{content}</View>
          ) : (
            content
          );
        }}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="clipboard-outline" size={48} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>{t(TAB_EMPTY_I18N[activeTab])}</Text>
          </View>
        }
      />
      </TasksSplitLayout>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  freshnessRow: { alignItems: 'flex-end', paddingHorizontal: SPACING.lg, paddingTop: SPACING.xs },
  offlineBanner: { marginHorizontal: SPACING.lg, marginBottom: SPACING.sm },
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xxxl,
  },
  errorText: {
    fontSize: FONT_SIZE.xl,
    textAlign: 'center',
    marginTop: SPACING.lg,
    marginBottom: SPACING.xxl,
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xxl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.sm,
  },
  retryButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.semibold,
  },

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  // "Plan my route" — hero CTA above the search bar: brand gradient + frosted
  // icon chip. No glow/elevation: colored shadows render as a muddy dark blob
  // on Android, so the gradient carries the emphasis on its own.
  planRouteWrap: {
    marginHorizontal: SPACING.lg,
    // Sits under the search field: same side margins, and a gap on both sides
    // so it is not read as part of either the field above or the chips below.
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
    borderRadius: RADIUS.lg,
  },
  planRouteGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    // A highlight along the top edge rather than a full outline: it reads as a
    // raised surface catching light, where an even border reads as a box.
    borderColor: 'rgba(255,255,255,0.22)',
  },
  planRouteIconChip: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  // Title and count share a column so the chevron stays vertically centred on
  // the pair rather than on the title alone.
  planRouteCopy: {
    flex: 1,
    gap: 1,
  },
  planRouteText: {
    color: '#fff',
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.bold as any,
    letterSpacing: 0.2,
  },
  planRouteMeta: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.medium as any,
    letterSpacing: 0.2,
  },
  // The chevron gets a target of its own so the arrow is not a lone glyph
  // floating at the edge of a large coloured band.
  planRouteChevron: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  searchInput: {
    flex: 1,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
    fontSize: FONT_SIZE.base,
  },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary,
  },
  tabText: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.medium,
  },
  tabTextActive: {
    color: COLORS.primary,
    fontWeight: FONT_WEIGHT.semibold,
  },

  // Filter
  filterContainer: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },

  // Count + Sort
  countContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  countLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  countText: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.medium,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.xs + 2,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  sortButtonText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
  },
  sortOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xxl,
  },
  sortMenu: {
    width: '100%',
    maxWidth: 300,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    ...SHADOWS.lg,
  },
  sortMenuTitle: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.bold,
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
  },
  sortMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
  },
  sortMenuItemText: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.medium,
  },

  // List
  listContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl,
    gap: SPACING.md,
  },
  // Column gap between cards when the list renders as a grid (tablets).
  // justifyContent centers each row so the capped grid sits mid-screen.
  gridRow: {
    gap: SPACING.md,
    justifyContent: 'center',
  },
  // Master-detail right pane placeholder when no task is selected.
  splitEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.xxxl,
  },
  splitEmptyText: {
    fontSize: FONT_SIZE.lg,
    textAlign: 'center',
  },

  // Blocked Tasks Banner
  blockedBanner: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.errorBorder,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
  },
  blockedBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  blockedBannerTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.error,
  },
  blockedBannerSubtitle: {
    fontSize: FONT_SIZE.xs,
    marginTop: 1,
  },
  blockedBannerAction: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    backgroundColor: COLORS.error,
    borderRadius: RADIUS.sm,
  },
  blockedBannerActionText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.white,
  },

  // Empty
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.xxxl + SPACING.lg,
  },
  scopeWrap: { marginBottom: 10 },
  emptyText: {
    fontSize: FONT_SIZE.lg,
    marginTop: SPACING.md,
  },
});
