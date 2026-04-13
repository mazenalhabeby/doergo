import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../contexts/auth-context';
import { tasksApi, TaskStatus, type Task } from '../../lib/api';
import { TaskCard, LoadingState, ErrorState } from '../../components';
import { ROUTES } from '../../lib/constants';
import { getWeekDays, isSameDay } from '../../lib/utils';
import { useTheme } from '../../contexts/theme-context';
import { styles as sharedStyles, COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOWS } from './home-styles';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export function FreelancerHome() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentWeekStart, setCurrentWeekStart] = useState(new Date());

  const initialFetchDoneRef = useRef(false);
  const fetchingRef = useRef(false);

  // Get week days
  const weekDays = useMemo(() => getWeekDays(currentWeekStart), [currentWeekStart]);

  // Calculate stats
  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todaysTasks = tasks.filter(task => {
      if (!task.dueDate) return true;
      const dueDate = new Date(task.dueDate);
      return dueDate >= today && dueDate < tomorrow;
    });

    return {
      todaysTasks: todaysTasks.length,
      urgentTasks: tasks.filter(t => t.priority === 'URGENT' || t.priority === 'HIGH').length,
      completed: tasks.filter(t => t.status === TaskStatus.COMPLETED).length,
      pending: tasks.filter(t => t.status === TaskStatus.ASSIGNED || t.status === TaskStatus.NEW).length,
    };
  }, [tasks]);

  // Filter tasks for selected date
  const filteredTasks = useMemo(() => {
    const selected = new Date(selectedDate);
    selected.setHours(0, 0, 0, 0);
    const nextDay = new Date(selected);
    nextDay.setDate(nextDay.getDate() + 1);

    return tasks.filter(task => {
      if (!task.dueDate) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return selected.getTime() === today.getTime();
      }
      const dueDate = new Date(task.dueDate);
      return dueDate >= selected && dueDate < nextDay;
    });
  }, [tasks, selectedDate]);

  // Pre-compute task dates into a Set for O(1) lookups
  const taskDateSet = useMemo(() => {
    const dateSet = new Set<string>();
    const todayStr = new Date().toISOString().split('T')[0]!;
    for (const task of tasks) {
      if (!task.dueDate) {
        dateSet.add(todayStr);
      } else {
        const dateStr = new Date(task.dueDate).toISOString().split('T')[0]!;
        dateSet.add(dateStr);
      }
    }
    return dateSet;
  }, [tasks]);

  const dayHasTasks = useCallback((date: Date) => {
    const dateStr = date.toISOString().split('T')[0]!;
    return taskDateSet.has(dateStr);
  }, [taskDateSet]);

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

      const fetchedTasks = await tasksApi.list();
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
  }, []);

  useEffect(() => {
    if (initialFetchDoneRef.current) return;
    initialFetchDoneRef.current = true;
    fetchTasks();
  }, [fetchTasks]);

  // Refetch when screen regains focus (e.g. navigating back from task detail)
  useFocusEffect(
    useCallback(() => {
      if (!initialFetchDoneRef.current) return;
      fetchTasks();
    }, [fetchTasks])
  );

  const handleRefresh = () => fetchTasks(true);

  const handleTaskPress = (task: Task) => {
    router.push(ROUTES.taskDetail(task.id));
  };

  const handlePrevWeek = () => {
    const newDate = new Date(currentWeekStart);
    newDate.setDate(newDate.getDate() - 7);
    setCurrentWeekStart(newDate);
  };

  const handleNextWeek = () => {
    const newDate = new Date(currentWeekStart);
    newDate.setDate(newDate.getDate() + 7);
    setCurrentWeekStart(newDate);
  };

  const handleToday = () => {
    const today = new Date();
    setCurrentWeekStart(today);
    setSelectedDate(today);
  };

  const isSelectedDate = (date: Date) => isSameDay(date, selectedDate);

  const listHeader = useMemo(() => (
    <>
      {/* Welcome Section */}
      <View style={sharedStyles.welcomeSection}>
        <Text style={[sharedStyles.welcomeGreeting, { color: colors.textMuted }]}>
          Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'},
        </Text>
        <Text style={[sharedStyles.welcomeName, { color: colors.textPrimary }]}>{user?.firstName}!</Text>
      </View>

      {/* Stats Cards */}
      <View style={sharedStyles.statsGrid}>
        <View style={[sharedStyles.statCard, { backgroundColor: colors.card }]}>
          <View style={sharedStyles.statRow}>
            <View style={[sharedStyles.statIcon, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="today" size={18} color={COLORS.primary} />
            </View>
            <Text style={[sharedStyles.statNumber, { color: colors.textPrimary }]}>{stats.todaysTasks}</Text>
          </View>
          <Text style={[sharedStyles.statLabel, { color: colors.textMuted }]}>Today's Tasks</Text>
        </View>
        <View style={[sharedStyles.statCard, { backgroundColor: colors.card }]}>
          <View style={sharedStyles.statRow}>
            <View style={[sharedStyles.statIcon, { backgroundColor: colors.amberLight }]}>
              <Ionicons name="flash" size={18} color={COLORS.amber} />
            </View>
            <Text style={[sharedStyles.statNumber, { color: colors.textPrimary }]}>{stats.urgentTasks}</Text>
          </View>
          <Text style={[sharedStyles.statLabel, { color: colors.textMuted }]}>Urgent Tasks</Text>
        </View>
        <View style={[sharedStyles.statCard, { backgroundColor: colors.card }]}>
          <View style={sharedStyles.statRow}>
            <View style={[sharedStyles.statIcon, { backgroundColor: colors.successLight }]}>
              <Ionicons name="checkmark-done" size={18} color={COLORS.success} />
            </View>
            <Text style={[sharedStyles.statNumber, { color: colors.textPrimary }]}>{stats.completed}</Text>
          </View>
          <Text style={[sharedStyles.statLabel, { color: colors.textMuted }]}>Completed</Text>
        </View>
        <View style={[sharedStyles.statCard, { backgroundColor: colors.card }]}>
          <View style={sharedStyles.statRow}>
            <View style={[sharedStyles.statIcon, { backgroundColor: colors.warningLight }]}>
              <Ionicons name="hourglass-outline" size={18} color={COLORS.warning} />
            </View>
            <Text style={[sharedStyles.statNumber, { color: colors.textPrimary }]}>{stats.pending}</Text>
          </View>
          <Text style={[sharedStyles.statLabel, { color: colors.textMuted }]}>Pending</Text>
        </View>
      </View>

      {/* Calendar Section */}
      <View style={flStyles.calendarSection}>
        <View style={flStyles.calendarHeader}>
          <Text style={[flStyles.calendarMonth, { color: colors.textPrimary }]}>
            {MONTH_NAMES[currentWeekStart.getMonth()]} {currentWeekStart.getFullYear()}
          </Text>
          <View style={flStyles.calendarNav}>
            <TouchableOpacity onPress={handlePrevWeek} style={flStyles.calendarNavButton}>
              <Ionicons name="chevron-back" size={18} color={colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleToday} style={[flStyles.todayButton, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[flStyles.todayButtonText, { color: colors.textSecondary }]}>Today</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleNextWeek} style={flStyles.calendarNavButton}>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={flStyles.weekDaysRow}>
          {weekDays.map((weekDay, index) => {
            const selected = isSelectedDate(weekDay.date);
            const hasTasks = dayHasTasks(weekDay.date);

            const showDot = hasTasks;

            return (
              <TouchableOpacity
                key={index}
                style={[flStyles.dayBox, { backgroundColor: colors.card, borderColor: colors.border }, selected && flStyles.dayBoxSelected]}
                onPress={() => setSelectedDate(weekDay.date)}
                activeOpacity={0.7}
              >
                <Text style={[flStyles.dayName, { color: colors.textMuted }, selected && flStyles.dayNameSelected]}>
                  {weekDay.dayName}
                </Text>
                <Text style={[flStyles.dayNumber, { color: colors.textPrimary }, selected && flStyles.dayNumberSelected]}>
                  {weekDay.dayNumber}
                </Text>
                {showDot ? (
                  <View style={[
                    flStyles.dayDot,
                    { backgroundColor: selected ? COLORS.white : COLORS.primary },
                  ]} />
                ) : (
                  <View style={flStyles.dayDotPlaceholder} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Jobs Header */}
      <View style={flStyles.jobsSection}>
        <View style={flStyles.jobsHeader}>
          <Text style={[flStyles.jobsTitle, { color: colors.textPrimary }]}>Today's Jobs</Text>
          <View style={[flStyles.jobsCount, { backgroundColor: colors.surfaceRaised }]}>
            <Text style={[flStyles.jobsCountText, { color: colors.textSecondary }]}>{filteredTasks.length}</Text>
          </View>
        </View>
      </View>
    </>
  ), [stats, weekDays, currentWeekStart, filteredTasks.length, selectedDate, taskDateSet, user?.firstName, colors]);

  const renderTask = useCallback(({ item }: { item: Task }) => (
    <View style={flStyles.taskItemWrapper}>
      <TaskCard task={item} onPress={() => handleTaskPress(item)} />
    </View>
  ), [handleTaskPress]);

  const listEmpty = useMemo(() => (
    <View style={[flStyles.emptyJobsInList, { backgroundColor: colors.card }]}>
      <Text style={[flStyles.emptyJobsText, { color: colors.textMuted }]}>No jobs scheduled for this day</Text>
    </View>
  ), [colors]);

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={() => fetchTasks()} />;

  return (
    <View style={[sharedStyles.container, { backgroundColor: colors.surface }]}>
      <FlatList
        data={filteredTasks}
        renderItem={renderTask}
        keyExtractor={item => item.id}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        ListFooterComponent={<View style={{ height: SPACING.xl }} />}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
        contentContainerStyle={flStyles.flatListContent}
      />
    </View>
  );
}

const flStyles = StyleSheet.create({
  // Calendar Section
  calendarSection: {
    marginTop: SPACING.xxl,
    paddingHorizontal: SPACING.lg,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  calendarMonth: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.semibold,
  },
  calendarNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  calendarNavButton: {
    padding: SPACING.xs,
  },
  todayButton: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm - 2,
    borderRadius: RADIUS.sm - 2,
    borderWidth: 1,
  },
  todayButtonText: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.medium,
  },
  weekDaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: SPACING.xs,
  },
  dayBox: {
    alignItems: 'center',
    flex: 1,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xs,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  dayBoxSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  dayName: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
  },
  dayNameSelected: {
    color: 'rgba(255,255,255,0.7)',
  },
  dayNumber: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.semibold,
    marginVertical: 10,
  },
  dayNumberSelected: {
    color: COLORS.white,
  },
  dayDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dayDotPlaceholder: {
    width: 6,
    height: 6,
  },

  // Jobs Section
  jobsSection: {
    marginTop: SPACING.xxl,
    paddingHorizontal: SPACING.lg,
  },
  jobsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  jobsTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.semibold,
  },
  jobsCount: {
    paddingHorizontal: 10,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.md,
  },
  jobsCountText: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semibold,
  },
  emptyJobsText: {
    fontSize: FONT_SIZE.base,
  },
  flatListContent: {
    flexGrow: 1,
  },
  taskItemWrapper: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  emptyJobsInList: {
    borderRadius: RADIUS.md,
    padding: SPACING.xxxl,
    alignItems: 'center',
    marginHorizontal: SPACING.lg,
  },
});
