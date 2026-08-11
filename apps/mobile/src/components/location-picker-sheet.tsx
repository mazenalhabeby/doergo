import { useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Dimensions,
  Pressable,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import type { CompanyLocation } from '../lib/api';
import { useTheme } from '../contexts/theme-context';
import {
  COLORS,
  SPACING,
  RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
} from '../lib/constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LocationPickerSheetProps {
  visible: boolean;
  locations: CompanyLocation[];
  selectedLocation: CompanyLocation | null;
  onSelect: (location: CompanyLocation) => void;
  onConfirm: () => void;
  onClose: () => void;
  /** Calculate distance in meters from current position to a location */
  getDistance: (location: CompanyLocation) => number | null;
  confirmLabel?: string;
  confirmDisabled?: boolean;
  /** When true, offer a "Remote" option (member has allowRemote). */
  allowRemote?: boolean;
  /** Whether the Remote option is currently selected. */
  remoteSelected?: boolean;
  /** Called when the Remote option is picked. */
  onSelectRemote?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatDistance = (meters: number): string => {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
};

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LocationPickerSheet({
  visible,
  locations,
  selectedLocation,
  onSelect,
  onConfirm,
  onClose,
  getDistance,
  confirmLabel,
  confirmDisabled = false,
  allowRemote = false,
  remoteSelected = false,
  onSelectRemote,
}: LocationPickerSheetProps) {
  const { colors, isDark } = useTheme();
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;
  const hasAnimatedIn = useRef(false);

  // Trigger open animation when visible turns true
  if (visible && !hasAnimatedIn.current) {
    hasAnimatedIn.current = true;
    slideAnim.setValue(SCREEN_HEIGHT);
    overlayAnim.setValue(0);
    Animated.parallel([
      Animated.timing(overlayAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, damping: 25, stiffness: 200, useNativeDriver: true }),
    ]).start();
  }

  // Reset flag when hidden
  if (!visible && hasAnimatedIn.current) {
    hasAnimatedIn.current = false;
  }

  const handleClose = useCallback(() => {
    Animated.parallel([
      Animated.timing(overlayAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: SCREEN_HEIGHT, duration: 250, useNativeDriver: true }),
    ]).start(() => onClose());
  }, [slideAnim, overlayAnim, onClose]);

  if (!visible) return null;

  const canConfirm = remoteSelected || !!selectedLocation;
  const label =
    confirmLabel ||
    (remoteSelected
      ? 'Clock in remotely'
      : `Clock In at ${selectedLocation?.name || 'Selected Location'}`);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: overlayAnim }]}>
        <BlurView intensity={40} tint={isDark ? 'light' : 'dark'} style={StyleSheet.absoluteFill}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        </BlurView>
      </Animated.View>
      <Animated.View
        style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}
      >
        <View style={[styles.handle, { backgroundColor: colors.borderLight }]} />
        <View style={[styles.content, { backgroundColor: colors.card }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              Select Location
            </Text>
            <TouchableOpacity onPress={handleClose}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            Choose the location you're clocking in at
          </Text>

          {/* Location list */}
          <ScrollView style={styles.list}>
            {/* Remote option (members with allowRemote) — no location / geofence */}
            {allowRemote && (
              <TouchableOpacity
                style={[
                  styles.locationItem,
                  { borderColor: colors.border },
                  remoteSelected && [
                    styles.locationItemSelected,
                    { backgroundColor: colors.primaryLight },
                  ],
                ]}
                onPress={() => onSelectRemote?.()}
              >
                <View style={styles.locationInfo}>
                  <View style={styles.distanceRow}>
                    <Ionicons name="home-outline" size={16} color={colors.textPrimary} />
                    <Text style={[styles.locationName, { color: colors.textPrimary }]}>
                      Work remotely
                    </Text>
                  </View>
                  <Text
                    style={[styles.locationAddress, { color: colors.textMuted }]}
                    numberOfLines={1}
                  >
                    Clock in from anywhere — no location needed
                  </Text>
                </View>
                <View
                  style={[
                    styles.radio,
                    { borderColor: colors.borderLight },
                    remoteSelected && styles.radioSelected,
                  ]}
                >
                  {remoteSelected && <View style={styles.radioInner} />}
                </View>
              </TouchableOpacity>
            )}
            {locations.map((location) => {
              const distance = getDistance(location);
              const isWithinGeofence =
                distance !== null && distance <= location.geofenceRadius;
              const isSelected = selectedLocation?.id === location.id;

              return (
                <TouchableOpacity
                  key={location.id}
                  style={[
                    styles.locationItem,
                    { borderColor: colors.border },
                    isSelected && [
                      styles.locationItemSelected,
                      { backgroundColor: colors.primaryLight },
                    ],
                  ]}
                  onPress={() => onSelect(location)}
                >
                  <View style={styles.locationInfo}>
                    <Text style={[styles.locationName, { color: colors.textPrimary }]}>
                      {location.name}
                    </Text>
                    <Text
                      style={[styles.locationAddress, { color: colors.textMuted }]}
                      numberOfLines={1}
                    >
                      {location.address}
                    </Text>
                    {distance !== null && (
                      <View style={styles.distanceRow}>
                        <Ionicons
                          name={
                            isWithinGeofence
                              ? 'checkmark-circle'
                              : 'navigate-outline'
                          }
                          size={14}
                          color={
                            isWithinGeofence ? COLORS.success : colors.textMuted
                          }
                        />
                        <Text
                          style={[
                            styles.distanceText,
                            {
                              color: isWithinGeofence
                                ? COLORS.success
                                : colors.textMuted,
                            },
                          ]}
                        >
                          {formatDistance(distance)}
                          {isWithinGeofence ? ' - In range' : ` away`}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View
                    style={[
                      styles.radio,
                      { borderColor: colors.borderLight },
                      isSelected && styles.radioSelected,
                    ]}
                  >
                    {isSelected && <View style={styles.radioInner} />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Confirm button */}
          <TouchableOpacity
            style={[
              styles.confirmButton,
              (!canConfirm || confirmDisabled) && styles.confirmButtonDisabled,
            ]}
            onPress={onConfirm}
            disabled={!canConfirm || confirmDisabled}
          >
            <Text style={styles.confirmButtonText}>{label}</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '80%',
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: SPACING.sm,
  },
  content: {
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  title: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.bold,
  },
  subtitle: {
    fontSize: FONT_SIZE.base,
    marginBottom: SPACING.lg,
  },
  list: {
    maxHeight: 300,
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    marginBottom: SPACING.md,
  },
  locationItemSelected: {
    borderColor: COLORS.primary,
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
    marginTop: SPACING.xs,
  },
  distanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.xs,
  },
  distanceText: {
    fontSize: FONT_SIZE.xs,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: COLORS.primary,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.primary,
  },
  confirmButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.success,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
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
});
