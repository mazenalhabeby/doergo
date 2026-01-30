import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { useAuth } from '../../../src/contexts/auth-context';
import {
  tasksApi,
  attendanceApi,
  type Task,
  type AttendanceStatus,
  type TimeEntry,
  type CompanyLocation,
  type BreakStatus,
} from '../../../src/lib/api';
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
import { getWeekDays, isSameDay } from '../../../src/lib/utils';

// Month names for calendar header
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// Calculate distance between two points using Haversine formula
function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Format duration from minutes
function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

// Format time from date string
function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

// Format date for history
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export default function HomeScreen() {
  const { user } = useAuth();
  const isFullTimeTechnician = user?.technicianType === 'FULL_TIME';

  if (isFullTimeTechnician) {
    return <FullTimeHome />;
  }

  return <FreelancerHome />;
}

// ============================================================================
// FULL TIME TECHNICIAN HOME - Attendance focused
// ============================================================================
function FullTimeHome() {
  const { user } = useAuth();
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
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<CompanyLocation | null>(null);

  // Timer for current shift
  const [elapsedMinutes, setElapsedMinutes] = useState(0);

  // Fetch attendance data
  const fetchAttendanceData = useCallback(async () => {
    try {
      setError(null);
      const [statusData, historyData, breakData] = await Promise.all([
        attendanceApi.getStatus(),
        attendanceApi.getHistory({ limit: 5 }),
        attendanceApi.getBreakStatus(),
      ]);
      setStatus(statusData);
      setHistory(historyData.data || []);
      setBreakStatus(breakData);

      // Calculate elapsed time if clocked in
      if (statusData.isClockedIn && statusData.currentEntry) {
        const clockInTime = new Date(statusData.currentEntry.clockInAt).getTime();
        const now = Date.now();
        setElapsedMinutes(Math.floor((now - clockInTime) / 60000));
      } else {
        setElapsedMinutes(0);
      }
    } catch (err) {
      console.error('Error fetching attendance:', err);
      setError(err instanceof Error ? err.message : 'Failed to load attendance data');
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
        Alert.alert('Permission Denied', 'Location permission is required for attendance tracking.');
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
      Alert.alert('Location Error', 'Failed to get your current location.');
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
      setShowLocationModal(false);
      setSelectedLocation(null);
      await fetchAttendanceData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to clock in');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Handle clock out
  const handleClockOut = async () => {
    Alert.alert(
      'Clock Out',
      'Are you sure you want to clock out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clock Out',
          onPress: async () => {
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
              });
              await fetchAttendanceData();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to clock out');
            } finally {
              setIsActionLoading(false);
            }
          },
        },
      ]
    );
  };

  // Open location selection modal
  const openClockInModal = async () => {
    const location = await getCurrentLocation();
    if (location) {
      setShowLocationModal(true);
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

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading attendance...</Text>
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
          <TouchableOpacity style={styles.retryButton} onPress={fetchAttendanceData}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const isClockedIn = status?.isClockedIn || false;

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
        {/* Welcome Section */}
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeGreeting}>
            Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'},
          </Text>
          <Text style={styles.welcomeName}>{user?.firstName}!</Text>
        </View>

        {/* Clock Status Card */}
        <View style={[styles.statusCard, isClockedIn ? styles.statusCardActive : styles.statusCardInactive]}>
          <View style={styles.statusHeader}>
            <View style={[styles.statusIndicator, isClockedIn ? styles.indicatorActive : styles.indicatorInactive]} />
            <Text style={[styles.statusText, isClockedIn && styles.statusTextActive]}>
              {isClockedIn ? 'Clocked In' : 'Clocked Out'}
            </Text>
          </View>

          {isClockedIn && status?.currentEntry && (
            <View style={styles.shiftInfo}>
              <View style={styles.shiftRow}>
                <Ionicons name="location" size={16} color={COLORS.primary} />
                <Text style={styles.shiftLocation}>
                  {status.currentEntry.location?.name || 'Unknown Location'}
                </Text>
              </View>
              <View style={styles.shiftRow}>
                <Ionicons name="time" size={16} color={COLORS.primary} />
                <Text style={styles.shiftTime}>
                  Started at {formatTime(status.currentEntry.clockInAt)}
                </Text>
              </View>
              <View style={styles.durationBadge}>
                <Ionicons name="hourglass" size={14} color={COLORS.white} />
                <Text style={styles.durationText}>{formatDuration(elapsedMinutes)}</Text>
              </View>

              {breakStatus?.isOnBreak && (
                <View style={styles.breakBadge}>
                  <Ionicons name="cafe" size={14} color={COLORS.amber} />
                  <Text style={styles.breakText}>On Break</Text>
                </View>
              )}
            </View>
          )}

          {/* Action Button */}
          <TouchableOpacity
            style={[
              styles.clockButton,
              isClockedIn ? styles.clockOutButton : styles.clockInButton,
              (isActionLoading || isGettingLocation) && styles.buttonDisabled,
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
                <Text style={styles.clockButtonText}>
                  {isClockedIn ? 'Clock Out' : 'Clock In'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Quick Stats */}
        <View style={styles.quickStatsRow}>
          <View style={styles.quickStatCard}>
            <Ionicons name="time-outline" size={24} color={COLORS.primary} />
            <Text style={styles.quickStatValue}>{formatDuration(elapsedMinutes)}</Text>
            <Text style={styles.quickStatLabel}>Today</Text>
          </View>
          <View style={styles.quickStatCard}>
            <Ionicons name="calendar-outline" size={24} color={COLORS.success} />
            <Text style={styles.quickStatValue}>{history.length}</Text>
            <Text style={styles.quickStatLabel}>This Week</Text>
          </View>
          <View style={styles.quickStatCard}>
            <Ionicons name="cafe-outline" size={24} color={COLORS.amber} />
            <Text style={styles.quickStatValue}>{breakStatus?.todayBreaks?.length || 0}</Text>
            <Text style={styles.quickStatLabel}>Breaks</Text>
          </View>
        </View>

        {/* Assigned Locations (when clocked out) */}
        {!isClockedIn && status?.assignedLocations && status.assignedLocations.length > 0 && (
          <View style={styles.locationsSection}>
            <Text style={styles.sectionTitle}>Your Locations</Text>
            {status.assignedLocations.map((location) => {
              const distance = getDistanceToLocation(location);
              const withinFence = isWithinGeofence(location);

              return (
                <View key={location.id} style={styles.locationCard}>
                  <View style={styles.locationInfo}>
                    <Text style={styles.locationName}>{location.name}</Text>
                    <Text style={styles.locationAddress}>{location.address}</Text>
                    {distance !== null && (
                      <View style={styles.distanceRow}>
                        <Ionicons
                          name={withinFence ? 'checkmark-circle' : 'location'}
                          size={14}
                          color={withinFence ? COLORS.success : COLORS.slate400}
                        />
                        <Text style={[styles.distanceText, withinFence && styles.withinFenceText]}>
                          {distance < 1000
                            ? `${Math.round(distance)}m away`
                            : `${(distance / 1000).toFixed(1)}km away`}
                          {withinFence && ' (within range)'}
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
          <View style={styles.historySection}>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
            {history.slice(0, 3).map((entry) => (
              <View key={entry.id} style={styles.historyCard}>
                <View style={styles.historyLeft}>
                  <Text style={styles.historyDate}>{formatDate(entry.clockInAt)}</Text>
                  <Text style={styles.historyLocation}>{entry.location?.name || 'Unknown'}</Text>
                </View>
                <View style={styles.historyRight}>
                  <Text style={styles.historyTime}>
                    {formatTime(entry.clockInAt)} - {entry.clockOutAt ? formatTime(entry.clockOutAt) : 'Active'}
                  </Text>
                  {entry.totalMinutes && (
                    <Text style={styles.historyDuration}>{formatDuration(entry.totalMinutes)}</Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Bottom spacing */}
        <View style={{ height: SPACING.xxl }} />
      </ScrollView>

      {/* Location Selection Modal */}
      <Modal
        visible={showLocationModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowLocationModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Location</Text>
              <TouchableOpacity onPress={() => setShowLocationModal(false)}>
                <Ionicons name="close" size={24} color={COLORS.slate500} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll}>
              {status?.assignedLocations?.map((location) => {
                const distance = getDistanceToLocation(location);
                const withinFence = isWithinGeofence(location);
                const isSelected = selectedLocation?.id === location.id;

                return (
                  <TouchableOpacity
                    key={location.id}
                    style={[styles.modalLocationCard, isSelected && styles.modalLocationSelected]}
                    onPress={() => setSelectedLocation(location)}
                  >
                    <View style={styles.radioOuter}>
                      {isSelected && <View style={styles.radioInner} />}
                    </View>
                    <View style={styles.modalLocationInfo}>
                      <Text style={styles.modalLocationName}>{location.name}</Text>
                      <Text style={styles.modalLocationAddress}>{location.address}</Text>
                      {distance !== null && (
                        <View style={styles.distanceRow}>
                          <Ionicons
                            name={withinFence ? 'checkmark-circle' : 'alert-circle'}
                            size={14}
                            color={withinFence ? COLORS.success : COLORS.warning}
                          />
                          <Text style={[styles.distanceText, withinFence && styles.withinFenceText]}>
                            {distance < 1000
                              ? `${Math.round(distance)}m`
                              : `${(distance / 1000).toFixed(1)}km`}
                            {!withinFence && ` (outside ${location.geofenceRadius}m range)`}
                          </Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              style={[styles.modalButton, !selectedLocation && styles.buttonDisabled]}
              onPress={handleClockIn}
              disabled={!selectedLocation || isActionLoading}
            >
              {isActionLoading ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <Text style={styles.modalButtonText}>Clock In</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ============================================================================
// FREELANCER HOME - Task focused (original implementation)
// ============================================================================
function FreelancerHome() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentWeekStart, setCurrentWeekStart] = useState(new Date());

  const initialFetchDoneRef = useRef(false);
  const fetchingRef = useRef(false);

  // Get week days
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

// ============================================================================
// STYLES
// ============================================================================
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
  loadingText: {
    marginTop: SPACING.md,
    fontSize: FONT_SIZE.base,
    color: COLORS.slate500,
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

  // Welcome Section (Full-time)
  welcomeSection: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  welcomeGreeting: {
    fontSize: FONT_SIZE.base,
    color: COLORS.slate500,
  },
  welcomeName: {
    fontSize: FONT_SIZE.title,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.slate800,
  },

  // Status Card (Full-time)
  statusCard: {
    marginHorizontal: SPACING.lg,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.md,
  },
  statusCardActive: {
    backgroundColor: COLORS.primary,
  },
  statusCardInactive: {
    backgroundColor: COLORS.white,
  },
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
    color: COLORS.slate800,
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
    color: COLORS.amber,
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
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  clockButtonText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.white,
  },

  // Quick Stats (Full-time)
  quickStatsRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    gap: SPACING.md,
  },
  quickStatCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
    ...SHADOWS.sm,
  },
  quickStatValue: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.slate800,
    marginTop: SPACING.xs,
  },
  quickStatLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.slate500,
    marginTop: 2,
  },

  // Locations Section (Full-time)
  locationsSection: {
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.xxl,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.slate800,
    marginBottom: SPACING.md,
  },
  locationCard: {
    backgroundColor: COLORS.white,
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
    color: COLORS.slate800,
  },
  locationAddress: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.slate500,
    marginTop: 2,
  },
  distanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  distanceText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.slate500,
    marginLeft: SPACING.xs,
  },
  withinFenceText: {
    color: COLORS.success,
  },

  // History Section (Full-time)
  historySection: {
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.xxl,
  },
  historyCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: COLORS.white,
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
    color: COLORS.slate800,
  },
  historyLocation: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.slate500,
  },
  historyTime: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.slate600,
  },
  historyDuration: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.primary,
    marginTop: 2,
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.lg,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  modalTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.slate800,
  },
  modalScroll: {
    maxHeight: 300,
  },
  modalLocationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.slate200,
    marginBottom: SPACING.sm,
  },
  modalLocationSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.primary,
  },
  modalLocationInfo: {
    flex: 1,
  },
  modalLocationName: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.slate800,
  },
  modalLocationAddress: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.slate500,
    marginTop: 2,
  },
  modalButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    marginTop: SPACING.lg,
  },
  modalButtonText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.white,
  },

  // Stats Grid (Freelancer)
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

  // Calendar Section (Freelancer)
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

  // Jobs Section (Freelancer)
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
