import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '../../../src/contexts/auth-context';
import { tasksApi, type Task } from '../../../src/lib/api';
import { TaskCard } from '../../../src/components';
import {
  COLORS,
  SPACING,
  RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
  SHADOWS,
  ROUTES,
} from '../../../src/lib/constants';
import { getStatusStyle } from '../../../src/lib/styles';
import { formatTimeRange, getWeekDays, isSameDay, isWeekend } from '../../../src/lib/utils';

// Month names for calendar header
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function HomeScreen() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentWeekStart, setCurrentWeekStart] = useState(new Date());

  const initialFetchDoneRef = useRef(false);
  const fetchingRef = useRef(false);

  // Get week days using shared utility
  const weekDays = useMemo(() => getWeekDays(), [currentWeekStart]);

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
      completed: tasks.filter(t => t.status === 'COMPLETED').length,
      pending: tasks.filter(t => t.status === 'ASSIGNED' || t.status === 'NEW').length,
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

  // Check if day has tasks
  const dayHasTasks = useCallback((date: Date) => {
    const day = new Date(date);
    day.setHours(0, 0, 0, 0);
    const nextDay = new Date(day);
    nextDay.setDate(nextDay.getDate() + 1);

    return tasks.some(task => {
      if (!task.dueDate) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return day.getTime() === today.getTime();
      }
      const dueDate = new Date(task.dueDate);
      return dueDate >= day && dueDate < nextDay;
    });
  }, [tasks]);

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

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={COLORS.error} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => fetchTasks()}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* Stats Cards */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <View style={styles.statRow}>
              <View style={[styles.statIcon, { backgroundColor: COLORS.primaryLight }]}>
                <Ionicons name="today" size={18} color={COLORS.primary} />
              </View>
              <Text style={styles.statNumber}>{stats.todaysTasks}</Text>
            </View>
            <Text style={styles.statLabel}>Today's Tasks</Text>
          </View>
          <View style={styles.statCard}>
            <View style={styles.statRow}>
              <View style={[styles.statIcon, { backgroundColor: COLORS.amberLight }]}>
                <Ionicons name="flash" size={18} color={COLORS.amber} />
              </View>
              <Text style={styles.statNumber}>{stats.urgentTasks}</Text>
            </View>
            <Text style={styles.statLabel}>Urgent Tasks</Text>
          </View>
          <View style={styles.statCard}>
            <View style={styles.statRow}>
              <View style={[styles.statIcon, { backgroundColor: COLORS.successLight }]}>
                <Ionicons name="checkmark-done" size={18} color={COLORS.success} />
              </View>
              <Text style={styles.statNumber}>{stats.completed}</Text>
            </View>
            <Text style={styles.statLabel}>Completed</Text>
          </View>
          <View style={styles.statCard}>
            <View style={styles.statRow}>
              <View style={[styles.statIcon, { backgroundColor: COLORS.warningLight }]}>
                <Ionicons name="hourglass-outline" size={18} color={COLORS.warning} />
              </View>
              <Text style={styles.statNumber}>{stats.pending}</Text>
            </View>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
        </View>

        {/* Calendar Section */}
        <View style={styles.calendarSection}>
          <View style={styles.calendarHeader}>
            <Text style={styles.calendarMonth}>
              {MONTH_NAMES[currentWeekStart.getMonth()]} {currentWeekStart.getFullYear()}
            </Text>
            <View style={styles.calendarNav}>
              <TouchableOpacity onPress={handlePrevWeek} style={styles.calendarNavButton}>
                <Ionicons name="chevron-back" size={18} color={COLORS.slate400} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleToday} style={styles.todayButton}>
                <Text style={styles.todayButtonText}>Today</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleNextWeek} style={styles.calendarNavButton}>
                <Ionicons name="chevron-forward" size={18} color={COLORS.slate400} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.weekDaysRow}>
            {weekDays.map((weekDay, index) => {
              const selected = isSelectedDate(weekDay.date);
              const hasTasks = dayHasTasks(weekDay.date);

              // Determine dot color: blue=working day, orange=has tasks, no dot for weekends
              let dotColor = null;
              let showDot = false;
              if (!weekDay.isWeekend) {
                showDot = true;
                dotColor = hasTasks ? COLORS.amber : COLORS.primary;
              }

              return (
                <TouchableOpacity
                  key={index}
                  style={[styles.dayBox, selected && styles.dayBoxSelected]}
                  onPress={() => setSelectedDate(weekDay.date)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.dayName, selected && styles.dayNameSelected]}>
                    {weekDay.dayName}
                  </Text>
                  <Text style={[styles.dayNumber, selected && styles.dayNumberSelected]}>
                    {weekDay.dayNumber}
                  </Text>
                  {showDot ? (
                    <View style={[
                      styles.dayDot,
                      { backgroundColor: selected ? COLORS.white : dotColor },
                    ]} />
                  ) : (
                    <View style={styles.dayDotPlaceholder} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Today's Jobs */}
        <View style={styles.jobsSection}>
          <View style={styles.jobsHeader}>
            <Text style={styles.jobsTitle}>Today's Jobs</Text>
            <View style={styles.jobsCount}>
              <Text style={styles.jobsCountText}>{filteredTasks.length}</Text>
            </View>
          </View>

          {filteredTasks.length === 0 ? (
            <View style={styles.emptyJobs}>
              <Text style={styles.emptyJobsText}>No jobs scheduled for this day</Text>
            </View>
          ) : (
            <View style={styles.tasksList}>
              {filteredTasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onPress={() => handleTaskPress(task)}
                />
              ))}
            </View>
          )}
        </View>

        {/* Bottom spacing for tab bar */}
        <View style={{ height: SPACING.xl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.slate50,
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xxxl,
  },
  errorText: {
    fontSize: FONT_SIZE.xl,
    color: COLORS.slate500,
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

  // Stats Grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    gap: SPACING.md,
  },
  statCard: {
    width: '47%',
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    padding: SPACING.md + 2,
    ...SHADOWS.md,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statNumber: {
    fontSize: FONT_SIZE.title,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.slate800,
  },
  statLabel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.slate500,
  },

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
    color: COLORS.slate800,
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
    borderColor: COLORS.slate200,
    backgroundColor: COLORS.white,
  },
  todayButtonText: {
    fontSize: FONT_SIZE.base,
    color: COLORS.slate500,
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
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.slate200,
  },
  dayBoxSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  dayName: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.slate400,
    fontWeight: FONT_WEIGHT.medium,
  },
  dayNameSelected: {
    color: 'rgba(255,255,255,0.7)',
  },
  dayNumber: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.slate800,
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
    color: COLORS.slate800,
  },
  jobsCount: {
    backgroundColor: COLORS.slate100,
    paddingHorizontal: 10,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.md,
  },
  jobsCountText: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.slate500,
  },
  emptyJobs: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    padding: SPACING.xxxl,
    alignItems: 'center',
  },
  emptyJobsText: {
    fontSize: FONT_SIZE.base,
    color: COLORS.slate400,
  },
  tasksList: {
    gap: SPACING.md,
  },
});
