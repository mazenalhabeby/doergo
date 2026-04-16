import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/auth-context';
import { useTheme } from '../../contexts/theme-context';
import { useToast } from '../../contexts/toast-context';
import {
  attendanceApi,
  tasksApi,
  TaskStatus,
  type AttendanceStatus,
  type BreakStatus,
  type CompanyLocation,
  type Task,
} from '../../lib/api';
import { TaskCard, LoadingState, ErrorState, LocationPickerSheet, Skeleton, ConfirmSheet } from '../../components';
import { WeekCalendar } from '../week-calendar';
import { ROUTES } from '../../lib/constants';
import {
  haversineDistance,
  formatDurationMinutes as formatDuration,
  formatTimeString as formatTime,
  isSameDay,
} from '../../lib/utils';
import { styles as sharedStyles, COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOWS } from './home-styles';

export function HybridHome() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const toast = useToast();

  // Loading states
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isClockLoading, setIsClockLoading] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);

  // Confirm sheet state
  const [showClockOutConfirm, setShowClockOutConfirm] = useState(false);

  // Attendance state
  const [attendanceStatus, setAttendanceStatus] = useState<AttendanceStatus | null>(null);
  const [breakStatus, setBreakStatus] = useState<BreakStatus | null>(null);
  const [elapsedMinutes, setElapsedMinutes] = useState(0);

  // Location state
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<CompanyLocation | null>(null);

  // Task state
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentWeekStart, setCurrentWeekStart] = useState(new Date());

  const initialFetchDoneRef = useRef(false);
  const fetchingRef = useRef(false);

  // ── Data Fetching ──────────────────────────────────────────────────
  const fetchData = useCallback(async (showRefresh = false) => {
    if (fetchingRef.current && !showRefresh) return;
    fetchingRef.current = true;

    try {
      if (showRefresh) setIsRefreshing(true);
      setError(null);

      // Fetch attendance + tasks in parallel
      const [statusData, breakData, fetchedTasks] = await Promise.all([
        attendanceApi.getStatus().catch(() => null),
        attendanceApi.getBreakStatus().catch(() => null),
        tasksApi.list(),
      ]);

      if (statusData) setAttendanceStatus(statusData);
      if (breakData) setBreakStatus(breakData);
      setTasks(fetchedTasks || []);

      // Update elapsed time
      if (statusData?.isClockedIn && statusData?.currentEntry) {
        const clockInTime = new Date(statusData.currentEntry.clockInAt).getTime();
        setElapsedMinutes(Math.floor((Date.now() - clockInTime) / 60000));
      } else {
        setElapsedMinutes(0);
      }
    } catch (err: any) {
      if (err?.statusCode === 401 || err?.message?.includes('Session expired')) return;
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      fetchingRef.current = false;
    }
  }, [t]);

  // Initial load
  useEffect(() => {
    if (initialFetchDoneRef.current) return;
    initialFetchDoneRef.current = true;
    fetchData();
  }, [fetchData]);

  // Refetch on focus
  useFocusEffect(
    useCallback(() => {
      if (!initialFetchDoneRef.current) return;
      fetchData();
    }, [fetchData])
  );

  // Update elapsed time every minute
  useEffect(() => {
    if (!attendanceStatus?.isClockedIn || !attendanceStatus?.currentEntry) return;
    const interval = setInterval(() => {
      const clockInTime = new Date(attendanceStatus.currentEntry!.clockInAt).getTime();
      setElapsedMinutes(Math.floor((Date.now() - clockInTime) / 60000));
    }, 60000);
    return () => clearInterval(interval);
  }, [attendanceStatus?.isClockedIn, attendanceStatus?.currentEntry]);

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

  // ── Attendance Actions ─────────────────────────────────────────────
  const getCurrentLocation = async () => {
    setIsGettingLocation(true);
    try {
      const { status: permStatus } = await Location.requestForegroundPermissionsAsync();
      if (permStatus !== 'granted') {
        toast.warning(t('home.fullTime.permissionDenied'), t('home.fullTime.locationPermissionRequired'));
        return null;
      }
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const loc = { lat: location.coords.latitude, lng: location.coords.longitude, accuracy: location.coords.accuracy || 0 };
      setCurrentLocation(loc);
      return loc;
    } catch {
      toast.error(t('home.fullTime.locationError'), t('home.fullTime.failedToGetLocation'));
      return null;
    } finally {
      setIsGettingLocation(false);
    }
  };

  const handleClockIn = async () => {
    if (!selectedLocation || !currentLocation) return;
    setIsClockLoading(true);
    try {
      await attendanceApi.clockIn({
        locationId: selectedLocation.id,
        lat: currentLocation.lat,
        lng: currentLocation.lng,
        accuracy: currentLocation.accuracy,
      });
      setLocationModalVisible(false);
      setSelectedLocation(null);
      await fetchData();
    } catch (err: any) {
      toast.error(t('common.error'), err.message || t('home.fullTime.failedToClockIn'));
    } finally {
      setIsClockLoading(false);
    }
  };

  const handleClockOut = () => {
    setShowClockOutConfirm(true);
  };

  const confirmClockOut = async () => {
    setShowClockOutConfirm(false);
    setIsClockLoading(true);
    try {
      const location = await getCurrentLocation();
      if (!location) { setIsClockLoading(false); return; }
      await attendanceApi.clockOut({ lat: location.lat, lng: location.lng, accuracy: location.accuracy });
      await fetchData();
    } catch (err: any) {
      toast.error(t('common.error'), err.message || t('home.fullTime.failedToClockOut'));
    } finally {
      setIsClockLoading(false);
    }
  };

  const openClockInModal = async () => {
    const location = await getCurrentLocation();
    if (location) setLocationModalVisible(true);
  };

  const getDistanceToLocation = (location: CompanyLocation): number | null => {
    if (!currentLocation) return null;
    return haversineDistance(currentLocation.lat, currentLocation.lng, location.lat, location.lng);
  };

  // ── Navigation ─────────────────────────────────────────────────────
  const handleTaskPress = (task: Task) => router.push(ROUTES.taskDetail(task.id));
  const handlePrevWeek = () => { const d = new Date(currentWeekStart); d.setDate(d.getDate() - 7); setCurrentWeekStart(d); };
  const handleNextWeek = () => { const d = new Date(currentWeekStart); d.setDate(d.getDate() + 7); setCurrentWeekStart(d); };
  const handleToday = () => { const today = new Date(); setCurrentWeekStart(today); setSelectedDate(today); };

  // ── Render ─────────────────────────────────────────────────────────
  const isClockedIn = attendanceStatus?.isClockedIn || false;

  const listHeader = useMemo(() => (
    <>
      {/* Welcome */}
      <View style={sharedStyles.welcomeSection}>
        <Text style={[sharedStyles.welcomeGreeting, { color: colors.textMuted }]}>
          {new Date().getHours() < 12 ? t('common.greeting.morning') : new Date().getHours() < 18 ? t('common.greeting.afternoon') : t('common.greeting.evening')}
        </Text>
        <Text style={[sharedStyles.welcomeName, { color: colors.textPrimary }]}>{user?.firstName}!</Text>
      </View>

      {/* Compact Attendance Card */}
      <View style={[
        hStyles.attendanceCard,
        isClockedIn ? hStyles.attendanceCardActive : { backgroundColor: colors.card },
      ]}>
        <View style={hStyles.attendanceRow}>
          <View style={hStyles.attendanceLeft}>
            <View style={[hStyles.statusDot, isClockedIn ? hStyles.dotActive : hStyles.dotInactive]} />
            <View>
              <Text style={[hStyles.attendanceStatus, isClockedIn && { color: COLORS.white }]}>
                {isClockedIn ? t('home.fullTime.clockedIn') : t('home.fullTime.clockedOut')}
              </Text>
              {isClockedIn && attendanceStatus?.currentEntry && (
                <Text style={hStyles.attendanceDetail}>
                  {attendanceStatus.currentEntry.location?.name || ''} · {formatDuration(elapsedMinutes)}
                  {breakStatus?.isOnBreak ? ` · ☕ ${t('home.fullTime.onBreak')}` : ''}
                </Text>
              )}
            </View>
          </View>
          <TouchableOpacity
            style={[hStyles.clockBtn, isClockedIn ? hStyles.clockOutBtn : hStyles.clockInBtn]}
            onPress={isClockedIn ? handleClockOut : openClockInModal}
            disabled={isClockLoading || isGettingLocation}
          >
            {isClockLoading || isGettingLocation ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <>
                <Ionicons name={isClockedIn ? 'log-out' : 'log-in'} size={16} color={COLORS.white} />
                <Text style={hStyles.clockBtnText}>
                  {isClockedIn ? t('home.fullTime.clockOut') : t('home.fullTime.clockIn')}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Task Stats */}
      <View style={sharedStyles.statsGrid}>
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
            <Text style={[sharedStyles.statNumber, { color: colors.textPrimary }]}>{stats.urgent}</Text>
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
      </View>

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
      <View style={hStyles.jobsSection}>
        <View style={hStyles.jobsHeader}>
          <Text style={[hStyles.jobsTitle, { color: colors.textPrimary }]}>{t('home.freelancer.todaysJobs')}</Text>
          <View style={[hStyles.jobsCount, { backgroundColor: colors.surfaceRaised }]}>
            <Text style={[hStyles.jobsCountText, { color: colors.textSecondary }]}>{filteredTasks.length}</Text>
          </View>
        </View>
      </View>
    </>
  ), [stats, currentWeekStart, filteredTasks.length, selectedDate, taskDateSet, user?.firstName,
      colors, t, isClockedIn, attendanceStatus, breakStatus, elapsedMinutes, isClockLoading, isGettingLocation]);

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
            onRefresh={() => fetchData(true)}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
        contentContainerStyle={{ flexGrow: 1 }}
      />

      <LocationPickerSheet
        visible={locationModalVisible}
        locations={attendanceStatus?.assignedLocations || []}
        selectedLocation={selectedLocation}
        onSelect={setSelectedLocation}
        onConfirm={handleClockIn}
        onClose={() => setLocationModalVisible(false)}
        getDistance={getDistanceToLocation}
        confirmLabel={t('home.fullTime.clockIn')}
        confirmDisabled={isClockLoading}
      />

      <ConfirmSheet
        visible={showClockOutConfirm}
        onClose={() => setShowClockOutConfirm(false)}
        onConfirm={confirmClockOut}
        title={t('home.fullTime.clockOutConfirmTitle')}
        message={t('home.fullTime.clockOutConfirmMessage')}
        confirmLabel={t('home.fullTime.clockOut')}
        cancelLabel={t('common.cancel')}
        variant="warning"
        icon="log-out"
      />
    </View>
  );
}

const hStyles = StyleSheet.create({
  // Compact Attendance Card
  attendanceCard: {
    marginHorizontal: SPACING.lg,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    ...SHADOWS.md,
  },
  attendanceCardActive: {
    backgroundColor: COLORS.primary,
  },
  attendanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  attendanceLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: SPACING.sm,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotActive: {
    backgroundColor: COLORS.success,
  },
  dotInactive: {
    backgroundColor: COLORS.slate300,
  },
  attendanceStatus: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.slate800,
  },
  attendanceDetail: {
    fontSize: FONT_SIZE.sm,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  clockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    gap: SPACING.xs,
  },
  clockInBtn: {
    backgroundColor: COLORS.primary,
  },
  clockOutBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  clockBtnText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.white,
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
