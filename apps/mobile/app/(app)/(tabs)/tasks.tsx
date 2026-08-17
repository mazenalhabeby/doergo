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
import { Role, getStartOfMonth, getEndOfMonth, toISODateString } from '@hbcfield/shared/client';
import { TaskCard, FilterChip, Skeleton, ScreenContainer, PressableScale } from '../../../src/components';
import { LinearGradient } from 'expo-linear-gradient';
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
  const isAdmin = user?.role === Role.ADMIN || user?.role === 'CLIENT';
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
        limit: 100,
      };

      const fetchedTasks = await tasksApi.list(params);
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
  }, [activeTab, debouncedSearch]);

  // Initial fetch
  useEffect(() => {
    if (initialFetchDoneRef.current) return;
    initialFetchDoneRef.current = true;
    fetchTasks();
  }, [fetchTasks]);

  // Re-fetch when tab or debounced search changes (after initial)
  useEffect(() => {
    if (!initialFetchDoneRef.current) return;
    fetchTasks();
  }, [activeTab, debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

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
      socketDebounceRef.current = setTimeout(() => fetchTasks(), 2000);
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
  }, [isConnected, subscribe, fetchTasks]);

  // Tab switch resets status filter
  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    setFilter('ALL');
  };

  const handleRefresh = () => fetchTasks(true);

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
      {/* Plan route — optimize today's location tasks into a driving route */}
      <PressableScale
        onPress={() => router.push('/(app)/route-planner')}
        activeScale={0.97}
        style={styles.planRouteWrap}
      >
        <LinearGradient
          colors={['#10b981', COLORS.primary, COLORS.primaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.planRouteGradient}
        >
          <View style={styles.planRouteIconChip}>
            <Ionicons name="navigate" size={18} color="#fff" />
          </View>
          <Text style={styles.planRouteText}>{t('route.planRoute', 'Plan my route')}</Text>
          <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.85)" />
        </LinearGradient>
      </PressableScale>

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
        // numColumns can't change on a live list — key forces a remount when it does.
        key={`cols-${listColumns}`}
        numColumns={listColumns}
        columnWrapperStyle={listColumns > 1 ? styles.gridRow : undefined}
        renderItem={({ item, index }) => {
          const card = (
            <TaskCard task={item} onPress={() => handleTaskPress(item)} showAssignee={isAdmin} showPriority={isAdmin} showDate />
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
    marginTop: SPACING.md,
    borderRadius: RADIUS.lg,
  },
  planRouteGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  planRouteIconChip: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  planRouteText: {
    flex: 1,
    color: '#fff',
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.bold as any,
    letterSpacing: 0.3,
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
  emptyText: {
    fontSize: FONT_SIZE.lg,
    marginTop: SPACING.md,
  },
});
