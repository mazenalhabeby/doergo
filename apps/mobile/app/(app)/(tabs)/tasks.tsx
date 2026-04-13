import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../../src/contexts/auth-context';
import { useTheme } from '../../../src/contexts/theme-context';
import { tasksApi, TaskStatus, type Task, type TasksListParams } from '../../../src/lib/api';
import { Role, getStartOfMonth, getEndOfMonth, toISODateString } from '@hbcfield/shared/client';
import { TaskCard, FilterChip } from '../../../src/components';
import { useSocketContext } from '../../../src/contexts/socket-context';
import { SocketEvents } from '../../../src/lib/socket';
import {
  COLORS,
  SPACING,
  RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
  ROUTES,
} from '../../../src/lib/constants';

// ---------------------------------------------------------------------------
// Tab / filter definitions
// ---------------------------------------------------------------------------

type TabKey = 'current' | 'upcoming' | 'history';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'current', label: 'Current' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'history', label: 'History' },
];

// Filter options for technicians
const TECH_FILTER_OPTIONS = [
  { key: 'ALL', label: 'All' },
  { key: 'ACTIVE', label: 'Active' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'BLOCKED', label: 'Blocked' },
] as const;

// Filter options for admin (more granular)
const ADMIN_FILTER_OPTIONS = [
  { key: 'ALL', label: 'All' },
  { key: 'NEW', label: 'New' },
  { key: 'ASSIGNED', label: 'Assigned' },
  { key: 'IN_PROGRESS', label: 'Active' },
  { key: 'COMPLETED', label: 'Done' },
  { key: 'BLOCKED', label: 'Blocked' },
] as const;

type FilterKey = string;

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

const TAB_EMPTY_MESSAGES: Record<TabKey, string> = {
  current: 'No tasks this month',
  upcoming: 'No upcoming tasks',
  history: 'No past tasks',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TasksScreen() {
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const isAdmin = user?.role === Role.ADMIN || user?.role === 'CLIENT';

  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('current');
  const [filter, setFilter] = useState<FilterKey>('ALL');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const initialFetchDoneRef = useRef(false);
  const fetchingRef = useRef(false);

  const filterOptions = isAdmin ? ADMIN_FILTER_OPTIONS : TECH_FILTER_OPTIONS;

  // Debounce search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // ---------------------------------------------------------------------------
  // Fetch tasks with server-side filtering
  // ---------------------------------------------------------------------------

  const fetchTasks = useCallback(async (showRefresh = false) => {
    if (fetchingRef.current && !showRefresh) return;

    try {
      fetchingRef.current = true;
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
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
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

  // Refetch when screen regains focus (e.g. navigating back from task detail)
  useFocusEffect(
    useCallback(() => {
      if (!initialFetchDoneRef.current) return;
      fetchTasks();
    }, [fetchTasks])
  );

  // Real-time updates via Socket.IO
  const { isConnected, subscribe } = useSocketContext();

  useEffect(() => {
    if (!isConnected) return;

    const unsubs = [
      subscribe(SocketEvents.TASK_ASSIGNED, () => fetchTasks()),
      subscribe(SocketEvents.TASK_STATUS_CHANGED, () => fetchTasks()),
      subscribe(SocketEvents.TASK_CREATED, () => fetchTasks()),
      subscribe(SocketEvents.TASK_UPDATED, () => fetchTasks()),
    ];

    return () => unsubs.forEach(fn => fn());
  }, [isConnected, subscribe, fetchTasks]);

  // Tab switch resets status filter
  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    setFilter('ALL');
  };

  const handleRefresh = () => fetchTasks(true);

  const handleTaskPress = (task: Task) => {
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

    return result;
  }, [tasks, filter]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (isLoading && tasks.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.surface }]}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
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
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      {/* Search Bar */}
      <View style={[styles.searchContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: colors.textPrimary }]}
          placeholder="Search tasks..."
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
      </View>

      {/* Tab Bar */}
      <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
        {TABS.map(tab => {
          const active = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => handleTabChange(tab.key)}
            >
              <Text style={[styles.tabText, { color: colors.textMuted }, active && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Filter Chips */}
      <View style={styles.filterContainer}>
        <FlatList
          data={filterOptions as readonly { key: string; label: string }[]}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.key}
          renderItem={({ item }) => (
            <FilterChip
              label={item.label}
              active={filter === item.key}
              onPress={() => setFilter(item.key)}
            />
          )}
          contentContainerStyle={{ gap: SPACING.sm }}
        />
      </View>

      {/* Tasks Count */}
      <View style={styles.countContainer}>
        <Text style={[styles.countText, { color: colors.textMuted }]}>
          {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''}
        </Text>
        {isLoading && (
          <ActivityIndicator size="small" color={COLORS.primary} style={{ marginLeft: SPACING.sm }} />
        )}
      </View>

      {/* Blocked Tasks Banner */}
      {blockedTasks.length > 0 && filter !== 'BLOCKED' && (
        <View style={[styles.blockedBanner, { backgroundColor: colors.errorLight }]}>
          <View style={styles.blockedBannerContent}>
            <Ionicons name="warning" size={20} color={COLORS.error} />
            <View style={{ flex: 1 }}>
              <Text style={styles.blockedBannerTitle}>
                {blockedTasks.length} blocked task{blockedTasks.length !== 1 ? 's' : ''}
              </Text>
              <Text style={[styles.blockedBannerSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                {blockedTasks.map(t => t.title).join(', ')}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.blockedBannerAction}
              onPress={() => setFilter('BLOCKED')}
            >
              <Text style={styles.blockedBannerActionText}>View</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Tasks List */}
      <FlatList
        data={filteredTasks}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TaskCard
            task={item}
            onPress={() => handleTaskPress(item)}
            showAssignee={isAdmin}
            showPriority={isAdmin}
            showDate
          />
        )}
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
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>{TAB_EMPTY_MESSAGES[activeTab]}</Text>
          </View>
        }
      />
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

  // Count
  countContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  countText: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.medium,
  },

  // List
  listContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl,
    gap: SPACING.md,
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
