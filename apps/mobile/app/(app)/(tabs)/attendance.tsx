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
  Dimensions,
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
} from '../../../src/lib/api';
import { useAuth } from '../../../src/contexts/auth-context';
import { useToast } from '../../../src/contexts/toast-context';
import { useTheme } from '../../../src/contexts/theme-context';
import { LoadingState, ErrorState, LocationPickerSheet, ClockOutSheet } from '../../../src/components';
import { startBackgroundHeartbeat, stopBackgroundHeartbeat } from '../../../src/services/background-heartbeat';
import { overtimeApi, OvertimeRequest } from '../../../src/lib/api';
import {
  haversineDistance,
  formatDurationMinutes as formatDuration,
  formatTimeString as formatTime,
  formatDateRelative as formatDate,
} from '../../../src/lib/utils';

export default function AttendanceScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Attendance state
  const [status, setStatus] = useState<AttendanceStatus | null>(null);
  const [history, setHistory] = useState<TimeEntry[]>([]);
  const [breakStatus, setBreakStatus] = useState<BreakStatus | null>(null);
  const [isBreakLoading, setIsBreakLoading] = useState(false);

  // Location state
  const [currentLocation, setCurrentLocation] = useState<{
    lat: number;
    lng: number;
    accuracy: number;
  } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isGettingLocation, setIsGettingLocation] = useState(false);

  // Modal state
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<CompanyLocation | null>(null);
  const [breakModalVisible, setBreakModalVisible] = useState(false);
  const [pendingBreakType, setPendingBreakType] = useState<BreakType | null>(null);
  const [breakNotes, setBreakNotes] = useState('');
  const [isEndingBreak, setIsEndingBreak] = useState(false);

  // Confirm sheet state
  const [showClockOutConfirm, setShowClockOutConfirm] = useState(false);

  // Geofence warning state
  const [isOutsideGeofence, setIsOutsideGeofence] = useState(false);
  const [geofenceDistance, setGeofenceDistance] = useState(0);

  // Overtime state
  const [activeOvertime, setActiveOvertime] = useState<OvertimeRequest | null>(null);

  // Break bottom sheet animation
  const { height: SCREEN_HEIGHT } = Dimensions.get('window');
  const breakSlideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const breakOverlayAnim = useRef(new Animated.Value(0)).current;

  const openLocationModal = useCallback(() => setLocationModalVisible(true), []);
  const closeLocationModal = useCallback(() => setLocationModalVisible(false), []);

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

      if (statusData) setStatus(statusData);
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

  // Heartbeat: send location to server every 5 min while clocked in
  // Server checks geofence and auto-clocks out if >150m away
  const sendHeartbeat = useCallback(async () => {
    if (!status?.isClockedIn) {
      setIsOutsideGeofence(false);
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

      if (result.autoClockedOut) {
        // Server auto-clocked us out — stop background tracking and refresh
        await stopBackgroundHeartbeat();
        toast.warning(t('attendance.autoClockOutTitle'), t('attendance.autoClockOutDistance', { distance: result.distance }));
        await fetchAttendanceData();
        return;
      }

      setIsOutsideGeofence(!result.withinGeofence);
      setGeofenceDistance(result.distance);
    } catch {
      // Ignore heartbeat errors silently
    }
  }, [status?.isClockedIn, fetchAttendanceData, toast, t]);

  // Send heartbeat on tab focus + ensure background tracking is running
  useFocusEffect(
    useCallback(() => {
      sendHeartbeat();
      // Resume background tracking if clocked in but tracking stopped (e.g. app restart)
      if (status?.isClockedIn) {
        startBackgroundHeartbeat();
      }
    }, [sendHeartbeat, status?.isClockedIn])
  );

  // Send heartbeat every 5 minutes while clocked in
  useEffect(() => {
    if (!status?.isClockedIn) return;

    const interval = setInterval(sendHeartbeat, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [status?.isClockedIn, sendHeartbeat]);

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

  // Get current GPS location
  const getCurrentLocation = async () => {
    setIsGettingLocation(true);
    setLocationError(null);

    try {
      const { status: permStatus } = await Location.requestForegroundPermissionsAsync();
      if (permStatus !== 'granted') {
        setLocationError(t('attendance.locationPermissionDenied'));
        setIsGettingLocation(false);
        return null;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const coords = {
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        accuracy: location.coords.accuracy || 0,
      };
      setCurrentLocation(coords);
      setIsGettingLocation(false);
      return coords;
    } catch (err) {
      console.error('Location error:', err);
      setLocationError(t('attendance.failedToGetLocation'));
      setIsGettingLocation(false);
      return null;
    }
  };

  // Handle clock in button press
  const handleClockInPress = async () => {
    const location = await getCurrentLocation();
    if (!location) {
      toast.warning(t('attendance.locationRequired'), t('attendance.enableLocationServices'));
      return;
    }
    openLocationModal();
  };

  // Confirm clock in at selected location
  const confirmClockIn = async () => {
    if (!selectedLocation || !currentLocation) return;

    setIsActionLoading(true);
    closeLocationModal();

    try {
      await attendanceApi.clockIn({
        locationId: selectedLocation.id,
        lat: currentLocation.lat,
        lng: currentLocation.lng,
        accuracy: currentLocation.accuracy,
      });
      await fetchAttendanceData();
      // Start background heartbeat for geofence monitoring
      await startBackgroundHeartbeat();
      toast.success(t('common.success'), t('attendance.clockedInAt', { location: selectedLocation.name }));
    } catch (err) {
      console.error('Clock in error:', err);
      toast.error(t('common.error'), err instanceof Error ? err.message : t('attendance.failedToClockIn'));
    } finally {
      setIsActionLoading(false);
      setSelectedLocation(null);
    }
  };

  // Handle clock out
  const handleClockOut = () => {
    setShowClockOutConfirm(true);
  };

  const confirmClockOut = async (notes: string) => {
    setShowClockOutConfirm(false);
    setIsActionLoading(true);
    try {
      const location = await getCurrentLocation();
      await attendanceApi.clockOut({
        lat: location?.lat || 0,
        lng: location?.lng || 0,
        accuracy: location?.accuracy,
        notes: notes || undefined,
      });
      // Stop background heartbeat
      await stopBackgroundHeartbeat();
      await fetchAttendanceData();
      toast.success(t('common.success'), t('attendance.clockedOutSuccess'));
    } catch (err) {
      console.error('Clock out error:', err);
      toast.error(t('common.error'), err instanceof Error ? err.message : t('attendance.failedToClockOut'));
    } finally {
      setIsActionLoading(false);
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

  // Calculate distance to a location
  const getDistanceToLocation = (location: CompanyLocation): number | null => {
    if (!currentLocation) return null;
    return haversineDistance(
      currentLocation.lat,
      currentLocation.lng,
      location.lat,
      location.lng
    );
  };

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

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
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
          <View style={styles.statusHeader}>
            <View
              style={[
                styles.statusIndicator,
                { backgroundColor: isClockedIn ? COLORS.success : COLORS.slate400 },
              ]}
            />
            <Text style={[styles.statusTitle, { color: colors.textPrimary }]}>
              {isClockedIn ? t('attendance.clockedIn') : t('attendance.clockedOut')}
            </Text>
          </View>

          {/* Geofence Warning Banner */}
          {isClockedIn && isOutsideGeofence && (
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

          {isClockedIn && currentEntry && (
            <View style={[styles.currentShiftInfo, { borderTopColor: colors.border }]}>
              <View style={styles.shiftDetail}>
                <Ionicons name="location-outline" size={18} color={colors.textSecondary} />
                <Text style={[styles.shiftDetailText, { color: colors.textSecondary }]}>
                  {currentEntry.location?.name || t('common.unknownLocation')}
                </Text>
              </View>
              <View style={styles.shiftDetail}>
                <Ionicons name="time-outline" size={18} color={colors.textSecondary} />
                <Text style={[styles.shiftDetailText, { color: colors.textSecondary }]}>
                  {t('attendance.startedAt', { time: formatTime(currentEntry.clockInAt) })}
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
                      Started at {formatTime(breakStatus.currentBreak.startedAt)}
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
                    <TouchableOpacity
                      style={[styles.breakTypeButton, { backgroundColor: colors.primaryLight }]}
                      onPress={() => handleStartBreak(BreakType.LUNCH)}
                      disabled={isBreakLoading}
                    >
                      <Ionicons name="restaurant-outline" size={20} color={COLORS.primary} />
                      <Text style={styles.breakTypeButtonText}>{t('attendance.breaks.lunch')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.breakTypeButton, { backgroundColor: colors.primaryLight }]}
                      onPress={() => handleStartBreak(BreakType.SHORT)}
                      disabled={isBreakLoading}
                    >
                      <Ionicons name="cafe-outline" size={20} color={COLORS.primary} />
                      <Text style={styles.breakTypeButtonText}>{t('attendance.breaks.short')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.breakTypeButton, { backgroundColor: colors.primaryLight }]}
                      onPress={() => handleStartBreak(BreakType.OTHER)}
                      disabled={isBreakLoading}
                    >
                      <Ionicons name="time-outline" size={20} color={COLORS.primary} />
                      <Text style={styles.breakTypeButtonText}>{t('attendance.breaks.other')}</Text>
                    </TouchableOpacity>
                  </View>
                  {breakStatus?.totalBreakMinutes && breakStatus.totalBreakMinutes > 0 && (
                    <Text style={[styles.totalBreakText, { color: colors.textMuted }]}>
                      {t('attendance.breaks.totalBreakTime', { duration: formatDuration(breakStatus.totalBreakMinutes) })}
                    </Text>
                  )}
                </View>
              )}
            </View>
          )}

          {/* Action Button */}
          <TouchableOpacity
            style={[
              styles.actionButton,
              { backgroundColor: isClockedIn ? COLORS.primaryDark : COLORS.primary },
            ]}
            onPress={isClockedIn ? handleClockOut : handleClockInPress}
            disabled={isActionLoading || isGettingLocation}
          >
            {isActionLoading || isGettingLocation ? (
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

          {!!locationError && (
            <Text style={styles.locationErrorText}>{locationError}</Text>
          )}
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
                    {formatTime(breakItem.startedAt)}
                    {breakItem.endedAt && ` - ${formatTime(breakItem.endedAt)}`}
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
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('attendance.history.title')}</Text>

          {history.length === 0 ? (
            <View style={[styles.emptyState, { backgroundColor: colors.card }]}>
              <Ionicons name="calendar-outline" size={48} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>{t('attendance.history.noRecords')}</Text>
            </View>
          ) : (
            history.map((entry) => (
              <View key={entry.id} style={[styles.historyCard, { backgroundColor: colors.card }]}>
                <View style={styles.historyHeader}>
                  <Text style={[styles.historyDate, { color: colors.textPrimary }]}>{formatDate(entry.clockInAt)}</Text>
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
                </Text>

                <View style={styles.historyTimes}>
                  <View style={styles.historyTimeItem}>
                    <Text style={[styles.historyTimeLabel, { color: colors.textMuted }]}>{t('attendance.history.in')}</Text>
                    <Text style={[styles.historyTimeValue, { color: colors.textPrimary }]}>
                      {formatTime(entry.clockInAt)}
                    </Text>
                  </View>
                  {entry.clockOutAt && (
                    <View style={styles.historyTimeItem}>
                      <Text style={[styles.historyTimeLabel, { color: colors.textMuted }]}>{t('attendance.history.out')}</Text>
                      <Text style={[styles.historyTimeValue, { color: colors.textPrimary }]}>
                        {formatTime(entry.clockOutAt)}
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
              </View>
            ))
          )}
        </View>

        {/* Bottom spacing */}
        <View style={{ height: SPACING.xl }} />
      </ScrollView>

      {/* Location Selection Bottom Sheet */}
      <LocationPickerSheet
        visible={locationModalVisible}
        locations={assignedLocations}
        selectedLocation={selectedLocation}
        onSelect={setSelectedLocation}
        onConfirm={confirmClockIn}
        onClose={closeLocationModal}
        getDistance={getDistanceToLocation}
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
  geofenceWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.md,
    padding: SPACING.md,
    backgroundColor: '#FEF3C7',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: '#FDE68A',
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
