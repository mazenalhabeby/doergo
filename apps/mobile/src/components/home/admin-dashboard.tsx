import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../contexts/auth-context';
import { useTheme } from '../../contexts/theme-context';
import { tasksApi, TaskStatus, type Task } from '../../lib/api';
import { TaskCard, LoadingState, ErrorState, Skeleton } from '../../components';
import { ROUTES } from '../../lib/constants';
import { isSameDay } from '../../lib/utils';
import { WeekCalendar } from '../week-calendar';
import { styles, COLORS, SPACING, FONT_SIZE, FONT_WEIGHT, RADIUS, SHADOWS } from './home-styles';

export function AdminDashboard() {
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentWeekStart, setCurrentWeekStart] = useState(new Date());
  const initialFetchDoneRef = useRef(false);
  const fetchingRef = useRef(false);

  // Build task date set for calendar dots
  const taskDateSet = useMemo(() => {
    const dateSet = new Set<string>();
    const pad = (n: number) => String(n).padStart(2, '0');
    const todayStr = (() => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; })();
    for (const task of tasks) {
      if (!task.dueDate) {
        dateSet.add(todayStr);
      } else {
        const d = new Date(task.dueDate);
        dateSet.add(`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`);
      }
    }
    return dateSet;
  }, [tasks]);

  const handlePrevWeek = useCallback(() => {
    setCurrentWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; });
  }, []);
  const handleNextWeek = useCallback(() => {
    setCurrentWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; });
  }, []);
  const handleToday = useCallback(() => {
    const today = new Date();
    setCurrentWeekStart(today);
    setSelectedDate(today);
  }, []);

  const stats = useMemo(() => {
    return {
      total: tasks.length,
      inProgress: tasks.filter(t =>
        [TaskStatus.IN_PROGRESS, TaskStatus.EN_ROUTE, TaskStatus.ARRIVED].includes(t.status)
      ).length,
      completed: tasks.filter(t => t.status === TaskStatus.COMPLETED || t.status === TaskStatus.CLOSED).length,
      pending: tasks.filter(t =>
        [TaskStatus.NEW, TaskStatus.ASSIGNED, TaskStatus.ACCEPTED].includes(t.status)
      ).length,
    };
  }, [tasks]);

  // Tasks for selected calendar date
  const selectedDayTasks = useMemo(() => {
    const sel = new Date(selectedDate);
    sel.setHours(0, 0, 0, 0);
    const next = new Date(sel);
    next.setDate(next.getDate() + 1);
    return tasks.filter(task => {
      if (!task.dueDate) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return sel.getTime() === today.getTime();
      }
      const d = new Date(task.dueDate);
      return d >= sel && d < next;
    });
  }, [tasks, selectedDate]);

  const recentTasks = useMemo(() => {
    return [...tasks]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 5);
  }, [tasks]);

  const fetchTasks = useCallback(async (showRefresh = false) => {
    if (fetchingRef.current && !showRefresh) return;
    try {
      fetchingRef.current = true;
      if (showRefresh) setIsRefreshing(true);
      else setIsLoading(true);
      setError(null);
      const fetchedTasks = await tasksApi.list();
      setTasks(fetchedTasks || []);
    } catch (err: any) {
      if (err?.statusCode === 401 || err?.message?.includes('Session expired')) return;
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

  const handleTaskPress = (task: Task) => {
    router.push(ROUTES.taskDetail(task.id));
  };

  if (isLoading) return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <Skeleton.Dashboard />
    </View>
  );
  if (error) return <ErrorState message={error} onRetry={() => fetchTasks()} />;

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => fetchTasks(true)}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* Welcome */}
        <View style={styles.welcomeSection}>
          <Text style={[styles.welcomeGreeting, { color: colors.textMuted }]}>
            Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'},
          </Text>
          <Text style={[styles.welcomeName, { color: colors.textPrimary }]}>{user?.firstName}!</Text>
        </View>

        {/* Stats Card */}
        <View style={[adminStyles.hubCard, { backgroundColor: colors.card }]}>
          <View style={adminStyles.statsStrip}>
            {([
              { n: stats.total, label: 'Total', color: colors.textPrimary },
              { n: stats.inProgress, label: 'Active', color: COLORS.amber },
              { n: stats.completed, label: 'Done', color: COLORS.success },
              { n: stats.pending, label: 'Pending', color: COLORS.purple },
            ] as const).map((s, i) => (
              <View key={i} style={adminStyles.statCell}>
                <Text style={[adminStyles.statNum, { color: s.color }]}>{s.n}</Text>
                <Text style={[adminStyles.statLbl, { color: colors.textMuted }]}>{s.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Week Calendar */}
        <WeekCalendar
          taskDates={taskDateSet}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          currentWeekStart={currentWeekStart}
          onPrevWeek={handlePrevWeek}
          onNextWeek={handleNextWeek}
          onToday={handleToday}
        />

        {/* Selected Day Tasks */}
        <View style={adminStyles.dayTasksSection}>
          <View style={adminStyles.dayTasksHeader}>
            <Text style={[adminStyles.dayTasksTitle, { color: colors.textPrimary }]}>
              {isSameDay(selectedDate, new Date()) ? "Today's Tasks" : selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </Text>
            <View style={[adminStyles.dayTasksCount, { backgroundColor: colors.surfaceRaised }]}>
              <Text style={[adminStyles.dayTasksCountText, { color: colors.textSecondary }]}>{selectedDayTasks.length}</Text>
            </View>
          </View>
          {selectedDayTasks.length === 0 ? (
            <View style={[adminStyles.emptyDay, { backgroundColor: colors.card }]}>
              <Ionicons name="calendar-outline" size={24} color={colors.textMuted} />
              <Text style={[adminStyles.emptyDayText, { color: colors.textMuted }]}>No tasks scheduled</Text>
            </View>
          ) : (
            <View style={adminStyles.dayTasksList}>
              {selectedDayTasks.map(task => (
                <TaskCard key={task.id} task={task} onPress={() => handleTaskPress(task)} showAssignee showPriority />
              ))}
            </View>
          )}
        </View>

        {/* Recent Tasks */}
        <View style={adminStyles.recentSection}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Recent Tasks</Text>
          {recentTasks.length === 0 ? (
            <View style={[adminStyles.emptyRecent, { backgroundColor: colors.card }]}>
              <Text style={[adminStyles.emptyRecentText, { color: colors.textMuted }]}>No tasks yet. Create one to get started!</Text>
            </View>
          ) : (
            <View style={adminStyles.recentList}>
              {recentTasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onPress={() => handleTaskPress(task)}
                  showAssignee
                  showPriority
                />
              ))}
            </View>
          )}
        </View>

        <View style={{ height: SPACING.xl }} />
      </ScrollView>
    </View>
  );
}

const adminStyles = StyleSheet.create({
  // Combined hub card
  hubCard: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
  },
  // Stats strip
  statsStrip: {
    flexDirection: 'row',
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
  },
  statNum: {
    fontSize: 22,
    fontWeight: FONT_WEIGHT.bold,
    lineHeight: 26,
  },
  statLbl: {
    fontSize: 11,
    fontWeight: FONT_WEIGHT.medium,
    marginTop: 2,
  },
  recentSection: {
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.xxl,
  },
  recentList: {
    gap: SPACING.md,
  },
  emptyRecent: {
    borderRadius: RADIUS.md,
    padding: SPACING.xxxl,
    alignItems: 'center',
  },
  emptyRecentText: {
    fontSize: FONT_SIZE.base,
    textAlign: 'center',
  },
  // Day tasks (below calendar)
  dayTasksSection: {
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.xl,
  },
  dayTasksHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  dayTasksTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.semibold,
  },
  dayTasksCount: {
    paddingHorizontal: 10,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.md,
  },
  dayTasksCountText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
  },
  emptyDay: {
    borderRadius: RADIUS.md,
    padding: SPACING.xxl,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  emptyDayText: {
    fontSize: FONT_SIZE.base,
  },
  dayTasksList: {
    gap: SPACING.md,
  },
});
