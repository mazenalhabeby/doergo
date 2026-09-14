import { useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { rankClockInLocations } from '@hbcfield/shared/client';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Dimensions,
  Pressable,
  Modal,
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
  /** The position read when choosing; the list is ordered and measured from it. */
  fix: { lat: number; lng: number; accuracy?: number | null } | null;
  confirmLabel?: string;
  confirmDisabled?: boolean;
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
  fix,
  confirmLabel,
  confirmDisabled = false,
}: LocationPickerSheetProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  // The shared order: inside an area, a shift today, primary, nearest — the same as the web.
  const ranked = useMemo(() => rankClockInLocations(locations, fix), [locations, fix]);
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

  const canConfirm = !!selectedLocation;
  const label =
    confirmLabel ||
    (selectedLocation ? t('attendance.picker.clockInAt', { name: selectedLocation.name }) : t('attendance.clockIn'));

  return (
    <Modal visible transparent statusBarTranslucent animationType="none" onRequestClose={handleClose}>
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: overlayAnim }]}>
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill}>
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
              {t('attendance.picker.title')}
            </Text>
            <TouchableOpacity onPress={handleClose}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            {t('attendance.picker.subtitle')}
          </Text>

          {/* Location list */}
          <ScrollView style={styles.list}>
            {ranked.map(({ location, distanceM: distance, inside: isWithinGeofence }) => {
              const isSelected = selectedLocation?.id === location.id;

              /*
                Would this workspace take a clock-in from where they are standing?

                `awayAllowed` comes from the server, answered by the same rule the
                clock-in refuses by — the site's ceiling and this member's grant.
                A row is unusable only when they are OUTSIDE the ring AND the site
                will not take them away from it.

                Shown greyed with the reason rather than removed: a workspace
                vanishing from the list while you are standing two hundred metres
                from it is a mystery, and the member cannot tell whether they did
                something wrong or the app is broken. Disabled with a sentence
                says which of the two it is.
              */
              const outsideRing = distance !== null && !isWithinGeofence;
              const unusable = outsideRing && location.awayAllowed === false;

              return (
                <TouchableOpacity
                  key={location.id}
                  disabled={unusable}
                  style={[
                    styles.locationItem,
                    { borderColor: colors.border },
                    unusable && { opacity: 0.45 },
                    isSelected && [
                      styles.locationItemSelected,
                      { backgroundColor: colors.primaryLight },
                    ],
                  ]}
                  onPress={() => onSelect(location)}
                >
                  <View style={styles.locationInfo}>
                    <View style={styles.nameRow}>
                      <Text style={[styles.locationName, { color: colors.textPrimary }]}>
                        {location.name}
                      </Text>
                      {location.shiftToday && (
                        <Text style={[styles.badge, { color: colors.textSecondary, borderColor: colors.border }]}>
                          {t('attendance.picker.shiftToday')}
                        </Text>
                      )}
                      {location.isPrimary && (
                        <Text style={[styles.badge, { color: colors.textSecondary, borderColor: colors.border }]}>
                          {t('attendance.picker.primary')}
                        </Text>
                      )}
                    </View>
                    <Text
                      style={[styles.locationAddress, { color: colors.textMuted }]}
                      numberOfLines={1}
                    >
                      {location.address}
                    </Text>
                    {unusable && (
                      <Text style={[styles.locationAddress, { color: colors.textMuted, marginTop: 2 }]}>
                        {t('attendance.picker.onSiteOnly')}
                      </Text>
                    )}
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
                          {isWithinGeofence
                            ? t('attendance.picker.inRange', { distance: formatDistance(distance) })
                            : t('attendance.picker.away', { distance: formatDistance(distance) })}
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
    </Modal>
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
  nameRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  badge: {
    fontSize: FONT_SIZE.xs,
    borderWidth: 1,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm,
    overflow: 'hidden',
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
