import { useState, useEffect, useCallback } from 'react';
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
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
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

export default function AttendanceScreen() {
  const { user } = useAuth();
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
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<CompanyLocation | null>(null);
  const [showBreakNotesModal, setShowBreakNotesModal] = useState(false);
  const [pendingBreakType, setPendingBreakType] = useState<BreakType | null>(null);
  const [breakNotes, setBreakNotes] = useState('');
  const [isEndingBreak, setIsEndingBreak] = useState(false);

  // Timer for current shift
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  // Timer for active break
  const [breakElapsedMinutes, setBreakElapsedMinutes] = useState(0);

  // Check if user is FULL_TIME technician
  const isFullTimeTechnician = user?.technicianType === 'FULL_TIME';

  // Fetch attendance data
  const fetchAttendanceData = useCallback(async () => {
    try {
      setError(null);
      const [statusData, historyData, breakData] = await Promise.all([
        attendanceApi.getStatus(),
        attendanceApi.getHistory({ limit: 10 }),
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

      // Calculate break elapsed time if on break
      if (breakData?.isOnBreak && breakData?.currentBreak?.startedAt) {
        const breakStartTime = new Date(breakData.currentBreak.startedAt).getTime();
        const now = Date.now();
        setBreakElapsedMinutes(Math.floor((now - breakStartTime) / 60000));
      } else {
        setBreakElapsedMinutes(0);
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
        setLocationError('Location permission denied');
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
      setLocationError('Failed to get location');
      setIsGettingLocation(false);
      return null;
    }
  };

  // Handle clock in button press
  const handleClockInPress = async () => {
    const location = await getCurrentLocation();
    if (!location) {
      Alert.alert('Location Required', 'Please enable location services to clock in.');
      return;
    }
    setShowLocationModal(true);
  };

  // Confirm clock in at selected location
  const confirmClockIn = async () => {
    if (!selectedLocation || !currentLocation) return;

    setIsActionLoading(true);
    setShowLocationModal(false);

    try {
      await attendanceApi.clockIn({
        locationId: selectedLocation.id,
        lat: currentLocation.lat,
        lng: currentLocation.lng,
        accuracy: currentLocation.accuracy,
      });
      await fetchAttendanceData();
      Alert.alert('Success', `Clocked in at ${selectedLocation.name}`);
    } catch (err) {
      console.error('Clock in error:', err);
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to clock in');
    } finally {
      setIsActionLoading(false);
      setSelectedLocation(null);
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
              await attendanceApi.clockOut({
                lat: location?.lat || 0,
                lng: location?.lng || 0,
                accuracy: location?.accuracy,
              });
              await fetchAttendanceData();
              Alert.alert('Success', 'Clocked out successfully');
            } catch (err) {
              console.error('Clock out error:', err);
              Alert.alert('Error', err instanceof Error ? err.message : 'Failed to clock out');
            } finally {
              setIsActionLoading(false);
            }
          },
        },
      ]
    );
  };

  // Handle start break - show modal for notes
  const handleStartBreak = (type: BreakType) => {
    setPendingBreakType(type);
    setBreakNotes('');
    setIsEndingBreak(false);
    setShowBreakNotesModal(true);
  };

  // Handle end break - show modal for notes
  const handleEndBreak = () => {
    setPendingBreakType(null);
    setBreakNotes('');
    setIsEndingBreak(true);
    setShowBreakNotesModal(true);
  };

  // Confirm start break with notes
  const confirmStartBreak = async () => {
    if (!pendingBreakType) return;
    setShowBreakNotesModal(false);
    setIsBreakLoading(true);
    try {
      await attendanceApi.startBreak(pendingBreakType, breakNotes || undefined);
      await fetchAttendanceData();
      Alert.alert('Break Started', `Your ${pendingBreakType.toLowerCase()} break has started.`);
    } catch (err) {
      console.error('Start break error:', err);
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to start break');
    } finally {
      setIsBreakLoading(false);
      setPendingBreakType(null);
      setBreakNotes('');
    }
  };

  // Confirm end break with notes
  const confirmEndBreak = async () => {
    setShowBreakNotesModal(false);
    setIsBreakLoading(true);
    try {
      await attendanceApi.endBreak(breakNotes || undefined);
      await fetchAttendanceData();
      Alert.alert('Break Ended', 'Your break has ended. Back to work!');
    } catch (err) {
      console.error('End break error:', err);
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to end break');
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
      <View style={styles.container}>
        <View style={styles.notAvailable}>
          <Ionicons name="information-circle-outline" size={64} color={COLORS.slate300} />
          <Text style={styles.notAvailableTitle}>Not Available</Text>
          <Text style={styles.notAvailableText}>
            Clock-in/clock-out is only available for full-time technicians.
          </Text>
        </View>
      </View>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading attendance...</Text>
      </View>
    );
  }

  // Error state
  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={48} color={COLORS.error} />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={handleRefresh}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isClockedIn = status?.isClockedIn || false;
  const currentEntry = status?.currentEntry;
  const assignedLocations = status?.assignedLocations || [];

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
        {/* Status Card */}
        <View style={styles.statusCard}>
          <View style={styles.statusHeader}>
            <View
              style={[
                styles.statusIndicator,
                { backgroundColor: isClockedIn ? COLORS.success : COLORS.slate400 },
              ]}
            />
            <Text style={styles.statusTitle}>
              {isClockedIn ? 'Clocked In' : 'Clocked Out'}
            </Text>
          </View>

          {isClockedIn && currentEntry && (
            <View style={styles.currentShiftInfo}>
              <View style={styles.shiftDetail}>
                <Ionicons name="location-outline" size={18} color={COLORS.slate500} />
                <Text style={styles.shiftDetailText}>
                  {currentEntry.location?.name || 'Unknown Location'}
                </Text>
              </View>
              <View style={styles.shiftDetail}>
                <Ionicons name="time-outline" size={18} color={COLORS.slate500} />
                <Text style={styles.shiftDetailText}>
                  Started at {formatTime(currentEntry.clockInAt)}
                </Text>
              </View>
              <View style={styles.elapsedTimeContainer}>
                <Text style={styles.elapsedTimeLabel}>Time on shift</Text>
                <Text style={styles.elapsedTime}>{formatDuration(elapsedMinutes)}</Text>
              </View>

              {/* Break Section */}
              {breakStatus?.isOnBreak ? (
                <View style={styles.breakSection}>
                  <View style={styles.breakActiveIndicator}>
                    <Ionicons name="cafe" size={20} color={COLORS.warning} />
                    <Text style={styles.breakActiveText}>
                      On {breakStatus.currentBreak?.type?.toLowerCase()} break
                    </Text>
                  </View>
                  {/* Live Break Timer */}
                  <View style={styles.breakTimerContainer}>
                    <Text style={styles.breakTimerLabel}>Break Duration</Text>
                    <Text style={styles.breakTimerValue}>{formatDuration(breakElapsedMinutes)}</Text>
                  </View>
                  {breakStatus.currentBreak?.startedAt && (
                    <Text style={styles.breakTimeText}>
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
                        <Text style={styles.endBreakButtonText}>End Break</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.breakSection}>
                  <Text style={styles.breakSectionTitle}>Take a Break</Text>
                  <View style={styles.breakButtonsRow}>
                    <TouchableOpacity
                      style={styles.breakTypeButton}
                      onPress={() => handleStartBreak('LUNCH')}
                      disabled={isBreakLoading}
                    >
                      <Ionicons name="restaurant-outline" size={20} color={COLORS.primary} />
                      <Text style={styles.breakTypeButtonText}>Lunch</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.breakTypeButton}
                      onPress={() => handleStartBreak('SHORT')}
                      disabled={isBreakLoading}
                    >
                      <Ionicons name="cafe-outline" size={20} color={COLORS.primary} />
                      <Text style={styles.breakTypeButtonText}>Short</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.breakTypeButton}
                      onPress={() => handleStartBreak('OTHER')}
                      disabled={isBreakLoading}
                    >
                      <Ionicons name="time-outline" size={20} color={COLORS.primary} />
                      <Text style={styles.breakTypeButtonText}>Other</Text>
                    </TouchableOpacity>
                  </View>
                  {breakStatus?.totalBreakMinutes && breakStatus.totalBreakMinutes > 0 && (
                    <Text style={styles.totalBreakText}>
                      Total break time: {formatDuration(breakStatus.totalBreakMinutes)}
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
              { backgroundColor: isClockedIn ? COLORS.error : COLORS.success },
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
                  {isClockedIn ? 'Clock Out' : 'Clock In'}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {locationError && (
            <Text style={styles.locationErrorText}>{locationError}</Text>
          )}
        </View>

        {/* Assigned Locations */}
        {!isClockedIn && assignedLocations.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Assigned Locations</Text>
            {assignedLocations.map((location) => {
              const distance = getDistanceToLocation(location);
              const isWithinGeofence = distance !== null && distance <= location.geofenceRadius;
              return (
                <View key={location.id} style={styles.locationCard}>
                  <View style={styles.locationInfo}>
                    <View style={styles.locationHeader}>
                      <Ionicons name="business-outline" size={20} color={COLORS.primary} />
                      <Text style={styles.locationName}>{location.name}</Text>
                    </View>
                    <Text style={styles.locationAddress} numberOfLines={2}>
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
                          {formatDistance(distance)} away
                          {isWithinGeofence && ' (within range)'}
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
        {isClockedIn && breakStatus?.todayBreaks && breakStatus.todayBreaks.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Today's Breaks</Text>
            {breakStatus.todayBreaks.map((breakItem: any, index: number) => (
              <View key={breakItem.id || index} style={styles.breakHistoryCard}>
                <View style={styles.breakHistoryHeader}>
                  <View style={styles.breakTypeTag}>
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
                    <View style={styles.breakActiveBadge}>
                      <Text style={styles.breakActiveBadgeText}>Active</Text>
                    </View>
                  ) : (
                    <Text style={styles.breakDurationText}>
                      {formatDuration(breakItem.durationMinutes || 0)}
                    </Text>
                  )}
                </View>
                <View style={styles.breakHistoryTimes}>
                  <Text style={styles.breakHistoryTimeText}>
                    {formatTime(breakItem.startedAt)}
                    {breakItem.endedAt && ` - ${formatTime(breakItem.endedAt)}`}
                  </Text>
                </View>
                {breakItem.notes && (
                  <Text style={styles.breakNotesText}>{breakItem.notes}</Text>
                )}
              </View>
            ))}
            {breakStatus.totalBreakMinutes > 0 && (
              <View style={styles.totalBreakSummary}>
                <Text style={styles.totalBreakSummaryLabel}>Total break time today</Text>
                <Text style={styles.totalBreakSummaryValue}>
                  {formatDuration(breakStatus.totalBreakMinutes)}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Recent History */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent History</Text>

          {history.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={48} color={COLORS.slate300} />
              <Text style={styles.emptyText}>No attendance records yet</Text>
            </View>
          ) : (
            history.map((entry) => (
              <View key={entry.id} style={styles.historyCard}>
                <View style={styles.historyHeader}>
                  <Text style={styles.historyDate}>{formatDate(entry.clockInAt)}</Text>
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
                        ? 'Active'
                        : entry.status === 'AUTO_OUT'
                        ? 'Auto'
                        : 'Done'}
                    </Text>
                  </View>
                </View>

                <Text style={styles.historyLocation}>
                  {entry.location?.name || 'Unknown Location'}
                </Text>

                <View style={styles.historyTimes}>
                  <View style={styles.historyTimeItem}>
                    <Text style={styles.historyTimeLabel}>In</Text>
                    <Text style={styles.historyTimeValue}>
                      {formatTime(entry.clockInAt)}
                    </Text>
                  </View>
                  {entry.clockOutAt && (
                    <View style={styles.historyTimeItem}>
                      <Text style={styles.historyTimeLabel}>Out</Text>
                      <Text style={styles.historyTimeValue}>
                        {formatTime(entry.clockOutAt)}
                      </Text>
                    </View>
                  )}
                  {entry.totalMinutes && (
                    <View style={styles.historyTimeItem}>
                      <Text style={styles.historyTimeLabel}>Total</Text>
                      <Text style={[styles.historyTimeValue, { color: COLORS.primary }]}>
                        {formatDuration(entry.totalMinutes)}
                      </Text>
                    </View>
                  )}
                </View>

                {!entry.clockInWithinGeofence && (
                  <View style={styles.geofenceWarning}>
                    <Ionicons name="warning-outline" size={14} color={COLORS.warning} />
                    <Text style={styles.geofenceWarningText}>
                      Clocked in outside geofence
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
                <Ionicons name="close" size={24} color={COLORS.slate600} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Choose the location you're clocking in at
            </Text>

            <ScrollView style={styles.modalList}>
              {assignedLocations.map((location) => {
                const distance = getDistanceToLocation(location);
                const isWithinGeofence =
                  distance !== null && distance <= location.geofenceRadius;
                const isSelected = selectedLocation?.id === location.id;

                return (
                  <TouchableOpacity
                    key={location.id}
                    style={[
                      styles.modalLocationItem,
                      isSelected && styles.modalLocationItemSelected,
                    ]}
                    onPress={() => setSelectedLocation(location)}
                  >
                    <View style={styles.modalLocationInfo}>
                      <Text style={styles.modalLocationName}>{location.name}</Text>
                      <Text style={styles.modalLocationAddress} numberOfLines={1}>
                        {location.address}
                      </Text>
                      {distance !== null && (
                        <View style={styles.distanceRow}>
                          <Ionicons
                            name={isWithinGeofence ? 'checkmark-circle' : 'navigate-outline'}
                            size={14}
                            color={isWithinGeofence ? COLORS.success : COLORS.slate400}
                          />
                          <Text
                            style={[
                              styles.modalDistanceText,
                              { color: isWithinGeofence ? COLORS.success : COLORS.slate500 },
                            ]}
                          >
                            {formatDistance(distance)}
                            {isWithinGeofence && ' - In range'}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View
                      style={[
                        styles.radioButton,
                        isSelected && styles.radioButtonSelected,
                      ]}
                    >
                      {isSelected && (
                        <View style={styles.radioButtonInner} />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              style={[
                styles.confirmButton,
                !selectedLocation && styles.confirmButtonDisabled,
              ]}
              onPress={confirmClockIn}
              disabled={!selectedLocation}
            >
              <Text style={styles.confirmButtonText}>
                Clock In at {selectedLocation?.name || 'Selected Location'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Break Notes Modal */}
      <Modal
        visible={showBreakNotesModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowBreakNotesModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {isEndingBreak ? 'End Break' : `Start ${pendingBreakType?.toLowerCase()} Break`}
              </Text>
              <TouchableOpacity onPress={() => setShowBreakNotesModal(false)}>
                <Ionicons name="close" size={24} color={COLORS.slate600} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              {isEndingBreak
                ? 'Add any notes about your break (optional)'
                : 'Add any notes about your break (optional)'}
            </Text>

            <TextInput
              style={styles.notesInput}
              placeholder="Enter notes (optional)..."
              placeholderTextColor={COLORS.slate400}
              value={breakNotes}
              onChangeText={setBreakNotes}
              multiline
              numberOfLines={3}
              maxLength={500}
              textAlignVertical="top"
            />

            <Text style={styles.characterCount}>
              {breakNotes.length}/500 characters
            </Text>

            <View style={styles.breakModalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setShowBreakNotesModal(false);
                  setPendingBreakType(null);
                  setIsEndingBreak(false);
                  setBreakNotes('');
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.confirmButton,
                  { flex: 1, backgroundColor: isEndingBreak ? COLORS.warning : COLORS.success },
                ]}
                onPress={isEndingBreak ? confirmEndBreak : confirmStartBreak}
              >
                <Ionicons
                  name={isEndingBreak ? 'checkmark-circle-outline' : 'cafe-outline'}
                  size={20}
                  color={COLORS.white}
                />
                <Text style={styles.confirmButtonText}>
                  {isEndingBreak ? 'End Break' : 'Start Break'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    backgroundColor: COLORS.slate50,
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
    backgroundColor: COLORS.slate50,
    padding: SPACING.xl,
  },
  errorText: {
    fontSize: FONT_SIZE.base,
    color: COLORS.error,
    textAlign: 'center',
    marginTop: SPACING.md,
  },
  retryButton: {
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
  },
  retryButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.semibold,
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
    color: COLORS.slate800,
    marginTop: SPACING.lg,
  },
  notAvailableText: {
    fontSize: FONT_SIZE.base,
    color: COLORS.slate500,
    textAlign: 'center',
    marginTop: SPACING.sm,
    maxWidth: 280,
  },

  // Status card
  statusCard: {
    backgroundColor: COLORS.white,
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
    color: COLORS.slate800,
  },
  currentShiftInfo: {
    marginTop: SPACING.lg,
    paddingTop: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.slate100,
  },
  shiftDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  shiftDetailText: {
    fontSize: FONT_SIZE.base,
    color: COLORS.slate600,
  },
  elapsedTimeContainer: {
    marginTop: SPACING.md,
    alignItems: 'center',
  },
  elapsedTimeLabel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.slate400,
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
    borderTopColor: COLORS.slate100,
  },
  breakSectionTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.slate600,
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
    backgroundColor: COLORS.primaryLight,
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
    backgroundColor: COLORS.warningLight,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.md,
  },
  breakActiveText: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.warning,
    textTransform: 'capitalize',
  },
  breakTimeText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.slate500,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  endBreakButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.warning,
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
    color: COLORS.slate400,
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
    color: COLORS.warning,
    marginTop: SPACING.xs,
  },
  // Break history
  breakHistoryCard: {
    backgroundColor: COLORS.white,
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
    backgroundColor: COLORS.primaryLight,
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
    backgroundColor: COLORS.warningLight,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.sm,
  },
  breakActiveBadgeText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.warning,
  },
  breakDurationText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.slate700,
  },
  breakHistoryTimes: {
    marginTop: SPACING.xs,
  },
  breakHistoryTimeText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.slate500,
  },
  breakNotesText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.slate400,
    fontStyle: 'italic',
    marginTop: SPACING.xs,
  },
  totalBreakSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.slate100,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.sm,
  },
  totalBreakSummaryLabel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.slate600,
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
    color: COLORS.slate800,
    marginBottom: SPACING.lg,
  },

  // Location card
  locationCard: {
    backgroundColor: COLORS.white,
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
    color: COLORS.slate800,
  },
  locationAddress: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.slate500,
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
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    padding: SPACING.xxxl,
    alignItems: 'center',
    ...SHADOWS.sm,
  },
  emptyText: {
    fontSize: FONT_SIZE.base,
    color: COLORS.slate400,
    marginTop: SPACING.md,
  },

  // History card
  historyCard: {
    backgroundColor: COLORS.white,
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
    color: COLORS.slate800,
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
    color: COLORS.slate500,
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
    color: COLORS.slate400,
    marginBottom: SPACING.xs,
  },
  historyTimeValue: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.slate700,
  },
  geofenceWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.slate100,
  },
  geofenceWarningText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.warning,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.xl,
    maxHeight: '80%',
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
    color: COLORS.slate800,
  },
  modalSubtitle: {
    fontSize: FONT_SIZE.base,
    color: COLORS.slate500,
    marginBottom: SPACING.lg,
  },
  modalList: {
    maxHeight: 300,
  },
  modalLocationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.slate200,
    marginBottom: SPACING.md,
  },
  modalLocationItemSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  modalLocationInfo: {
    flex: 1,
  },
  modalLocationName: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.slate800,
  },
  modalLocationAddress: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.slate500,
    marginTop: SPACING.xs,
  },
  modalDistanceText: {
    fontSize: FONT_SIZE.xs,
    marginTop: SPACING.xs,
  },
  radioButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.slate300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioButtonSelected: {
    borderColor: COLORS.primary,
  },
  radioButtonInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.primary,
  },
  confirmButton: {
    backgroundColor: COLORS.success,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    marginTop: SPACING.lg,
  },
  confirmButtonDisabled: {
    backgroundColor: COLORS.slate300,
  },
  confirmButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
  },
  // Break notes modal
  notesInput: {
    backgroundColor: COLORS.slate50,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.slate200,
    padding: SPACING.md,
    fontSize: FONT_SIZE.base,
    color: COLORS.slate800,
    minHeight: 100,
    marginBottom: SPACING.sm,
  },
  characterCount: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.slate400,
    textAlign: 'right',
    marginBottom: SPACING.lg,
  },
  breakModalButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    backgroundColor: COLORS.slate100,
  },
  cancelButtonText: {
    color: COLORS.slate600,
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.semibold,
  },
});
