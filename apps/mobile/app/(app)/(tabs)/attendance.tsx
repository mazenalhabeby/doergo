import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Animated,
  useWindowDimensions,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import * as Location from 'expo-location';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter, Href } from 'expo-router';
import {
  COLORS,
  SPACING,
  RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
  SHADOWS,
} from '../../../src/lib/constants';
import {
  attendanceApi,
  AttendanceStatus,
  TimeEntry,
  CompanyLocation,
  BreakStatus,
  BreakType,
  GeofenceExcursion,
} from '../../../src/lib/api';
import { useAuth } from '../../../src/contexts/auth-context';
import { tierAllows, countryFromTz } from '@hbcfield/shared/client';
import { useToast } from '../../../src/contexts/toast-context';
import { useTheme } from '../../../src/contexts/theme-context';
import { LoadingState, ErrorState, LocationPickerSheet, ClockOutSheet, ScreenContainer, PressableScale } from '../../../src/components';
import { WorkLogSheet } from '../../../src/components/worklog-sheet';
import { ReportIssueSheet, ShiftIssueThreadSheet, ShiftIssueListSheet } from '../../../src/components/shift-issue-sheet';
import { OutOfRingSheet } from '../../../src/components/out-of-ring-sheet';
import { AlwaysLocationNudge } from '../../../src/components/always-location-nudge';
import { useExcursionSync } from '../../../src/hooks/useExcursionSync';
import { useClockIn } from '../../../src/hooks/useClockIn';
import { TourTarget } from '../../../src/components/tour';
import { startBackgroundHeartbeat, stopBackgroundHeartbeat } from '../../../src/services/background-heartbeat';
import { startGeofenceForSpace, stopGeofence } from '../../../src/services/background-geofence';
import { overtimeApi, OvertimeRequest } from '../../../src/lib/api';
import {
  formatDurationMinutes as formatDuration,
} from '../../../src/lib/utils';
import { useTimeFormat } from '../../../src/hooks/useTimeFormat';

export default function AttendanceScreen() {
  const { user } = useAuth();
  // formatDateRelative is locale- and timezone-aware: the history date label
  // resolves its calendar day in the ENTRY's zone, so it always agrees with the
  // zoned time shown beside it (a night shift no longer straddles two dates).
  const { formatTime, formatDateRelative: formatDate } = useTimeFormat();
  const router = useRouter();
  const toast = useToast();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Attendance state
  const [status, setStatus] = useState<AttendanceStatus | null>(null);
  const [history, setHistory] = useState<TimeEntry[]>([]);
  const [breakStatus, setBreakStatus] = useState<BreakStatus | null>(null);
  const [isBreakLoading, setIsBreakLoading] = useState(false);

  // Clock-in location/remote state lives in the shared useClockIn hook (below).
  const [breakModalVisible, setBreakModalVisible] = useState(false);
  const [pendingBreakType, setPendingBreakType] = useState<BreakType | null>(null);
  const [breakNotes, setBreakNotes] = useState('');
  const [isEndingBreak, setIsEndingBreak] = useState(false);

  // Confirm sheet state
  const [showClockOutConfirm, setShowClockOutConfirm] = useState(false);
  // Which session's activity sheet is open (active session OR a history row).
  const [worklogEntryId, setWorklogEntryId] = useState<string | null>(null);
  // Shift Issues: report a blocker + open its live thread.
  const [reportIssueOpen, setReportIssueOpen] = useState(false);
  const [issueThreadId, setIssueThreadId] = useState<string | null>(null);
  const [issueListOpen, setIssueListOpen] = useState(false);

  // Geofence warning state
  const [isOutsideGeofence, setIsOutsideGeofence] = useState(false);
  const [geofenceDistance, setGeofenceDistance] = useState(0);

  // Out-of-ring excursion state (the reason → approval → grace workflow)
  const [activeExcursion, setActiveExcursion] = useState<GeofenceExcursion | null>(null);
  const [excursionSheetVisible, setExcursionSheetVisible] = useState(false);
  const [reportingExcursion, setReportingExcursion] = useState(false);
  const [excursionCountdown, setExcursionCountdown] = useState('');

  // Overtime state
  const [activeOvertime, setActiveOvertime] = useState<OvertimeRequest | null>(null);

  // Break bottom sheet animation. useWindowDimensions re-renders on rotation
  // (Dimensions.get is a one-time snapshot that goes stale on tablets).
  const { height: SCREEN_HEIGHT } = useWindowDimensions();
  const breakSlideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const breakOverlayAnim = useRef(new Animated.Value(0)).current;


  const openBreakModal = useCallback(() => {
    setBreakModalVisible(true);
    Animated.parallel([
      Animated.timing(breakOverlayAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.spring(breakSlideAnim, { toValue: 0, damping: 25, stiffness: 200, useNativeDriver: true }),
    ]).start();
  }, [breakSlideAnim, breakOverlayAnim]);

  const closeBreakModal = useCallback(() => {
    Animated.parallel([
      Animated.timing(breakOverlayAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(breakSlideAnim, { toValue: SCREEN_HEIGHT, duration: 250, useNativeDriver: true }),
    ]).start(() => {
      setBreakModalVisible(false);
    });
  }, [breakSlideAnim, breakOverlayAnim, SCREEN_HEIGHT]);

  // Timer for current shift
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  // Timer for active break
  const [breakElapsedMinutes, setBreakElapsedMinutes] = useState(0);

  // Attendance is available for all users with the clock module enabled
  const isFullTimeTechnician = true;

  const lastFetchTimeRef = useRef(0);

  // Fetch attendance data - use allSettled to handle partial failures gracefully
  const fetchAttendanceData = useCallback(async () => {
    try {
      lastFetchTimeRef.current = Date.now();
      setError(null);
      const results = await Promise.allSettled([
        attendanceApi.getStatus(),
        attendanceApi.getHistory({ limit: 10 }),
        attendanceApi.getBreakStatus(),
        overtimeApi.getActive(),
      ]);

      const statusData = results[0].status === 'fulfilled' ? results[0].value : null;
      const historyData = results[1].status === 'fulfilled' ? results[1].value : null;
      const breakData = results[2].status === 'fulfilled' ? results[2].value : null;

      if (statusData) {
        setStatus(statusData);
        setActiveExcursion(statusData.activeExcursion ?? null);
      }
      if (historyData) {
        // fetchWithAuth unwraps { data: T } → T, so historyData is already TimeEntry[]
        const entries = Array.isArray(historyData) ? historyData : (historyData as any).data || [];
        setHistory(entries);
      }
      if (breakData) setBreakStatus(breakData);

      const overtimeData = results[3].status === 'fulfilled' ? results[3].value : null;
      setActiveOvertime(overtimeData);

      // Calculate elapsed time if clocked in
      if (statusData?.isClockedIn && statusData?.currentEntry) {
        const clockInTime = new Date(statusData.currentEntry.clockInAt).getTime();
        const now = Date.now();
        setElapsedMinutes(Math.floor((now - clockInTime) / 60000));
      } else {
        setElapsedMinutes(0);
      }

      // Calculate break elapsed time if on break
      if (breakData?.isOnBreak && breakData?.currentBreak?.startedAt) {
        const breakStartTime = new Date(breakData.currentBreak.startedAt).getTime();
        const now = Date.now();
        setBreakElapsedMinutes(Math.floor((now - breakStartTime) / 60000));
      } else {
        setBreakElapsedMinutes(0);
      }

      // Show error only if all requests failed
      const allFailed = results.every((r) => r.status === 'rejected');
      if (allFailed) {
        const firstErr = (results[0] as PromiseRejectedResult).reason;
        setError(firstErr instanceof Error ? firstErr.message : t('attendance.failedToLoadAttendance'));
      }
    } catch (err) {
      console.error('Error fetching attendance:', err);
      setError(err instanceof Error ? err.message : t('attendance.failedToLoadAttendance'));
    }
  }, []);

  // Initial load
  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      await fetchAttendanceData();
      setIsLoading(false);
    };
    load();
  }, [fetchAttendanceData]);

  // Refetch when tab gets focus (e.g. after clocking in/out on home tab)
  const initialLoadDone = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!initialLoadDone.current) {
        initialLoadDone.current = true;
        return;
      }
      if (Date.now() - lastFetchTimeRef.current < 30000) return;
      fetchAttendanceData();
    }, [fetchAttendanceData])
  );

  // Heartbeat: send location to server every 5 min while clocked in.
  // The server NO LONGER auto-clocks-out; instead it drives the out-of-ring
  // excursion state machine and returns the active excursion (if any).
  const sendHeartbeat = useCallback(async () => {
    if (!status?.isClockedIn) {
      setIsOutsideGeofence(false);
      setActiveExcursion(null);
      return;
    }
    try {
      const { status: permStatus } = await Location.requestForegroundPermissionsAsync();
      if (permStatus !== 'granted') return;

      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const result = await attendanceApi.heartbeat({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy || undefined,
      });

      // Legacy safety: a very old client could still see autoClockedOut — but the
      // server never sets it now. Kept defensively.
      if (result.autoClockedOut) {
        await stopBackgroundHeartbeat();
        await stopGeofence();
        await fetchAttendanceData();
        return;
      }

      setIsOutsideGeofence(!result.inRing);
      setGeofenceDistance(result.distance);
      setActiveExcursion(result.activeExcursion ?? null);
    } catch {
      // Ignore heartbeat errors silently
    }
  }, [status?.isClockedIn, fetchAttendanceData]);

  // Submit an out-of-ring reason + duration (OUT_UNREPORTED → PENDING).
  const handleReportExcursion = useCallback(
    async (reason: string, minutes: number) => {
      setReportingExcursion(true);
      try {
        const updated = await attendanceApi.reportExcursion(reason, minutes);
        setActiveExcursion(updated);
        setExcursionSheetVisible(false);
        toast.success(t('attendance.outOfRing.submittedTitle'), t('attendance.outOfRing.submittedBody'));
      } catch (e: any) {
        toast.error(t('common.error'), e?.message || t('attendance.outOfRing.submitError'));
      } finally {
        setReportingExcursion(false);
      }
    },
    [toast, t],
  );

  // Send heartbeat on tab focus + ensure background tracking is running
  useFocusEffect(
    useCallback(() => {
      sendHeartbeat();
      // Resume background tracking if clocked in but tracking stopped (e.g. app restart)
      if (status?.isClockedIn) {
        startBackgroundHeartbeat();
        // Re-arm native geofencing on the clocked-in space so out-of-ring is
        // detected instantly even when the app is killed.
        startGeofenceForSpace(status.currentEntry?.location as any);
      }
    }, [sendHeartbeat, status?.isClockedIn, status?.currentEntry?.location])
  );

  // Send heartbeat every 5 minutes while clocked in
  useEffect(() => {
    if (!status?.isClockedIn) return;

    const interval = setInterval(sendHeartbeat, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [status?.isClockedIn, sendHeartbeat]);

  // Live countdown for an APPROVED out-of-ring grace timer.
  useEffect(() => {
    if (activeExcursion?.status !== 'APPROVED' || !activeExcursion.expiresAt) {
      setExcursionCountdown('');
      return;
    }
    const target = new Date(activeExcursion.expiresAt).getTime();
    const tick = () => {
      const ms = Math.max(0, target - Date.now());
      const total = Math.floor(ms / 1000);
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const s = total % 60;
      const pad = (n: number) => String(n).padStart(2, '0');
      setExcursionCountdown(h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [activeExcursion?.status, activeExcursion?.expiresAt]);

  // Detect out-of-ring immediately once we know we're clocked in — a heartbeat
  // is what OPENS an excursion, and getStatus alone never creates one, so without
  // this the worker had to pull-to-refresh to trigger detection.
  useEffect(() => {
    if (status?.isClockedIn) sendHeartbeat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.isClockedIn]);

  // Live updates: when the server changes THIS worker's excursion (e.g. an admin
  // approves/rejects, or a background heartbeat opens/closes one), refresh the
  // status so the banner/countdown updates without a manual pull-to-refresh.
  const onExcursionEvent = useCallback(() => {
    fetchAttendanceData();
  }, [fetchAttendanceData]);
  useExcursionSync(onExcursionEvent, user?.id);

  // Update elapsed time every minute
  useEffect(() => {
    if (!status?.isClockedIn || !status?.currentEntry) return;

    const interval = setInterval(() => {
      const clockInTime = new Date(status.currentEntry!.clockInAt).getTime();
      const now = Date.now();
      setElapsedMinutes(Math.floor((now - clockInTime) / 60000));
    }, 60000);

    return () => clearInterval(interval);
  }, [status?.isClockedIn, status?.currentEntry]);

  // Update break elapsed time every second for live timer
  useEffect(() => {
    if (!breakStatus?.isOnBreak || !breakStatus?.currentBreak?.startedAt) {
      setBreakElapsedMinutes(0);
      return;
    }

    const updateBreakTimer = () => {
      const breakStartTime = new Date(breakStatus.currentBreak!.startedAt).getTime();
      const now = Date.now();
      setBreakElapsedMinutes(Math.floor((now - breakStartTime) / 60000));
    };

    // Update immediately
    updateBreakTimer();

    // Then update every 30 seconds
    const interval = setInterval(updateBreakTimer, 30000);

    return () => clearInterval(interval);
  }, [breakStatus?.isOnBreak, breakStatus?.currentBreak?.startedAt]);

  // Pull to refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchAttendanceData();
    setIsRefreshing(false);
  };

  // Shared clock-in flow (GPS + location/remote picker) — one implementation
  // across the attendance tab and both home screens. (DRY)
  const clockIn = useClockIn({
    assignedLocations: status?.assignedLocations || [],
    onClockedIn: () => fetchAttendanceData(),
  });

  // Handle clock out
  const handleClockOut = () => {
    setShowClockOutConfirm(true);
  };

  const confirmClockOut = async (notes: string) => {
    setShowClockOutConfirm(false);
    setIsActionLoading(true);
    try {
      const location = await clockIn.getCurrentLocation();
      await attendanceApi.clockOut({
        lat: location?.lat || 0,
        lng: location?.lng || 0,
        accuracy: location?.accuracy,
        notes: notes || undefined,
      });
      // Stop background heartbeat + geofence
      await stopBackgroundHeartbeat();
      await stopGeofence();
      await fetchAttendanceData();
      toast.success(t('common.success'), t('attendance.clockedOutSuccess'));
    } catch (err) {
      console.error('Clock out error:', err);
      toast.error(t('common.error'), err instanceof Error ? err.message : t('attendance.failedToClockOut'));
    } finally {
      setIsActionLoading(false);
    }
  };

  // ── Shift reminder responses ──────────────────────────────────────────────
  const [showForgotSheet, setShowForgotSheet] = useState(false);
  const [isReminderLoading, setIsReminderLoading] = useState(false);

  // "I forgot to clock out" — self-report actual leave time.
  const resolveForgot = async (clockOutAt: Date) => {
    const entry = status?.currentEntry;
    if (!entry) return;
    setShowForgotSheet(false);
    setIsReminderLoading(true);
    try {
      await attendanceApi.resolveForgotClockOut(entry.id, clockOutAt.toISOString());
      await stopBackgroundHeartbeat();
      await stopGeofence();
      await fetchAttendanceData();
      toast.success(t('common.success'), t('shiftReminder.resolveSuccess'));
    } catch (err) {
      toast.error(t('common.error'), err instanceof Error ? err.message : t('shiftReminder.resolveFailed'));
    } finally {
      setIsReminderLoading(false);
    }
  };

  // "I'm working extra time" — routes to a leader for approval.
  const handleRequestExtraTime = async () => {
    const entry = status?.currentEntry;
    if (!entry) return;
    setIsReminderLoading(true);
    try {
      await attendanceApi.requestExtraTime(entry.id);
      await fetchAttendanceData();
      toast.success(t('common.success'), t('shiftReminder.extraRequestSent'));
    } catch (err) {
      toast.error(t('common.error'), err instanceof Error ? err.message : t('shiftReminder.extraRequestFailed'));
    } finally {
      setIsReminderLoading(false);
    }
  };

  // Handle start break - show modal for notes
  const handleStartBreak = (type: BreakType) => {
    setPendingBreakType(type);
    setBreakNotes('');
    setIsEndingBreak(false);
    openBreakModal();
  };

  // Handle end break - show modal for notes
  const handleEndBreak = () => {
    setPendingBreakType(null);
    setBreakNotes('');
    setIsEndingBreak(true);
    openBreakModal();
  };

  // Confirm start break with notes
  const confirmStartBreak = async () => {
    if (!pendingBreakType) return;
    closeBreakModal();
    setIsBreakLoading(true);
    try {
      await attendanceApi.startBreak(pendingBreakType, breakNotes || undefined);
      await fetchAttendanceData();
      toast.success(t('attendance.breaks.breakStarted'), t('attendance.breaks.breakStartedMessage', { type: pendingBreakType.toLowerCase() }));
    } catch (err) {
      console.error('Start break error:', err);
      toast.error(t('common.error'), err instanceof Error ? err.message : t('attendance.breaks.failedToStartBreak'));
    } finally {
      setIsBreakLoading(false);
      setPendingBreakType(null);
      setBreakNotes('');
    }
  };

  // Confirm end break with notes
  const confirmEndBreak = async () => {
    closeBreakModal();
    setIsBreakLoading(true);
    try {
      await attendanceApi.endBreak(breakNotes || undefined);
      await fetchAttendanceData();
      toast.info(t('attendance.breaks.breakEnded'), t('attendance.breaks.breakEndedMessage'));
    } catch (err) {
      console.error('End break error:', err);
      toast.error(t('common.error'), err instanceof Error ? err.message : t('attendance.breaks.failedToEndBreak'));
    } finally {
      setIsBreakLoading(false);
      setIsEndingBreak(false);
      setBreakNotes('');
    }
  };

  // Distance helper for the on-screen assigned-locations list (from the hook).
  const getDistanceToLocation = clockIn.getDistanceToLocation;

  // Format distance
  const formatDistance = (meters: number): string => {
    if (meters < 1000) return `${Math.round(meters)}m`;
    return `${(meters / 1000).toFixed(1)}km`;
  };

  // Not a FULL_TIME technician
  if (!isFullTimeTechnician) {
    return (
      <View style={[styles.container, { backgroundColor: colors.surface }]}>
        <View style={[styles.notAvailable, { backgroundColor: colors.surface }]}>
          <Ionicons name="information-circle-outline" size={64} color={colors.textMuted} />
          <Text style={[styles.notAvailableTitle, { color: colors.textPrimary }]}>{t('attendance.notAvailable.title')}</Text>
          <Text style={[styles.notAvailableText, { color: colors.textSecondary }]}>
            {t('attendance.notAvailable.message')}
          </Text>
        </View>
      </View>
    );
  }

  // Loading state
  if (isLoading) return <LoadingState message={t('attendance.loadingAttendance')} />;

  // Error state
  if (error) return <ErrorState message={error} onRetry={handleRefresh} />;

  const isClockedIn = status?.isClockedIn || false;
  const currentEntry = status?.currentEntry;
  const assignedLocations = status?.assignedLocations || [];

  // Shift reminder: has the shift ended while still clocked in?
  const reminderState = currentEntry?.reminderState ?? 'NONE';
  const expectedEnd = currentEntry?.expectedClockOutAt
    ? new Date(currentEntry.expectedClockOutAt)
    : null;
  const shiftHasEnded = !!expectedEnd && expectedEnd.getTime() <= Date.now();
  // Prompt the worker when the backend flagged them (REMINDED/ESCALATED) or when the
  // expected end has simply passed and nothing has happened yet (NONE + past end).
  const showReminderPrompt =
    isClockedIn &&
    (reminderState === 'REMINDED' ||
      reminderState === 'ESCALATED' ||
      (reminderState === 'NONE' && shiftHasEnded));
  const showOvertimePending = isClockedIn && reminderState === 'OVERTIME_PENDING';
  const showOvertimeApproved = isClockedIn && reminderState === 'OVERTIME_APPROVED';

  // Extra-time (overtime) is a Professional+ capability. Under-tier orgs still
  // get reminders and can "forgot to clock out", but the extra-time request +
  // leader approval flow is hidden (backend enforces the same 402).
  const hasShiftScheduling = tierAllows(user?.planTier, 'shift_scheduling');

  // Leaders (anyone who manages users) get an entry point to the approval screen.
  // Backend is the real gate; this just hides it from plain field workers.
  const canApproveExtraTime = !!user?.canManageUsers && hasShiftScheduling;

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <ScreenContainer width="content">
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
        {/* Status Card */}
        <View style={[styles.statusCard, { backgroundColor: colors.card }]}>
          <TourTarget name="attendance-header" style={styles.statusHeader}>
            <View
              style={[
                styles.statusIndicator,
                { backgroundColor: isClockedIn ? COLORS.success : COLORS.slate400 },
              ]}
            />
            <Text style={[styles.statusTitle, { color: colors.textPrimary }]}>
              {isClockedIn ? t('attendance.clockedIn') : t('attendance.clockedOut')}
            </Text>
          </TourTarget>

          {/* Nudge to "Always" location — background detection needs it */}
          <AlwaysLocationNudge active={isClockedIn && status?.currentEntry?.location?.lat != null} />

          {/* Out-of-ring: needs a reason (OUT_UNREPORTED) */}
          {isClockedIn && activeExcursion?.status === 'OUT_UNREPORTED' && (
            <View style={styles.geofenceWarning}>
              <Ionicons name="navigate" size={20} color={COLORS.amber} />
              <View style={styles.geofenceWarningTextContainer}>
                <Text style={styles.geofenceWarningTitle}>
                  {t('attendance.outOfRing.bannerOutTitle', { space: status?.currentEntry?.location?.name ?? t('attendance.unknownLocation') })}
                </Text>
                <Text style={styles.geofenceWarningSubtitle}>
                  {t('attendance.outOfRing.bannerOutBody')}
                </Text>
              </View>
              <TouchableOpacity style={styles.geofenceClockOutButton} onPress={() => setExcursionSheetVisible(true)}>
                <Text style={styles.geofenceClockOutText}>{t('attendance.outOfRing.tellUsWhy')}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Out-of-ring: waiting for approval (PENDING) */}
          {isClockedIn && activeExcursion?.status === 'PENDING' && (
            <View style={styles.geofenceWarning}>
              <Ionicons name="hourglass-outline" size={20} color={COLORS.amber} />
              <View style={styles.geofenceWarningTextContainer}>
                <Text style={styles.geofenceWarningTitle}>{t('attendance.outOfRing.bannerPendingTitle')}</Text>
                <Text style={styles.geofenceWarningSubtitle}>
                  {t('attendance.outOfRing.bannerPendingBody', { minutes: activeExcursion.requestedMinutes ?? '?' })}
                </Text>
              </View>
            </View>
          )}

          {/* Out-of-ring: approved, live countdown (APPROVED) */}
          {isClockedIn && activeExcursion?.status === 'APPROVED' && (
            <View style={[styles.geofenceWarning, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
              <Ionicons name="timer-outline" size={20} color={COLORS.success} />
              <View style={styles.geofenceWarningTextContainer}>
                <Text style={[styles.geofenceWarningTitle, { color: '#065F46' }]}>
                  {t('attendance.outOfRing.bannerApprovedTitle')}
                </Text>
                <Text style={[styles.geofenceWarningSubtitle, { color: '#047857' }]}>
                  {excursionCountdown
                    ? t('attendance.outOfRing.bannerApprovedBody', { time: excursionCountdown })
                    : t('attendance.outOfRing.timeExpired')}
                </Text>
              </View>
            </View>
          )}

          {/* Legacy geofence warning (no ring/excursion but device reports outside) */}
          {isClockedIn && !activeExcursion && isOutsideGeofence && (
            <View style={styles.geofenceWarning}>
              <Ionicons name="warning" size={20} color={COLORS.amber} />
              <View style={styles.geofenceWarningTextContainer}>
                <Text style={styles.geofenceWarningTitle}>
                  {t('attendance.outsideGeofence')}
                </Text>
                <Text style={styles.geofenceWarningSubtitle}>
                  {t('attendance.outsideGeofenceDistance', { distance: geofenceDistance })}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.geofenceClockOutButton}
                onPress={handleClockOut}
              >
                <Text style={styles.geofenceClockOutText}>{t('attendance.clockOut')}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Overtime Banner */}
          {activeOvertime && ['PENDING_TECHNICIAN', 'PENDING_APPROVAL', 'APPROVED'].includes(activeOvertime.status) && (
            <TouchableOpacity
              style={[styles.overtimeBanner, {
                backgroundColor: activeOvertime.status === 'APPROVED' ? '#ECFDF5' : '#FEF3C7',
                borderColor: activeOvertime.status === 'APPROVED' ? '#A7F3D0' : '#FDE68A',
              }]}
              onPress={() => router.push(`/overtime/${activeOvertime.id}` as Href)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={activeOvertime.status === 'APPROVED' ? 'time' : 'alarm'}
                size={22}
                color={activeOvertime.status === 'APPROVED' ? '#059669' : '#D97706'}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.overtimeBannerTitle, { color: activeOvertime.status === 'APPROVED' ? '#065F46' : '#92400E' }]}>
                  {activeOvertime.status === 'PENDING_TECHNICIAN' ? t('overtime.promptTitle') :
                   activeOvertime.status === 'PENDING_APPROVAL' ? t('overtime.waitingApproval') :
                   t('overtime.overtimeActive')}
                </Text>
                <Text style={[styles.overtimeBannerSub, { color: activeOvertime.status === 'APPROVED' ? '#047857' : '#A16207' }]}>
                  {t('overtime.tapToView')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={activeOvertime.status === 'APPROVED' ? '#059669' : '#D97706'} />
            </TouchableOpacity>
          )}

          {/* Shift-reminder: shift ended, still clocked in — prompt for response */}
          {showReminderPrompt && (
            <View style={[styles.reminderCard, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}>
              <View style={styles.reminderHeader}>
                <Ionicons name="alarm" size={22} color="#D97706" />
                <Text style={styles.reminderTitle}>{t('shiftReminder.shiftEndedTitle')}</Text>
              </View>
              <Text style={styles.reminderSubtitle}>{t('shiftReminder.shiftEndedSubtitle')}</Text>
              <TouchableOpacity
                style={styles.reminderPrimaryBtn}
                onPress={() => setShowForgotSheet(true)}
                disabled={isReminderLoading}
                activeOpacity={0.7}
              >
                <Ionicons name="log-out-outline" size={18} color="#fff" />
                <Text style={styles.reminderPrimaryText}>{t('shiftReminder.forgotClockOut')}</Text>
              </TouchableOpacity>
              {hasShiftScheduling && (
                <TouchableOpacity
                  style={styles.reminderSecondaryBtn}
                  onPress={handleRequestExtraTime}
                  disabled={isReminderLoading}
                  activeOpacity={0.7}
                >
                  {isReminderLoading ? (
                    <ActivityIndicator size="small" color="#92400E" />
                  ) : (
                    <>
                      <Ionicons name="time-outline" size={18} color="#92400E" />
                      <Text style={styles.reminderSecondaryText}>{t('shiftReminder.workingExtra')}</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Extra time pending leader approval */}
          {showOvertimePending && (
            <View style={[styles.reminderCard, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
              <View style={styles.reminderHeader}>
                <ActivityIndicator size="small" color="#2563EB" />
                <Text style={[styles.reminderTitle, { color: '#1E3A8A' }]}>{t('shiftReminder.waitingApprovalTitle')}</Text>
              </View>
              <Text style={[styles.reminderSubtitle, { color: '#1D4ED8' }]}>{t('shiftReminder.waitingApprovalSubtitle')}</Text>
            </View>
          )}

          {/* Extra time approved — new end time */}
          {showOvertimeApproved && (
            <View style={[styles.reminderCard, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
              <View style={styles.reminderHeader}>
                <Ionicons name="checkmark-circle" size={22} color="#059669" />
                <Text style={[styles.reminderTitle, { color: '#065F46' }]}>{t('shiftReminder.extraApprovedTitle')}</Text>
              </View>
              {expectedEnd && (
                <Text style={[styles.reminderSubtitle, { color: '#047857' }]}>
                  {t('shiftReminder.extraApprovedSubtitle', { time: formatTime(currentEntry!.expectedClockOutAt!, (currentEntry?.timezone ?? currentEntry?.location?.timezone)) })}
                </Text>
              )}
            </View>
          )}

          {/* Leader entry point: approve extra time for the team */}
          {canApproveExtraTime && (
            <TouchableOpacity
              style={[styles.leaderEntry, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
              onPress={() => router.push('/extra-time' as Href)}
              activeOpacity={0.7}
            >
              <View style={[styles.leaderEntryIcon, { backgroundColor: COLORS.primary + '15' }]}>
                <Ionicons name="checkmark-done-outline" size={20} color={COLORS.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.leaderEntryTitle, { color: colors.textPrimary }]}>{t('shiftReminder.openEntryPoint')}</Text>
                <Text style={[styles.leaderEntrySub, { color: colors.textMuted }]}>{t('shiftReminder.openEntryPointDesc')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}

          {isClockedIn && currentEntry && (
            <TourTarget name="attendance-status" style={[styles.currentShiftInfo, { borderTopColor: colors.border }]}>
              <View style={styles.shiftDetail}>
                <Ionicons name="location-outline" size={18} color={colors.textSecondary} />
                <Text style={[styles.shiftDetailText, { color: colors.textSecondary }]}>
                  {currentEntry.location?.name || t('common.unknownLocation')}
                  {!!countryFromTz((currentEntry.timezone ?? currentEntry.location?.timezone), i18n.language) &&
                    ` · ${countryFromTz((currentEntry.timezone ?? currentEntry.location?.timezone), i18n.language)}`}
                </Text>
              </View>
              <View style={styles.shiftDetail}>
                <Ionicons name="time-outline" size={18} color={colors.textSecondary} />
                <Text style={[styles.shiftDetailText, { color: colors.textSecondary }]}>
                  {t('attendance.startedAt', { time: formatTime(currentEntry.clockInAt, (currentEntry.timezone ?? currentEntry.location?.timezone)) })}
                </Text>
              </View>
              <View style={styles.elapsedTimeContainer}>
                <Text style={[styles.elapsedTimeLabel, { color: colors.textMuted }]}>{t('attendance.timeOnShift')}</Text>
                <Text style={styles.elapsedTime}>{formatDuration(elapsedMinutes)}</Text>
              </View>

              {/* Break Section */}
              {breakStatus?.isOnBreak === true ? (
                <View style={[styles.breakSection, { borderTopColor: colors.border }]}>
                  <View style={[styles.breakActiveIndicator, { backgroundColor: colors.amberLight }]}>
                    <Ionicons name="cafe" size={20} color={COLORS.amber} />
                    <Text style={styles.breakActiveText}>
                      {t('attendance.breaks.onBreak', { type: breakStatus.currentBreak?.type?.toLowerCase() })}
                    </Text>
                  </View>
                  {/* Live Break Timer */}
                  <View style={styles.breakTimerContainer}>
                    <Text style={styles.breakTimerLabel}>{t('attendance.breaks.breakDuration')}</Text>
                    <Text style={styles.breakTimerValue}>{formatDuration(breakElapsedMinutes)}</Text>
                  </View>
                  {breakStatus.currentBreak?.startedAt && (
                    <Text style={[styles.breakTimeText, { color: colors.textSecondary }]}>
                      {t('attendance.startedAt', { time: formatTime(breakStatus.currentBreak.startedAt, (currentEntry?.timezone ?? currentEntry?.location?.timezone)) })}
                    </Text>
                  )}
                  <TouchableOpacity
                    style={styles.endBreakButton}
                    onPress={handleEndBreak}
                    disabled={isBreakLoading}
                  >
                    {isBreakLoading ? (
                      <ActivityIndicator color={COLORS.white} size="small" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle-outline" size={20} color={COLORS.white} />
                        <Text style={styles.endBreakButtonText}>{t('attendance.breaks.endBreak')}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={[styles.breakSection, { borderTopColor: colors.border }]}>
                  <Text style={[styles.breakSectionTitle, { color: colors.textSecondary }]}>{t('attendance.breaks.takeABreak')}</Text>
                  <View style={styles.breakButtonsRow}>
                    <PressableScale
                      style={[styles.breakTypeButton, { backgroundColor: colors.primaryLight }]}
                      onPress={() => handleStartBreak(BreakType.LUNCH)}
                      disabled={isBreakLoading}
                    >
                      <Ionicons name="restaurant-outline" size={20} color={COLORS.primary} />
                      <Text style={styles.breakTypeButtonText}>{t('attendance.breaks.lunch')}</Text>
                    </PressableScale>
                    <PressableScale
                      style={[styles.breakTypeButton, { backgroundColor: colors.primaryLight }]}
                      onPress={() => handleStartBreak(BreakType.SHORT)}
                      disabled={isBreakLoading}
                    >
                      <Ionicons name="cafe-outline" size={20} color={COLORS.primary} />
                      <Text style={styles.breakTypeButtonText}>{t('attendance.breaks.short')}</Text>
                    </PressableScale>
                    <PressableScale
                      style={[styles.breakTypeButton, { backgroundColor: colors.primaryLight }]}
                      onPress={() => handleStartBreak(BreakType.OTHER)}
                      disabled={isBreakLoading}
                    >
                      <Ionicons name="time-outline" size={20} color={COLORS.primary} />
                      <Text style={styles.breakTypeButtonText}>{t('attendance.breaks.other')}</Text>
                    </PressableScale>
                  </View>
                  {(breakStatus?.totalBreakMinutes ?? 0) > 0 && (
                    <Text style={[styles.totalBreakText, { color: colors.textMuted }]}>
                      {t('attendance.breaks.totalBreakTime', { duration: formatDuration(breakStatus!.totalBreakMinutes) })}
                    </Text>
                  )}
                </View>
              )}
            </TourTarget>
          )}

          {/* Action Button */}
          <TourTarget name="attendance-clock">
          <TouchableOpacity
            style={[
              styles.actionButton,
              { backgroundColor: isClockedIn ? COLORS.primaryDark : COLORS.primary },
            ]}
            onPress={isClockedIn ? handleClockOut : clockIn.openClockInModal}
            disabled={isActionLoading || clockIn.isBusy}
          >
            {isActionLoading || clockIn.isBusy ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <>
                <Ionicons
                  name={isClockedIn ? 'log-out-outline' : 'log-in-outline'}
                  size={24}
                  color={COLORS.white}
                />
                <Text style={styles.actionButtonText}>
                  {isClockedIn ? t('attendance.clockOut') : t('attendance.clockIn')}
                </Text>
              </>
            )}
          </TouchableOpacity>
          </TourTarget>

          {/* Quick actions — grouped INSIDE the shift card (not floating below it) */}
          <View style={[styles.cardActions, { borderTopColor: colors.border }]}>
            {isClockedIn && currentEntry?.id && (
              <PressableScale onPress={() => setWorklogEntryId(currentEntry.id)} style={styles.cardAction}>
                <View style={[styles.cardActionIcon, { backgroundColor: colors.surfaceRaised }]}>
                  <Ionicons name="list-outline" size={20} color={COLORS.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardActionTitle, { color: colors.textPrimary }]}>{t('worklog.button', 'Activity')}</Text>
                  <Text style={[styles.cardActionSub, { color: colors.textMuted }]}>{t('worklog.tabHint', 'Log what you did today')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </PressableScale>
            )}
            {isClockedIn && currentEntry?.id && (
              <PressableScale onPress={() => setReportIssueOpen(true)} style={[styles.cardAction, styles.cardActionRow, { borderTopColor: colors.border }]}>
                <View style={[styles.cardActionIcon, { backgroundColor: 'rgba(239,68,68,0.14)' }]}>
                  <Ionicons name="warning-outline" size={20} color="#ef4444" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardActionTitle, { color: colors.textPrimary }]}>Report an issue</Text>
                  <Text style={[styles.cardActionSub, { color: colors.textMuted }]}>Blocked by something you can't fix?</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </PressableScale>
            )}
            <PressableScale onPress={() => setIssueListOpen(true)} style={[styles.cardAction, (isClockedIn && !!currentEntry?.id) && styles.cardActionRow, { borderTopColor: colors.border }]}>
              <View style={[styles.cardActionIcon, { backgroundColor: colors.surfaceRaised }]}>
                <Ionicons name="chatbubbles-outline" size={20} color={COLORS.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardActionTitle, { color: colors.textPrimary }]}>My issues</Text>
                <Text style={[styles.cardActionSub, { color: colors.textMuted }]}>Open a reported issue to read or reply</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </PressableScale>
          </View>
        </View>

        {/* Assigned Locations */}
        {!isClockedIn && assignedLocations.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('attendance.assignedLocations')}</Text>
            {assignedLocations.map((location) => {
              const distance = getDistanceToLocation(location);
              const isWithinGeofence = distance !== null && distance <= location.geofenceRadius;
              return (
                <View key={location.id} style={[styles.locationCard, { backgroundColor: colors.card }]}>
                  <View style={styles.locationInfo}>
                    <View style={styles.locationHeader}>
                      <Ionicons name="business-outline" size={20} color={COLORS.primary} />
                      <Text style={[styles.locationName, { color: colors.textPrimary }]}>{location.name}</Text>
                    </View>
                    <Text style={[styles.locationAddress, { color: colors.textSecondary }]} numberOfLines={2}>
                      {location.address}
                    </Text>
                    {distance !== null && (
                      <View style={styles.distanceRow}>
                        <Ionicons
                          name={isWithinGeofence ? 'checkmark-circle' : 'navigate-outline'}
                          size={16}
                          color={isWithinGeofence ? COLORS.success : COLORS.slate400}
                        />
                        <Text
                          style={[
                            styles.distanceText,
                            { color: isWithinGeofence ? COLORS.success : COLORS.slate500 },
                          ]}
                        >
                          {t('attendance.away', { distance: formatDistance(distance) })}
                          {isWithinGeofence && ` ${t('attendance.withinRange')}`}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Today's Breaks */}
        {isClockedIn && Array.isArray(breakStatus?.todayBreaks) && breakStatus.todayBreaks.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('attendance.todaysBreaks')}</Text>
            {breakStatus.todayBreaks.map((breakItem: any, index: number) => (
              <View key={breakItem.id || index} style={[styles.breakHistoryCard, { backgroundColor: colors.card }]}>
                <View style={styles.breakHistoryHeader}>
                  <View style={[styles.breakTypeTag, { backgroundColor: colors.primaryLight }]}>
                    <Ionicons
                      name={
                        breakItem.type === 'LUNCH'
                          ? 'restaurant-outline'
                          : breakItem.type === 'SHORT'
                          ? 'cafe-outline'
                          : 'time-outline'
                      }
                      size={14}
                      color={COLORS.primary}
                    />
                    <Text style={styles.breakTypeTagText}>
                      {breakItem.type?.charAt(0) + breakItem.type?.slice(1).toLowerCase()}
                    </Text>
                  </View>
                  {!breakItem.endedAt ? (
                    <View style={[styles.breakActiveBadge, { backgroundColor: colors.amberLight }]}>
                      <Text style={styles.breakActiveBadgeText}>{t('attendance.history.statusActive')}</Text>
                    </View>
                  ) : (
                    <Text style={[styles.breakDurationText, { color: colors.textPrimary }]}>
                      {formatDuration(breakItem.durationMinutes || 0)}
                    </Text>
                  )}
                </View>
                <View style={styles.breakHistoryTimes}>
                  <Text style={[styles.breakHistoryTimeText, { color: colors.textSecondary }]}>
                    {formatTime(breakItem.startedAt, (currentEntry?.timezone ?? currentEntry?.location?.timezone))}
                    {breakItem.endedAt && ` - ${formatTime(breakItem.endedAt, (currentEntry?.timezone ?? currentEntry?.location?.timezone))}`}
                  </Text>
                </View>
                {!!breakItem.notes && (
                  <Text style={[styles.breakNotesText, { color: colors.textMuted }]}>{breakItem.notes}</Text>
                )}
              </View>
            ))}
            {breakStatus.totalBreakMinutes > 0 && (
              <View style={[styles.totalBreakSummary, { backgroundColor: colors.surfaceRaised }]}>
                <Text style={[styles.totalBreakSummaryLabel, { color: colors.textSecondary }]}>{t('attendance.breaks.totalBreakTimeToday')}</Text>
                <Text style={styles.totalBreakSummaryValue}>
                  {formatDuration(breakStatus.totalBreakMinutes)}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Recent History */}
        <TourTarget name="attendance-history" style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('attendance.history.title')}</Text>

          {history.length === 0 ? (
            <View style={[styles.emptyState, { backgroundColor: colors.card }]}>
              <Ionicons name="calendar-outline" size={48} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>{t('attendance.history.noRecords')}</Text>
            </View>
          ) : (
            history.map((entry) => (
              <PressableScale
                key={entry.id}
                onPress={() => setWorklogEntryId(entry.id)}
                style={[styles.historyCard, { backgroundColor: colors.card }]}
              >
                <View style={styles.historyHeader}>
                  <Text style={[styles.historyDate, { color: colors.textPrimary }]}>{formatDate(entry.clockInAt, (entry.timezone ?? entry.location?.timezone))}</Text>
                  <View
                    style={[
                      styles.historyStatusBadge,
                      {
                        backgroundColor:
                          entry.status === 'CLOCKED_IN'
                            ? COLORS.successLight
                            : entry.status === 'AUTO_OUT'
                            ? COLORS.warningLight
                            : COLORS.slate100,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.historyStatusText,
                        {
                          color:
                            entry.status === 'CLOCKED_IN'
                              ? COLORS.success
                              : entry.status === 'AUTO_OUT'
                              ? COLORS.warning
                              : COLORS.slate600,
                        },
                      ]}
                    >
                      {entry.status === 'CLOCKED_IN'
                        ? t('attendance.history.statusActive')
                        : entry.status === 'AUTO_OUT'
                        ? t('attendance.history.statusAuto')
                        : t('attendance.history.statusDone')}
                    </Text>
                  </View>
                </View>

                <Text style={[styles.historyLocation, { color: colors.textSecondary }]}>
                  {entry.location?.name || t('common.unknownLocation')}
                  {!!countryFromTz((entry.timezone ?? entry.location?.timezone), i18n.language) &&
                    ` · ${countryFromTz((entry.timezone ?? entry.location?.timezone), i18n.language)}`}
                </Text>

                <View style={styles.historyTimes}>
                  <View style={styles.historyTimeItem}>
                    <Text style={[styles.historyTimeLabel, { color: colors.textMuted }]}>{t('attendance.history.in')}</Text>
                    <Text style={[styles.historyTimeValue, { color: colors.textPrimary }]}>
                      {formatTime(entry.clockInAt, (entry.timezone ?? entry.location?.timezone))}
                    </Text>
                  </View>
                  {entry.clockOutAt && (
                    <View style={styles.historyTimeItem}>
                      <Text style={[styles.historyTimeLabel, { color: colors.textMuted }]}>{t('attendance.history.out')}</Text>
                      <Text style={[styles.historyTimeValue, { color: colors.textPrimary }]}>
                        {formatTime(entry.clockOutAt, (entry.timezone ?? entry.location?.timezone))}
                      </Text>
                    </View>
                  )}
                  {entry.totalMinutes != null && entry.totalMinutes > 0 && (
                    <View style={styles.historyTimeItem}>
                      <Text style={[styles.historyTimeLabel, { color: colors.textMuted }]}>{t('attendance.history.total')}</Text>
                      <Text style={[styles.historyTimeValue, { color: COLORS.primary }]}>
                        {formatDuration(entry.totalMinutes)}
                      </Text>
                    </View>
                  )}
                </View>

                {!entry.clockInWithinGeofence && (
                  <View style={[styles.geofenceWarning, { borderTopColor: colors.border }]}>
                    <Ionicons name="warning-outline" size={14} color={COLORS.warning} />
                    <Text style={styles.geofenceWarningText}>
                      {t('attendance.clockedInOutsideGeofence')}
                    </Text>
                  </View>
                )}

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
                  <Ionicons name="list-outline" size={15} color={COLORS.primary} />
                  <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: COLORS.primary }}>{t('worklog.viewActivity', 'View activity')}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </View>
              </PressableScale>
            ))
          )}
        </TourTarget>

        {/* Bottom spacing */}
        <View style={{ height: SPACING.xl }} />
      </ScrollView>
      </ScreenContainer>

      {/* Location Selection Bottom Sheet */}
      <LocationPickerSheet
        {...clockIn.pickerProps}
        confirmDisabled={clockIn.isClockingIn}
      />

      <ClockOutSheet
        visible={showClockOutConfirm}
        onClose={() => setShowClockOutConfirm(false)}
        onConfirm={confirmClockOut}
        title={t('attendance.clockOutConfirmTitle')}
        message={t('attendance.clockOutConfirmMessage')}
        confirmLabel={t('attendance.clockOut')}
        cancelLabel={t('common.cancel')}
        notesLabel={t('attendance.shiftNotesLabel')}
        notesPlaceholder={t('attendance.shiftNotesPlaceholder')}
        isLoading={isActionLoading}
      />

      {worklogEntryId && (
        <WorkLogSheet
          visible={!!worklogEntryId}
          onClose={() => setWorklogEntryId(null)}
          timeEntryId={worklogEntryId}
          editable={worklogEntryId === currentEntry?.id && isClockedIn}
          title={worklogEntryId === currentEntry?.id ? t('worklog.title', 'What I did today') : t('worklog.titlePast', 'Activity for this session')}
          hint={t('worklog.hint', 'Note what you finish through the shift — it becomes your clock-out summary.')}
        />
      )}

      <ReportIssueSheet
        visible={reportIssueOpen}
        onClose={() => setReportIssueOpen(false)}
        timeEntryId={currentEntry?.id}
        spaceId={status?.currentEntry?.location?.id}
        onCreated={(id) => { setReportIssueOpen(false); setIssueThreadId(id); }}
      />
      <ShiftIssueThreadSheet
        visible={!!issueThreadId}
        onClose={() => setIssueThreadId(null)}
        issueId={issueThreadId}
        canManage={!!((user as any)?.canManageUsers || (user as any)?.canViewAllTasks)}
        currentUserId={(user as any)?.id}
      />
      <ShiftIssueListSheet
        visible={issueListOpen}
        onClose={() => setIssueListOpen(false)}
        onOpen={(id) => { setIssueListOpen(false); setIssueThreadId(id); }}
        onReport={currentEntry?.id ? () => { setIssueListOpen(false); setReportIssueOpen(true); } : undefined}
      />

      {/* Out-of-ring reason + duration sheet */}
      <OutOfRingSheet
        visible={excursionSheetVisible}
        spaceName={status?.currentEntry?.location?.name ?? t('attendance.unknownLocation')}
        onClose={() => setExcursionSheetVisible(false)}
        onSubmit={handleReportExcursion}
        isLoading={reportingExcursion}
      />

      {/* Forgot-to-clock-out Bottom Sheet — pick actual leave time */}
      <Modal
        visible={showForgotSheet}
        transparent
        animationType="none"
        onRequestClose={() => setShowForgotSheet(false)}
        statusBarTranslucent
      >
        <Pressable
          style={[StyleSheet.absoluteFill, styles.forgotOverlay]}
          onPress={() => setShowForgotSheet(false)}
        >
          <Pressable
            style={[styles.forgotSheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + SPACING.lg }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={[styles.modalHandle, { backgroundColor: colors.borderLight }]} />
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{t('shiftReminder.forgotSheetTitle')}</Text>
              <TouchableOpacity onPress={() => setShowForgotSheet(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
              {t('shiftReminder.forgotSheetSubtitle')}
            </Text>

            {expectedEnd && (
              <TouchableOpacity
                style={[styles.forgotOption, { borderColor: colors.border }]}
                onPress={() => resolveForgot(expectedEnd)}
                disabled={isReminderLoading}
                activeOpacity={0.7}
              >
                <View style={styles.forgotOptionLeft}>
                  <Ionicons name="flag-outline" size={20} color={COLORS.primary} />
                  <Text style={[styles.forgotOptionLabel, { color: colors.textPrimary }]}>{t('shiftReminder.atShiftEnd')}</Text>
                </View>
                <Text style={[styles.forgotOptionTime, { color: colors.textSecondary }]}>
                  {formatTime(currentEntry!.expectedClockOutAt!, (currentEntry?.timezone ?? currentEntry?.location?.timezone))}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.forgotOption, styles.forgotOptionPrimary]}
              onPress={() => resolveForgot(new Date())}
              disabled={isReminderLoading}
              activeOpacity={0.7}
            >
              <View style={styles.forgotOptionLeft}>
                <Ionicons name="time-outline" size={20} color="#fff" />
                <Text style={[styles.forgotOptionLabel, { color: '#fff' }]}>{t('shiftReminder.now')}</Text>
              </View>
              {isReminderLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={[styles.forgotOptionTime, { color: '#fff' }]}>{formatTime(new Date().toISOString(), (currentEntry?.timezone ?? currentEntry?.location?.timezone))}</Text>
              )}
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Break Notes Bottom Sheet */}
      <Modal
        visible={breakModalVisible}
        transparent
        animationType="none"
        onRequestClose={closeBreakModal}
        statusBarTranslucent
      >
        <KeyboardAvoidingView
          style={styles.modalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: breakOverlayAnim }]}>
            {Platform.OS === 'ios' ? (
              <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill}>
                <Pressable style={StyleSheet.absoluteFill} onPress={closeBreakModal} />
              </BlurView>
            ) : (
              <Pressable
                style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.65)' }]}
                onPress={closeBreakModal}
              />
            )}
          </Animated.View>
          <Animated.View
            style={[styles.modalSheet, { transform: [{ translateY: breakSlideAnim }] }]}
          >
            <View style={[styles.modalHandle, { backgroundColor: colors.borderLight }]} />
            <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                  {isEndingBreak ? t('attendance.breaks.notesTitle') : t('attendance.breaks.startBreakTitle', { type: pendingBreakType?.toLowerCase() })}
                </Text>
                <TouchableOpacity onPress={closeBreakModal}>
                  <Ionicons name="close" size={24} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
                {t('attendance.breaks.notesSubtitle')}
              </Text>

              <TextInput
                style={[styles.notesInput, { backgroundColor: colors.input, borderColor: colors.inputBorder, color: colors.textPrimary }]}
                placeholder={t('attendance.breaks.notesPlaceholder')}
                placeholderTextColor={colors.textMuted}
                value={breakNotes}
                onChangeText={setBreakNotes}
                multiline
                numberOfLines={3}
                maxLength={500}
                textAlignVertical="top"
              />

              <Text style={[styles.characterCount, { color: colors.textMuted }]}>
                {t('attendance.breaks.charCount', { count: breakNotes.length })}
              </Text>

              <View style={styles.breakModalButtons}>
                <TouchableOpacity
                  style={[styles.cancelButton, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
                  onPress={() => {
                    closeBreakModal();
                    setPendingBreakType(null);
                    setIsEndingBreak(false);
                    setBreakNotes('');
                  }}
                >
                  <Text style={[styles.cancelButtonText, { color: colors.textSecondary }]}>{t('common.cancel')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.breakConfirmButton,
                    { backgroundColor: isEndingBreak ? COLORS.amber : COLORS.success },
                  ]}
                  onPress={isEndingBreak ? confirmEndBreak : confirmStartBreak}
                >
                  <Ionicons
                    name={isEndingBreak ? 'checkmark-circle-outline' : 'cafe-outline'}
                    size={20}
                    color={COLORS.white}
                  />
                  <Text style={styles.confirmButtonText}>
                    {isEndingBreak ? t('attendance.breaks.endBreak') : t('attendance.breaks.startBreak')}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Safe area spacer */}
              <View style={{ height: insets.bottom }} />
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  // Not available state
  notAvailable: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  notAvailableTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.semibold,
    marginTop: SPACING.lg,
  },
  notAvailableText: {
    fontSize: FONT_SIZE.base,
    textAlign: 'center',
    marginTop: SPACING.sm,
    maxWidth: 280,
  },

  // Status card
  statusCard: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    ...SHADOWS.md,
  },
  // Quick-action rows nested inside the shift card (Activity / Report / My issues).
  cardActions: {
    marginTop: SPACING.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cardAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: SPACING.md,
  },
  cardActionRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cardActionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardActionTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  cardActionSub: {
    fontSize: 13,
    marginTop: 1,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  statusTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.bold,
  },
  overtimeBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: SPACING.sm,
    marginTop: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  overtimeBannerTitle: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.semibold,
  },
  overtimeBannerSub: {
    fontSize: FONT_SIZE.sm,
    marginTop: 2,
  },
  // Shift reminder card
  reminderCard: {
    marginTop: SPACING.md,
    padding: SPACING.lg,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  reminderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  reminderTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
    color: '#92400E',
    flex: 1,
  },
  reminderSubtitle: {
    fontSize: FONT_SIZE.sm,
    color: '#A16207',
    marginTop: SPACING.xs,
  },
  reminderPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: '#D97706',
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    marginTop: SPACING.md,
  },
  reminderPrimaryText: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.semibold,
    color: '#fff',
  },
  reminderSecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    marginTop: SPACING.sm,
  },
  reminderSecondaryText: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.semibold,
    color: '#92400E',
  },
  // Leader entry point
  leaderEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginTop: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  leaderEntryIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  leaderEntryTitle: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.semibold,
  },
  leaderEntrySub: {
    fontSize: FONT_SIZE.sm,
    marginTop: 1,
  },
  // Forgot clock-out sheet
  forgotOverlay: {
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  forgotSheet: {
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.sm,
  },
  forgotOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    marginTop: SPACING.md,
  },
  forgotOptionPrimary: {
    backgroundColor: COLORS.primary,
    borderWidth: 0,
  },
  forgotOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  forgotOptionLabel: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.semibold,
  },
  forgotOptionTime: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.medium,
  },
  geofenceWarningTextContainer: {
    flex: 1,
  },
  geofenceWarningTitle: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.semibold,
    color: '#92400E',
  },
  geofenceWarningSubtitle: {
    fontSize: FONT_SIZE.sm,
    color: '#A16207',
    marginTop: 2,
  },
  geofenceClockOutButton: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
  },
  geofenceClockOutText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    color: '#FFFFFF',
  },
  currentShiftInfo: {
    marginTop: SPACING.lg,
    paddingTop: SPACING.lg,
    borderTopWidth: 1,
  },
  shiftDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  shiftDetailText: {
    fontSize: FONT_SIZE.base,
  },
  elapsedTimeContainer: {
    marginTop: SPACING.md,
    alignItems: 'center',
  },
  elapsedTimeLabel: {
    fontSize: FONT_SIZE.sm,
  },
  elapsedTime: {
    fontSize: FONT_SIZE.title,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.primary,
    marginTop: SPACING.xs,
  },

  // Break section
  breakSection: {
    marginTop: SPACING.lg,
    paddingTop: SPACING.lg,
    borderTopWidth: 1,
  },
  breakSectionTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  breakButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  breakTypeButton: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary,
    gap: SPACING.xs,
  },
  breakTypeButtonText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.primary,
  },
  breakActiveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.md,
  },
  breakActiveText: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.amber,
    textTransform: 'capitalize',
  },
  breakTimeText: {
    fontSize: FONT_SIZE.sm,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  endBreakButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.amber,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.md,
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },
  endBreakButtonText: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.white,
  },
  totalBreakText: {
    fontSize: FONT_SIZE.xs,
    textAlign: 'center',
    marginTop: SPACING.md,
  },
  // Break timer
  breakTimerContainer: {
    alignItems: 'center',
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  breakTimerLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.slate500,
  },
  breakTimerValue: {
    fontSize: FONT_SIZE.title,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.amber,
    marginTop: SPACING.xs,
  },
  // Break history
  breakHistoryCard: {
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
    ...SHADOWS.sm,
  },
  breakHistoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  breakTypeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.sm,
  },
  breakTypeTagText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.primary,
  },
  breakActiveBadge: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.sm,
  },
  breakActiveBadgeText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.amber,
  },
  breakDurationText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
  },
  breakHistoryTimes: {
    marginTop: SPACING.xs,
  },
  breakHistoryTimeText: {
    fontSize: FONT_SIZE.sm,
  },
  breakNotesText: {
    fontSize: FONT_SIZE.xs,
    fontStyle: 'italic',
    marginTop: SPACING.xs,
  },
  totalBreakSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.sm,
  },
  totalBreakSummaryLabel: {
    fontSize: FONT_SIZE.sm,
  },
  totalBreakSummaryValue: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.primary,
  },

  // Action button
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    marginTop: SPACING.xl,
    gap: SPACING.sm,
  },
  actionButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
  },
  locationErrorText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.error,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },

  // Section
  section: {
    marginTop: SPACING.xxl,
    paddingHorizontal: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.semibold,
    marginBottom: SPACING.lg,
  },

  // Location card
  locationCard: {
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOWS.sm,
  },
  locationInfo: {
    flex: 1,
  },
  locationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  locationName: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.semibold,
  },
  locationAddress: {
    fontSize: FONT_SIZE.sm,
    marginBottom: SPACING.sm,
  },
  distanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  distanceText: {
    fontSize: FONT_SIZE.sm,
  },

  // Empty state
  emptyState: {
    borderRadius: RADIUS.md,
    padding: SPACING.xxxl,
    alignItems: 'center',
    ...SHADOWS.sm,
  },
  emptyText: {
    fontSize: FONT_SIZE.base,
    marginTop: SPACING.md,
  },

  // History card
  historyCard: {
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOWS.sm,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  historyDate: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.semibold,
  },
  historyStatusBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.sm,
  },
  historyStatusText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.semibold,
  },
  historyLocation: {
    fontSize: FONT_SIZE.sm,
    marginBottom: SPACING.md,
  },
  historyTimes: {
    flexDirection: 'row',
    gap: SPACING.xl,
  },
  historyTimeItem: {
    alignItems: 'flex-start',
  },
  historyTimeLabel: {
    fontSize: FONT_SIZE.xs,
    marginBottom: SPACING.xs,
  },
  historyTimeValue: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.semibold,
  },
  geofenceWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
  },
  geofenceWarningText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.warning,
  },

  // Bottom Sheet
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalSheet: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 20,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: SPACING.sm,
  },
  modalContent: {
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.xl,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  modalTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.bold,
  },
  modalSubtitle: {
    fontSize: FONT_SIZE.base,
    marginBottom: SPACING.lg,
  },
  confirmButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
  },
  // Break notes modal
  notesInput: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    padding: SPACING.md,
    fontSize: FONT_SIZE.base,
    minHeight: 100,
    marginBottom: SPACING.sm,
  },
  characterCount: {
    fontSize: FONT_SIZE.xs,
    textAlign: 'right',
    marginBottom: SPACING.lg,
  },
  breakModalButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  breakConfirmButton: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  cancelButtonText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.semibold,
  },
});
