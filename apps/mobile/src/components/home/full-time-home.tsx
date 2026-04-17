import { useState, useEffect, useCallback, useRef } from 'react';
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
import * as Location from 'expo-location';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/auth-context';
import { useTheme } from '../../contexts/theme-context';
import { useToast } from '../../contexts/toast-context';
import {
  attendanceApi,
  type AttendanceStatus,
  type TimeEntry,
  type CompanyLocation,
  type BreakStatus,
} from '../../lib/api';
import { LoadingState, ErrorState, LocationPickerSheet, ClockOutSheet } from '../../components';
import {
  haversineDistance,
  formatDurationMinutes as formatDuration,
  formatTimeString as formatTime,
  formatDateRelative as formatDate,
} from '../../lib/utils';
import { styles as sharedStyles, COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOWS } from './home-styles';

export function FullTimeHome() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const toast = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Attendance state
  const [status, setStatus] = useState<AttendanceStatus | null>(null);
  const [history, setHistory] = useState<TimeEntry[]>([]);
  const [breakStatus, setBreakStatus] = useState<BreakStatus | null>(null);

  // Location state
  const [currentLocation, setCurrentLocation] = useState<{
    lat: number;
    lng: number;
    accuracy: number;
  } | null>(null);
  const [isGettingLocation, setIsGettingLocation] = useState(false);

  // Modal state
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<CompanyLocation | null>(null);

  // Confirm sheet state
  const [showClockOutConfirm, setShowClockOutConfirm] = useState(false);

  // Timer for current shift
  const [elapsedMinutes, setElapsedMinutes] = useState(0);

  const lastFetchTimeRef = useRef(0);

  // Fetch attendance data
  const fetchAttendanceData = useCallback(async () => {
    try {
      lastFetchTimeRef.current = Date.now();
      setError(null);
      const [statusData, historyData, breakData] = await Promise.all([
        attendanceApi.getStatus(),
        attendanceApi.getHistory({ limit: 5 }),
        attendanceApi.getBreakStatus(),
      ]);
      setStatus(statusData);
      const entries = Array.isArray(historyData) ? historyData : (historyData as any).data || [];
      setHistory(entries);
      setBreakStatus(breakData);

      if (statusData.isClockedIn && statusData.currentEntry) {
        const clockInTime = new Date(statusData.currentEntry.clockInAt).getTime();
        const now = Date.now();
        setElapsedMinutes(Math.floor((now - clockInTime) / 60000));
      } else {
        setElapsedMinutes(0);
      }
    } catch (err) {
      console.error('Error fetching attendance:', err);
      setError(err instanceof Error ? err.message : t('home.fullTime.failedToLoadAttendance'));
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

  // Refetch when tab gets focus
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

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchAttendanceData();
    setIsRefreshing(false);
  };

  // Get current location
  const getCurrentLocation = async () => {
    setIsGettingLocation(true);
    try {
      const { status: permStatus } = await Location.requestForegroundPermissionsAsync();
      if (permStatus !== 'granted') {
        toast.warning(t('home.fullTime.permissionDenied'), t('home.fullTime.locationPermissionRequired'));
        return null;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const loc = {
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        accuracy: location.coords.accuracy || 0,
      };
      setCurrentLocation(loc);
      return loc;
    } catch (err) {
      toast.error(t('home.fullTime.locationError'), t('home.fullTime.failedToGetLocation'));
      return null;
    } finally {
      setIsGettingLocation(false);
    }
  };

  // Handle clock in
  const handleClockIn = async () => {
    if (!selectedLocation || !currentLocation) return;

    setIsActionLoading(true);
    try {
      await attendanceApi.clockIn({
        locationId: selectedLocation.id,
        lat: currentLocation.lat,
        lng: currentLocation.lng,
        accuracy: currentLocation.accuracy,
      });
      setLocationModalVisible(false);
      setSelectedLocation(null);
      await fetchAttendanceData();
    } catch (err: any) {
      toast.error(t('common.error'), err.message || t('home.fullTime.failedToClockIn'));
    } finally {
      setIsActionLoading(false);
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
      if (!location) {
        setIsActionLoading(false);
        return;
      }

      await attendanceApi.clockOut({
        lat: location.lat,
        lng: location.lng,
        accuracy: location.accuracy,
        notes: notes || undefined,
      });
      await fetchAttendanceData();
    } catch (err: any) {
      toast.error(t('common.error'), err.message || t('home.fullTime.failedToClockOut'));
    } finally {
      setIsActionLoading(false);
    }
  };

  // Open location selection modal
  const openClockInModal = async () => {
    const location = await getCurrentLocation();
    if (location) {
      setLocationModalVisible(true);
    }
  };

  // Calculate distance to location
  const getDistanceToLocation = (location: CompanyLocation): number | null => {
    if (!currentLocation) return null;
    return haversineDistance(
      currentLocation.lat,
      currentLocation.lng,
      location.lat,
      location.lng
    );
  };

  // Check if within geofence
  const isWithinGeofence = (location: CompanyLocation): boolean => {
    const distance = getDistanceToLocation(location);
    if (distance === null) return false;
    return distance <= location.geofenceRadius;
  };

  if (isLoading) return <LoadingState message={t('home.fullTime.loadingAttendance')} />;
  if (error) return <ErrorState message={error} onRetry={fetchAttendanceData} />;

  const isClockedIn = status?.isClockedIn || false;

  return (
    <View style={[sharedStyles.container, { backgroundColor: colors.surface }]}>
      <ScrollView
        style={sharedStyles.scrollView}
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
        {/* Welcome Section */}
        <View style={sharedStyles.welcomeSection}>
          <Text style={[sharedStyles.welcomeGreeting, { color: colors.textMuted }]}>
            {new Date().getHours() < 12 ? t('common.greeting.morning') : new Date().getHours() < 18 ? t('common.greeting.afternoon') : t('common.greeting.evening')}
          </Text>
          <Text style={[sharedStyles.welcomeName, { color: colors.textPrimary }]}>{user?.firstName}!</Text>
        </View>

        {/* Clock Status Card */}
        <View style={[ftStyles.statusCard, isClockedIn ? ftStyles.statusCardActive : ftStyles.statusCardInactive, !isClockedIn && { backgroundColor: colors.card }]}>
          <View style={ftStyles.statusHeader}>
            <View style={[ftStyles.statusIndicator, isClockedIn ? ftStyles.indicatorActive : ftStyles.indicatorInactive]} />
            <Text style={[ftStyles.statusText, isClockedIn ? ftStyles.statusTextActive : { color: colors.textPrimary }]}>
              {isClockedIn ? t('home.fullTime.clockedIn') : t('home.fullTime.clockedOut')}
            </Text>
          </View>

          {isClockedIn && status?.currentEntry && (
            <View style={ftStyles.shiftInfo}>
              <View style={ftStyles.shiftRow}>
                <Ionicons name="location" size={16} color={COLORS.primary} />
                <Text style={ftStyles.shiftLocation}>
                  {status.currentEntry.location?.name || t('common.unknownLocation')}
                </Text>
              </View>
              <View style={ftStyles.shiftRow}>
                <Ionicons name="time" size={16} color={COLORS.primary} />
                <Text style={ftStyles.shiftTime}>
                  {t('home.fullTime.startedAt', { time: formatTime(status.currentEntry.clockInAt) })}
                </Text>
              </View>
              <View style={ftStyles.durationBadge}>
                <Ionicons name="hourglass" size={14} color={COLORS.white} />
                <Text style={ftStyles.durationText}>{formatDuration(elapsedMinutes)}</Text>
              </View>

              {breakStatus?.isOnBreak && (
                <View style={ftStyles.breakBadge}>
                  <Ionicons name="cafe" size={14} color={COLORS.white} />
                  <Text style={ftStyles.breakText}>{t('home.fullTime.onBreak')}</Text>
                </View>
              )}
            </View>
          )}

          {/* Action Button */}
          <TouchableOpacity
            style={[
              ftStyles.clockButton,
              isClockedIn ? ftStyles.clockOutButton : ftStyles.clockInButton,
              (isActionLoading || isGettingLocation) && sharedStyles.buttonDisabled,
            ]}
            onPress={isClockedIn ? handleClockOut : openClockInModal}
            disabled={isActionLoading || isGettingLocation}
          >
            {isActionLoading || isGettingLocation ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <>
                <Ionicons
                  name={isClockedIn ? 'log-out' : 'log-in'}
                  size={20}
                  color={COLORS.white}
                />
                <Text style={ftStyles.clockButtonText}>
                  {isClockedIn ? t('home.fullTime.clockOut') : t('home.fullTime.clockIn')}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Quick Stats */}
        <View style={ftStyles.quickStatsRow}>
          <View style={[ftStyles.quickStatCard, { backgroundColor: colors.card }]}>
            <Ionicons name="briefcase-outline" size={24} color={COLORS.primary} />
            <Text style={[ftStyles.quickStatValue, { color: colors.textPrimary }]}>
              {formatDuration(Math.max(0, elapsedMinutes - (breakStatus?.totalBreakMinutes || 0)))}
            </Text>
            <Text style={[ftStyles.quickStatLabel, { color: colors.textMuted }]}>{t('home.fullTime.netWork')}</Text>
          </View>
          <View style={[ftStyles.quickStatCard, { backgroundColor: colors.card }]}>
            <Ionicons name="cafe-outline" size={24} color={COLORS.amber} />
            <Text style={[ftStyles.quickStatValue, { color: colors.textPrimary }]}>
              {breakStatus?.totalBreakMinutes ? formatDuration(breakStatus.totalBreakMinutes) : '0m'}
            </Text>
            <Text style={[ftStyles.quickStatLabel, { color: colors.textMuted }]}>{t('home.fullTime.breakTime')}</Text>
          </View>
          <View style={[ftStyles.quickStatCard, { backgroundColor: colors.card }]}>
            <Ionicons name="calendar-outline" size={24} color={COLORS.success} />
            <Text style={[ftStyles.quickStatValue, { color: colors.textPrimary }]}>
              {(() => {
                const now = new Date();
                const dayOfWeek = now.getDay();
                const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
                const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);
                let count = 0;
                history.forEach((entry: TimeEntry) => {
                  if (new Date(entry.clockInAt) >= weekStart) count++;
                });
                if (isClockedIn) {
                  const currentInThisWeek = status?.currentEntry && new Date(status.currentEntry.clockInAt) >= weekStart;
                  const alreadyCounted = history.some((e: TimeEntry) => status?.currentEntry && e.id === status.currentEntry.id);
                  if (currentInThisWeek && !alreadyCounted) count++;
                }
                return count;
              })()}
            </Text>
            <Text style={[ftStyles.quickStatLabel, { color: colors.textMuted }]}>{t('home.fullTime.thisWeek')}</Text>
          </View>
        </View>

        {/* Assigned Locations (when clocked out) */}
        {!isClockedIn && status?.assignedLocations && status.assignedLocations.length > 0 && (
          <View style={ftStyles.locationsSection}>
            <Text style={[sharedStyles.sectionTitle, { color: colors.textPrimary }]}>{t('home.fullTime.yourLocations')}</Text>
            {status.assignedLocations.map((location) => {
              const distance = getDistanceToLocation(location);
              const withinFence = isWithinGeofence(location);

              return (
                <View key={location.id} style={[ftStyles.locationCard, { backgroundColor: colors.card }]}>
                  <View style={ftStyles.locationInfo}>
                    <Text style={[ftStyles.locationName, { color: colors.textPrimary }]}>{location.name}</Text>
                    <Text style={[ftStyles.locationAddress, { color: colors.textSecondary }]}>{location.address}</Text>
                    {distance !== null && (
                      <View style={ftStyles.distanceRow}>
                        <Ionicons
                          name={withinFence ? 'checkmark-circle' : 'location'}
                          size={14}
                          color={withinFence ? COLORS.success : COLORS.slate400}
                        />
                        <Text style={[ftStyles.distanceText, withinFence ? ftStyles.withinFenceText : { color: colors.textSecondary }]}>
                          {distance < 1000
                            ? t('home.fullTime.awayMeters', { distance: Math.round(distance) })
                            : t('home.fullTime.awayKm', { distance: (distance / 1000).toFixed(1) })}
                          {withinFence && ` ${t('home.fullTime.withinRange')}`}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Recent History */}
        {history.length > 0 && (
          <View style={ftStyles.historySection}>
            <Text style={[sharedStyles.sectionTitle, { color: colors.textPrimary }]}>{t('home.fullTime.recentActivity')}</Text>
            {history.slice(0, 3).map((entry) => (
              <View key={entry.id} style={[ftStyles.historyCard, { backgroundColor: colors.card }]}>
                <View style={ftStyles.historyLeft}>
                  <Text style={[ftStyles.historyDate, { color: colors.textPrimary }]}>{formatDate(entry.clockInAt)}</Text>
                  <Text style={[ftStyles.historyLocation, { color: colors.textSecondary }]}>{entry.location?.name || t('common.unknown')}</Text>
                </View>
                <View style={ftStyles.historyRight}>
                  <Text style={[ftStyles.historyTime, { color: colors.textSecondary }]}>
                    {formatTime(entry.clockInAt)} - {entry.clockOutAt ? formatTime(entry.clockOutAt) : t('common.active')}
                  </Text>
                  {entry.totalMinutes != null && entry.totalMinutes > 0 && (
                    <Text style={ftStyles.historyDuration}>{formatDuration(entry.totalMinutes)}</Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Bottom spacing */}
        <View style={{ height: SPACING.xxl }} />
      </ScrollView>

      {/* Location Selection Bottom Sheet */}
      <LocationPickerSheet
        visible={locationModalVisible}
        locations={status?.assignedLocations || []}
        selectedLocation={selectedLocation}
        onSelect={setSelectedLocation}
        onConfirm={handleClockIn}
        onClose={() => setLocationModalVisible(false)}
        getDistance={getDistanceToLocation}
        confirmLabel={t('home.fullTime.clockIn')}
        confirmDisabled={isActionLoading}
      />

      <ClockOutSheet
        visible={showClockOutConfirm}
        onClose={() => setShowClockOutConfirm(false)}
        onConfirm={confirmClockOut}
        title={t('home.fullTime.clockOutConfirmTitle')}
        message={t('home.fullTime.clockOutConfirmMessage')}
        confirmLabel={t('home.fullTime.clockOut')}
        cancelLabel={t('common.cancel')}
        notesLabel={t('home.fullTime.shiftNotesLabel')}
        notesPlaceholder={t('home.fullTime.shiftNotesPlaceholder')}
        isLoading={isActionLoading}
      />
    </View>
  );
}

const ftStyles = StyleSheet.create({
  // Status Card
  statusCard: {
    marginHorizontal: SPACING.lg,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.md,
  },
  statusCardActive: {
    backgroundColor: COLORS.primary,
  },
  statusCardInactive: {},
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: SPACING.sm,
  },
  indicatorActive: {
    backgroundColor: COLORS.success,
  },
  indicatorInactive: {
    backgroundColor: COLORS.slate300,
  },
  statusText: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.semibold,
  },
  statusTextActive: {
    color: COLORS.white,
  },
  shiftInfo: {
    marginBottom: SPACING.lg,
  },
  shiftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  shiftLocation: {
    marginLeft: SPACING.sm,
    fontSize: FONT_SIZE.base,
    color: 'rgba(255,255,255,0.9)',
  },
  shiftTime: {
    marginLeft: SPACING.sm,
    fontSize: FONT_SIZE.base,
    color: 'rgba(255,255,255,0.8)',
  },
  durationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.md,
    marginTop: SPACING.sm,
  },
  durationText: {
    marginLeft: SPACING.xs,
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.white,
  },
  breakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.md,
    marginTop: SPACING.sm,
    marginLeft: SPACING.sm,
  },
  breakText: {
    marginLeft: SPACING.xs,
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.white,
  },
  clockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    gap: SPACING.sm,
  },
  clockInButton: {
    backgroundColor: COLORS.primary,
  },
  clockOutButton: {
    backgroundColor: COLORS.primaryDark,
  },
  clockButtonText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.white,
  },

  // Quick Stats
  quickStatsRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    gap: SPACING.md,
  },
  quickStatCard: {
    flex: 1,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
    ...SHADOWS.sm,
  },
  quickStatValue: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.bold,
    marginTop: SPACING.xs,
  },
  quickStatLabel: {
    fontSize: FONT_SIZE.xs,
    marginTop: 2,
  },

  // Locations Section
  locationsSection: {
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.xxl,
  },
  locationCard: {
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    ...SHADOWS.sm,
  },
  locationInfo: {
    flex: 1,
  },
  locationName: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.semibold,
  },
  locationAddress: {
    fontSize: FONT_SIZE.sm,
    marginTop: 2,
  },
  distanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  distanceText: {
    fontSize: FONT_SIZE.sm,
    marginLeft: SPACING.xs,
  },
  withinFenceText: {
    color: COLORS.success,
  },

  // History Section
  historySection: {
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.xxl,
  },
  historyCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    ...SHADOWS.sm,
  },
  historyLeft: {},
  historyRight: {
    alignItems: 'flex-end',
  },
  historyDate: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semibold,
  },
  historyLocation: {
    fontSize: FONT_SIZE.sm,
  },
  historyTime: {
    fontSize: FONT_SIZE.sm,
  },
  historyDuration: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.primary,
    marginTop: 2,
  },
});
