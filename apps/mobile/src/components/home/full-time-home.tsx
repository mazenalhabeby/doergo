import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/auth-context';
import { useTheme } from '../../contexts/theme-context';
import {
  attendanceApi,
  type AttendanceStatus,
  type TimeEntry,
  type CompanyLocation,
  type BreakStatus,
} from '../../lib/api';
import { LoadingState, ErrorState, ScreenContainer } from '../../components';
import { ShiftClockCard } from './shift-clock-card';
import { OutOfRingHomeBanner } from '../out-of-ring-home-banner';
import { AlwaysLocationNudge } from '../always-location-nudge';
import { useClockIn } from '../../hooks/useClockIn';
import { useExcursionSync } from '../../hooks/useExcursionSync';
import {
  formatDurationMinutes as formatDuration,
} from '../../lib/utils';
import { useTimeFormat } from '../../hooks/useTimeFormat';
import { countryFromTz } from '@hbcfield/shared/client';
import { TourTarget } from '../tour';
import { styles as sharedStyles, COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOWS } from './home-styles';
import { DocumentsReminderCard } from '../documents-reminder-card';
import { workedMinutes } from '@hbcfield/shared/client';

export function FullTimeHome() {
  const { user } = useAuth();
  // Locale- + timezone-aware, so the date agrees with the entry's own zone.
  const { formatTime, formatDateRelative: formatDate } = useTimeFormat();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Attendance state — the clock-in/out widget (ShiftClockCard) owns its own
  // copy; this state drives the quick-stats / locations / history below.
  const [status, setStatus] = useState<AttendanceStatus | null>(null);
  const [history, setHistory] = useState<TimeEntry[]>([]);
  const [breakStatus, setBreakStatus] = useState<BreakStatus | null>(null);

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

  // Clock-in/out lives in <ShiftClockCard/>. We still use the shared hook here
  // only for its GPS distance helper, which powers the assigned-locations list. (DRY)
  const clockIn = useClockIn({
    assignedLocations: status?.assignedLocations || [],
  });
  const getDistanceToLocation = clockIn.getDistanceToLocation;

  // Live out-of-ring updates so the home banner reflects admin decisions /
  // background detection without a manual pull-to-refresh.
  useExcursionSync(() => fetchAttendanceData(), user?.id);

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
      <ScreenContainer width="content">
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
        <TourTarget name="home-greeting" style={sharedStyles.welcomeSection}>
          <Text style={[sharedStyles.welcomeGreeting, { color: colors.textMuted }]}>
            {new Date().getHours() < 12 ? t('common.greeting.morning') : new Date().getHours() < 18 ? t('common.greeting.afternoon') : t('common.greeting.evening')}
          </Text>
          <Text style={[sharedStyles.welcomeName, { color: colors.textPrimary }]}>{user?.firstName}!</Text>
        </TourTarget>

      {/* Outstanding personal documents, once, at the top — see the component
          for why it is not on every screen. Renders nothing when there are
          none, which is the normal case. */}
      <DocumentsReminderCard />

        {/* Out-of-ring banner (needs reason / pending / approved countdown) */}
        <OutOfRingHomeBanner
          excursion={status?.activeExcursion}
          onPress={() => router.push('/(app)/(tabs)/attendance' as Href)}
        />
        <AlwaysLocationNudge active={isClockedIn && status?.currentEntry?.location?.lat != null} />

        {/* Shift clock widget (self-contained: owns its own attendance state + sheets) */}
        <TourTarget name="home-work">
          <ShiftClockCard onChanged={() => fetchAttendanceData()} />
        </TourTarget>

        {/* Quick Stats */}
        <TourTarget name="home-today" style={ftStyles.quickStatsRow}>
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
        </TourTarget>

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
                  <Text style={[ftStyles.historyDate, { color: colors.textPrimary }]}>{formatDate(entry.clockInAt, (entry.timezone ?? entry.location?.timezone))}</Text>
                  <Text style={[ftStyles.historyLocation, { color: colors.textSecondary }]}>{entry.location?.name || t('common.unknown')}</Text>
                  {!!countryFromTz((entry.timezone ?? entry.location?.timezone), i18n.language) && (
                    <Text style={[ftStyles.historyLocation, { color: colors.textMuted }]}>
                      {countryFromTz((entry.timezone ?? entry.location?.timezone), i18n.language)}
                    </Text>
                  )}
                </View>
                <View style={ftStyles.historyRight}>
                  <Text style={[ftStyles.historyTime, { color: colors.textSecondary }]}>
                    {formatTime(entry.clockInAt, (entry.timezone ?? entry.location?.timezone))} - {entry.clockOutAt ? formatTime(entry.clockOutAt, (entry.timezone ?? entry.location?.timezone)) : t('common.active')}
                  </Text>
                  {entry.totalMinutes != null && entry.totalMinutes > 0 && (
                    <Text style={ftStyles.historyDuration}>{formatDuration(workedMinutes(entry))}</Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Bottom spacing */}
        <View style={{ height: SPACING.xxl }} />
      </ScrollView>
      </ScreenContainer>
    </View>
  );
}

const ftStyles = StyleSheet.create({
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
