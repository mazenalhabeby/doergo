import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  FlatList,
} from 'react-native';
import { router, type Href } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/auth-context';
import { useTheme } from '../../contexts/theme-context';
import {
  attendanceApi,
  TaskStatus,
  type AttendanceStatus,
  type Task,
} from '../../lib/api';
import { useHomeTasks } from '../../offline/tasks/use-home-tasks';
import { OfflineBanner } from '../../offline/components/offline-banner';
import { FreshnessLabel } from '../../offline/components/freshness-label';
import { TaskCard, ErrorState, Skeleton, ScreenContainer } from '../../components';
import { ShiftClockCard } from './shift-clock-card';
import { OutOfRingHomeBanner } from '../out-of-ring-home-banner';
import { AlwaysLocationNudge } from '../always-location-nudge';
import { useExcursionSync } from '../../hooks/useExcursionSync';
import { WeekCalendar } from '../week-calendar';
import { TourTarget, useTourScroll } from '../tour';
import { ROUTES } from '../../lib/constants';
import { styles as sharedStyles, statChip, COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from './home-styles';
import { DocumentsReminderCard } from '../documents-reminder-card';
import { QuickActions } from './quick-actions';
import { TodayGlyph, UrgentGlyph, CompletedGlyph, PendingGlyph } from './glyphs';

export function HybridHome() {
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const tourScroll = useTourScroll();

  // Loading states
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Attendance state — kept here for the out-of-ring banner / location nudge.
  // The clock-in/out widget (ShiftClockCard) owns its own attendance state.
  const [attendanceStatus, setAttendanceStatus] = useState<AttendanceStatus | null>(null);

  /*
    The list, from the phone's copy when it has one. Read through the shared
    reader so this screen and the Tasks tab cannot disagree about the same
    jobs, and so a member with no signal opens their day instead of a timeout.
  */
  const { tasks, updatedAt: tasksUpdatedAt, load: loadTasks } = useHomeTasks();
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentWeekStart, setCurrentWeekStart] = useState(new Date());

  const initialFetchDoneRef = useRef(false);
  const fetchingRef = useRef(false);

  // ── Data Fetching ──────────────────────────────────────────────────
  const fetchData = useCallback(async (showRefresh = false) => {
    if (fetchingRef.current && !showRefresh) return;
    fetchingRef.current = true;
    lastFetchTimeRef.current = Date.now();

    try {
      if (showRefresh) setIsRefreshing(true);
      setError(null);

      // Attendance + tasks in parallel. Attendance already degrades quietly;
      // the list now falls back to this phone rather than failing the screen.
      const [statusData] = await Promise.all([
        attendanceApi.getStatus().catch(() => null),
        loadTasks(),
      ]);

      if (statusData) setAttendanceStatus(statusData);
    } catch (err: any) {
      if (err?.statusCode === 401 || err?.message?.includes('Session expired')) return;
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      fetchingRef.current = false;
    }
  }, [loadTasks, t]);

  // Initial load
  useEffect(() => {
    if (initialFetchDoneRef.current) return;
    initialFetchDoneRef.current = true;
    fetchData();
  }, [fetchData]);

  // Refetch on focus — throttled (skip if fetched < 30s ago)
  const lastFetchTimeRef = useRef(0);
  useFocusEffect(
    useCallback(() => {
      if (!initialFetchDoneRef.current) return;
      if (Date.now() - lastFetchTimeRef.current < 30000) return;
      fetchData();
    }, [fetchData])
  );

  // Live out-of-ring updates (admin approve/reject, background heartbeat) so the
  // home banner reflects state changes without a manual pull-to-refresh.
  useExcursionSync(() => fetchData(), user?.id);

  // ── Task Helpers ───────────────────────────────────────────────────
  const toLocalDateStr = useCallback((d: Date) => {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const taskDateSet = useMemo(() => {
    const dateSet = new Set<string>();
    const todayStr = toLocalDateStr(new Date());
    for (const task of tasks) {
      dateSet.add(task.dueDate ? toLocalDateStr(new Date(task.dueDate)) : todayStr);
    }
    return dateSet;
  }, [tasks, toLocalDateStr]);

  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const todaysTasks = tasks.filter(task => {
      if (!task.dueDate) return true;
      const d = new Date(task.dueDate);
      return d >= today && d < tomorrow;
    });
    return {
      todaysTasks: todaysTasks.length,
      urgent: tasks.filter(t => t.priority === 'URGENT' || t.priority === 'HIGH').length,
      completed: tasks.filter(t => t.status === TaskStatus.COMPLETED).length,
      pending: tasks.filter(t => t.status === TaskStatus.ASSIGNED || t.status === TaskStatus.NEW).length,
    };
  }, [tasks]);

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
      const d = new Date(task.dueDate);
      return d >= selected && d < nextDay;
    });
  }, [tasks, selectedDate]);

  // ── Navigation ─────────────────────────────────────────────────────
  const handleTaskPress = (task: Task) => router.push(ROUTES.taskDetail(task.id));
  const handlePrevWeek = () => { const d = new Date(currentWeekStart); d.setDate(d.getDate() - 7); setCurrentWeekStart(d); };
  const handleNextWeek = () => { const d = new Date(currentWeekStart); d.setDate(d.getDate() + 7); setCurrentWeekStart(d); };
  const handleToday = () => { const today = new Date(); setCurrentWeekStart(today); setSelectedDate(today); };

  // ── Render ─────────────────────────────────────────────────────────
  const isClockedIn = attendanceStatus?.isClockedIn || false;

  const listHeader = useMemo(() => (
    <>
      {/* What the network means right now — the same line the Tasks tab and
          the task screen carry, in the same place. Quiet when online with
          nothing waiting, which is the normal case. */}
      <OfflineBanner style={hStyles.offlineBanner} />

      {/* Welcome */}
      <TourTarget name="home-greeting" style={sharedStyles.welcomeSection}>
        <Text style={[sharedStyles.welcomeGreeting, { color: colors.textMuted }]}>
          {new Date().getHours() < 12 ? t('common.greeting.morning') : new Date().getHours() < 18 ? t('common.greeting.afternoon') : t('common.greeting.evening')}
        </Text>
        <Text style={[sharedStyles.welcomeName, { color: colors.textPrimary }]}>{user?.firstName}!</Text>
        {/* When the list was last brought up to date — shown only while it is
            being read from this phone. */}
        {tasksUpdatedAt !== null && <FreshnessLabel at={tasksUpdatedAt} />}
      </TourTarget>

      {/* Outstanding personal documents, once, at the top — see the component
          for why it is not on every screen. Renders nothing when there are
          none, which is the normal case. */}
      <DocumentsReminderCard />

      {/* Out-of-ring banner (needs reason / pending / approved countdown) */}
      <OutOfRingHomeBanner
        excursion={attendanceStatus?.activeExcursion}
        onPress={() => router.push('/(app)/(tabs)/attendance' as Href)}
      />
      <AlwaysLocationNudge active={isClockedIn && attendanceStatus?.currentEntry?.location?.lat != null} />

      {/* Shift clock widget (self-contained: owns its own attendance state + sheets) */}
      <ShiftClockCard onChanged={() => fetchData()} />

      {/* The personal doors — after the block about today, before the lists. */}
      <QuickActions />

      {/* Task Stats */}
      <TourTarget name="home-today" style={sharedStyles.statsGrid}>
        <View style={[sharedStyles.statCard, { backgroundColor: colors.card }]}>
          <View style={sharedStyles.statRow}>
            <View style={[sharedStyles.statIcon, statChip(colors, isDark)]}>
              <TodayGlyph size={20} color={colors.textPrimary} />
            </View>
            <Text style={[sharedStyles.statNumber, { color: colors.textPrimary }]}>{stats.todaysTasks}</Text>
          </View>
          <Text style={[sharedStyles.statLabel, { color: colors.textMuted }]}>{t('home.freelancer.todaysTasks')}</Text>
        </View>
        <View style={[sharedStyles.statCard, { backgroundColor: colors.card }]}>
          <View style={sharedStyles.statRow}>
            <View style={[sharedStyles.statIcon, statChip(colors, isDark)]}>
              <UrgentGlyph size={20} color={colors.textPrimary} />
            </View>
            <Text style={[sharedStyles.statNumber, { color: colors.textPrimary }]}>{stats.urgent}</Text>
          </View>
          <Text style={[sharedStyles.statLabel, { color: colors.textMuted }]}>{t('home.freelancer.urgentTasks')}</Text>
        </View>
        <View style={[sharedStyles.statCard, { backgroundColor: colors.card }]}>
          <View style={sharedStyles.statRow}>
            <View style={[sharedStyles.statIcon, statChip(colors, isDark)]}>
              <CompletedGlyph size={20} color={colors.textPrimary} />
            </View>
            <Text style={[sharedStyles.statNumber, { color: colors.textPrimary }]}>{stats.completed}</Text>
          </View>
          <Text style={[sharedStyles.statLabel, { color: colors.textMuted }]}>{t('home.freelancer.completed')}</Text>
        </View>
        <View style={[sharedStyles.statCard, { backgroundColor: colors.card }]}>
          <View style={sharedStyles.statRow}>
            <View style={[sharedStyles.statIcon, statChip(colors, isDark)]}>
              <PendingGlyph size={20} color={colors.textPrimary} />
            </View>
            <Text style={[sharedStyles.statNumber, { color: colors.textPrimary }]}>{stats.pending}</Text>
          </View>
          <Text style={[sharedStyles.statLabel, { color: colors.textMuted }]}>{t('home.freelancer.pending')}</Text>
        </View>
      </TourTarget>

      {/* Calendar */}
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
      <TourTarget name="home-work" style={hStyles.jobsSection}>
        <View style={hStyles.jobsHeader}>
          <Text style={[hStyles.jobsTitle, { color: colors.textPrimary }]}>{t('home.freelancer.todaysJobs')}</Text>
          <View style={[hStyles.jobsCount, { backgroundColor: colors.surfaceRaised }]}>
            <Text style={[hStyles.jobsCountText, { color: colors.textSecondary }]}>{filteredTasks.length}</Text>
          </View>
        </View>
      </TourTarget>
    </>
  ), [stats, currentWeekStart, filteredTasks.length, selectedDate, taskDateSet, tasksUpdatedAt, user?.firstName,
      colors, isDark, t, isClockedIn, attendanceStatus]);

  const renderTask = useCallback(({ item }: { item: Task }) => (
    <View style={hStyles.taskItemWrapper}>
      <TaskCard task={item} onPress={() => handleTaskPress(item)} />
    </View>
  ), []);

  const listEmpty = useMemo(() => (
    <View style={[hStyles.emptyJobs, { backgroundColor: colors.card }]}>
      <Text style={[hStyles.emptyJobsText, { color: colors.textMuted }]}>{t('home.freelancer.noJobsScheduled')}</Text>
    </View>
  ), [colors, t]);

  if (isLoading) return (
    <View style={[sharedStyles.container, { backgroundColor: colors.surface }]}>
      <Skeleton.Dashboard />
    </View>
  );
  if (error) return <ErrorState message={error} onRetry={() => fetchData()} />;

  return (
    <View style={[sharedStyles.container, { backgroundColor: colors.surface }]}>
      <ScreenContainer width="content">
      <FlatList
        // Lets the guided tour scroll a target into view before spotlighting it:
        // most of this screen's tour anchors live in the list header, below the
        // fold, and the engine cannot scroll a list it was never handed.
        {...tourScroll}
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
            onRefresh={() => fetchData(true)}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
        contentContainerStyle={{ flexGrow: 1 }}
      />
      </ScreenContainer>
    </View>
  );
}

const hStyles = StyleSheet.create({
  offlineBanner: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
  },
  // Task List
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
  taskItemWrapper: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  emptyJobs: {
    borderRadius: RADIUS.md,
    padding: SPACING.xxxl,
    alignItems: 'center',
    marginHorizontal: SPACING.lg,
  },
  emptyJobsText: {
    fontSize: FONT_SIZE.base,
  },
});
