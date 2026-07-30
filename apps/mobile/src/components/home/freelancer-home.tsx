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
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/auth-context';
import { tasksApi, TaskStatus, type Task } from '../../lib/api';
import { TaskCard, LoadingState, ErrorState, Skeleton, ScreenContainer } from '../../components';
import { ROUTES } from '../../lib/constants';
import { isSameDay } from '../../lib/utils';
import { useTheme } from '../../contexts/theme-context';
import { WeekCalendar } from '../week-calendar';
import { TourTarget } from '../tour';
import { styles as sharedStyles, COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOWS } from './home-styles';

export function FreelancerHome() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentWeekStart, setCurrentWeekStart] = useState(new Date());

  const initialFetchDoneRef = useRef(false);
  const fetchingRef = useRef(false);
  const lastFetchTimeRef = useRef(0);

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

  // Helper to get local date string (YYYY-MM-DD) avoiding UTC timezone issues
  const toLocalDateStr = useCallback((d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, []);

  // Pre-compute task dates into a Set for O(1) lookups
  const taskDateSet = useMemo(() => {
    const dateSet = new Set<string>();
    const todayStr = toLocalDateStr(new Date());
    for (const task of tasks) {
      if (!task.dueDate) {
        dateSet.add(todayStr);
      } else {
        const dateStr = toLocalDateStr(new Date(task.dueDate));
        dateSet.add(dateStr);
      }
    }
    return dateSet;
  }, [tasks, toLocalDateStr]);

  const dayHasTasks = useCallback((date: Date) => {
    const dateStr = toLocalDateStr(date);
    return taskDateSet.has(dateStr);
  }, [taskDateSet, toLocalDateStr]);

  const fetchTasks = useCallback(async (showRefresh = false) => {
    if (fetchingRef.current && !showRefresh) return;

    try {
      lastFetchTimeRef.current = Date.now();
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
      setError(err instanceof Error ? err.message : t('tasks.failedToLoad'));
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
      if (Date.now() - lastFetchTimeRef.current < 30000) return;
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

  const listHeader = useMemo(() => (
    <>
      {/* Welcome Section */}
      <TourTarget name="home-greeting" style={sharedStyles.welcomeSection}>
        <Text style={[sharedStyles.welcomeGreeting, { color: colors.textMuted }]}>
          {new Date().getHours() < 12 ? t('common.greeting.morning') : new Date().getHours() < 18 ? t('common.greeting.afternoon') : t('common.greeting.evening')}
        </Text>
        <Text style={[sharedStyles.welcomeName, { color: colors.textPrimary }]}>{user?.firstName}!</Text>
      </TourTarget>

      {/* Stats Cards */}
      <TourTarget name="home-today" style={sharedStyles.statsGrid}>
        <View style={[sharedStyles.statCard, { backgroundColor: colors.card }]}>
          <View style={sharedStyles.statRow}>
            <View style={[sharedStyles.statIcon, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="today" size={18} color={COLORS.primary} />
            </View>
            <Text style={[sharedStyles.statNumber, { color: colors.textPrimary }]}>{stats.todaysTasks}</Text>
          </View>
          <Text style={[sharedStyles.statLabel, { color: colors.textMuted }]}>{t('home.freelancer.todaysTasks')}</Text>
        </View>
        <View style={[sharedStyles.statCard, { backgroundColor: colors.card }]}>
          <View style={sharedStyles.statRow}>
            <View style={[sharedStyles.statIcon, { backgroundColor: colors.amberLight }]}>
              <Ionicons name="flash" size={18} color={COLORS.amber} />
            </View>
            <Text style={[sharedStyles.statNumber, { color: colors.textPrimary }]}>{stats.urgentTasks}</Text>
          </View>
          <Text style={[sharedStyles.statLabel, { color: colors.textMuted }]}>{t('home.freelancer.urgentTasks')}</Text>
        </View>
        <View style={[sharedStyles.statCard, { backgroundColor: colors.card }]}>
          <View style={sharedStyles.statRow}>
            <View style={[sharedStyles.statIcon, { backgroundColor: colors.successLight }]}>
              <Ionicons name="checkmark-done" size={18} color={COLORS.success} />
            </View>
            <Text style={[sharedStyles.statNumber, { color: colors.textPrimary }]}>{stats.completed}</Text>
          </View>
          <Text style={[sharedStyles.statLabel, { color: colors.textMuted }]}>{t('home.freelancer.completed')}</Text>
        </View>
        <View style={[sharedStyles.statCard, { backgroundColor: colors.card }]}>
          <View style={sharedStyles.statRow}>
            <View style={[sharedStyles.statIcon, { backgroundColor: colors.warningLight }]}>
              <Ionicons name="hourglass-outline" size={18} color={COLORS.warning} />
            </View>
            <Text style={[sharedStyles.statNumber, { color: colors.textPrimary }]}>{stats.pending}</Text>
          </View>
          <Text style={[sharedStyles.statLabel, { color: colors.textMuted }]}>{t('home.freelancer.pending')}</Text>
        </View>
      </TourTarget>

      {/* Calendar Section */}
      <WeekCalendar
        taskDates={taskDateSet}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        currentWeekStart={currentWeekStart}
        onPrevWeek={handlePrevWeek}
        onNextWeek={handleNextWeek}
        onToday={handleToday}
      />

      {/* Jobs Header */}
      <TourTarget name="home-work" style={flStyles.jobsSection}>
        <View style={flStyles.jobsHeader}>
          <Text style={[flStyles.jobsTitle, { color: colors.textPrimary }]}>{t('home.freelancer.todaysJobs')}</Text>
          <View style={[flStyles.jobsCount, { backgroundColor: colors.surfaceRaised }]}>
            <Text style={[flStyles.jobsCountText, { color: colors.textSecondary }]}>{filteredTasks.length}</Text>
          </View>
        </View>
      </TourTarget>
    </>
  ), [stats, currentWeekStart, filteredTasks.length, selectedDate, taskDateSet, user?.firstName, colors, t]);

  const renderTask = useCallback(({ item }: { item: Task }) => (
    <View style={flStyles.taskItemWrapper}>
      <TaskCard task={item} onPress={() => handleTaskPress(item)} />
    </View>
  ), [handleTaskPress]);

  const listEmpty = useMemo(() => (
    <View style={[flStyles.emptyJobsInList, { backgroundColor: colors.card }]}>
      <Text style={[flStyles.emptyJobsText, { color: colors.textMuted }]}>{t('home.freelancer.noJobsScheduled')}</Text>
    </View>
  ), [colors, t]);

  if (isLoading) return (
    <View style={[sharedStyles.container, { backgroundColor: colors.surface }]}>
      <Skeleton.Dashboard />
    </View>
  );
  if (error) return <ErrorState message={error} onRetry={() => fetchTasks()} />;

  return (
    <View style={[sharedStyles.container, { backgroundColor: colors.surface }]}>
      <ScreenContainer width="content">
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
      </ScreenContainer>
    </View>
  );
}

const flStyles = StyleSheet.create({
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
