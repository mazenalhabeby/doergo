import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Animated,
  Dimensions,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ScrollView,
  Keyboard,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { GEOFENCE_EXCURSION } from '@hbcfield/shared/client';
import { useTheme } from '../contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../lib/constants';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const ACCENT = '#ea580c'; // orange-600 — matches the web Out-of-Ring panel

interface OutOfRingSheetProps {
  visible: boolean;
  spaceName: string;
  onClose: () => void;
  onSubmit: (reason: string, minutes: number) => void;
  isLoading?: boolean;
}

/**
 * Bottom sheet shown when a clocked-in worker leaves their space's ring. They
 * pick a reason + how long they'll be out; the request goes to a responsible
 * person for approval. Mirrors the clock-out sheet's animation/styling.
 */
export function OutOfRingSheet({ visible, spaceName, onClose, onSubmit, isLoading = false }: OutOfRingSheetProps) {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  const [reason, setReason] = useState('');
  const [minutes, setMinutes] = useState<number>(GEOFENCE_EXCURSION.DURATION_PRESETS[0]);
  const [customMode, setCustomMode] = useState(false);
  const [customValue, setCustomValue] = useState('');

  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;

  const effectiveMinutes = customMode ? parseInt(customValue, 10) || 0 : minutes;
  const canConfirm =
    reason.trim().length > 0 &&
    effectiveMinutes > 0 &&
    effectiveMinutes <= GEOFENCE_EXCURSION.CUSTOM_MAX_MINUTES;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(overlayAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, damping: 25, stiffness: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const animateClose = useCallback(
    (cb?: () => void) => {
      Keyboard.dismiss();
      Animated.parallel([
        Animated.timing(overlayAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: SCREEN_HEIGHT, duration: 250, useNativeDriver: true }),
      ]).start(() => cb?.());
    },
    [overlayAnim, slideAnim],
  );

  const reset = () => {
    setReason('');
    setMinutes(GEOFENCE_EXCURSION.DURATION_PRESETS[0]);
    setCustomMode(false);
    setCustomValue('');
  };

  const handleClose = useCallback(() => {
    animateClose(() => {
      reset();
      onClose();
    });
  }, [animateClose, onClose]);

  const handleConfirm = useCallback(() => {
    if (!isLoading && canConfirm) {
      const r = reason.trim();
      const m = effectiveMinutes;
      animateClose(() => {
        reset();
        onSubmit(r, m);
      });
    }
  }, [isLoading, canConfirm, reason, effectiveMinutes, animateClose, onSubmit]);

  const fmtChip = (m: number) => (m >= 60 ? t('attendance.outOfRing.hoursShort', { h: m / 60 }) : `${m}m`);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: overlayAnim }]}>
          {Platform.OS === 'ios' ? (
            <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill}>
              <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
            </BlurView>
          ) : (
            <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.65)' }]} onPress={handleClose} />
          )}
        </Animated.View>

        <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
          <View style={[styles.handle, { backgroundColor: isDark ? '#4b5563' : '#d1d5db' }]} />
          <View style={[styles.content, { backgroundColor: colors.card }]}>
            <ScrollView ref={scrollRef} bounces={false} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.header}>
                <View style={styles.titleRow}>
                  <Ionicons name="navigate" size={22} color={ACCENT} />
                  <Text style={[styles.title, { color: colors.textPrimary }]}>{t('attendance.outOfRing.sheetTitle')}</Text>
                </View>
                <TouchableOpacity onPress={handleClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close" size={24} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                {t('attendance.outOfRing.sheetSubtitle', { space: spaceName })}
              </Text>

              {/* Duration picker */}
              <Text style={[styles.label, { color: colors.textSecondary }]}>{t('attendance.outOfRing.howLong')}</Text>
              <View style={styles.chips}>
                {GEOFENCE_EXCURSION.DURATION_PRESETS.map((m) => {
                  const active = !customMode && minutes === m;
                  return (
                    <TouchableOpacity
                      key={m}
                      style={[
                        styles.chip,
                        { borderColor: active ? ACCENT : colors.border, backgroundColor: active ? ACCENT : 'transparent' },
                      ]}
                      onPress={() => {
                        setCustomMode(false);
                        setMinutes(m);
                      }}
                    >
                      <Text style={[styles.chipText, { color: active ? COLORS.white : colors.textPrimary }]}>{fmtChip(m)}</Text>
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity
                  style={[
                    styles.chip,
                    { borderColor: customMode ? ACCENT : colors.border, backgroundColor: customMode ? ACCENT : 'transparent' },
                  ]}
                  onPress={() => setCustomMode(true)}
                >
                  <Text style={[styles.chipText, { color: customMode ? COLORS.white : colors.textPrimary }]}>
                    {t('attendance.outOfRing.custom')}
                  </Text>
                </TouchableOpacity>
              </View>

              {customMode && (
                <TextInput
                  style={[
                    styles.customInput,
                    { backgroundColor: isDark ? colors.surfaceRaised : '#f8fafc', borderColor: colors.border, color: colors.textPrimary },
                  ]}
                  placeholder={t('attendance.outOfRing.customPlaceholder')}
                  placeholderTextColor={colors.textMuted}
                  value={customValue}
                  onChangeText={(v) => setCustomValue(v.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  maxLength={3}
                />
              )}

              {/* Reason */}
              <Text style={[styles.label, { color: colors.textSecondary, marginTop: SPACING.lg }]}>
                {t('attendance.outOfRing.reason')}
              </Text>
              <TextInput
                style={[
                  styles.reasonInput,
                  { backgroundColor: isDark ? colors.surfaceRaised : '#f8fafc', borderColor: reason.trim() ? ACCENT : colors.border, color: colors.textPrimary },
                ]}
                placeholder={t('attendance.outOfRing.reasonPlaceholder')}
                placeholderTextColor={colors.textMuted}
                value={reason}
                onChangeText={setReason}
                multiline
                numberOfLines={3}
                maxLength={300}
                textAlignVertical="top"
                onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300)}
              />

              <View style={styles.buttons}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
                  onPress={handleClose}
                  disabled={isLoading}
                >
                  <Text style={[styles.cancelText, { color: colors.textSecondary }]}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmBtn, (!canConfirm || isLoading) && styles.disabled]}
                  onPress={handleConfirm}
                  disabled={!canConfirm || isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color={COLORS.white} />
                  ) : (
                    <>
                      <Ionicons name="send" size={18} color={COLORS.white} />
                      <Text style={styles.confirmText}>{t('attendance.outOfRing.submit')}</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
            <View style={{ height: insets.bottom }} />
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'flex-end' },
  sheet: { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 20 },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: SPACING.sm },
  content: { borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACING.xl, paddingBottom: SPACING.lg, maxHeight: SCREEN_HEIGHT * 0.85 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  title: { fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.bold },
  subtitle: { fontSize: FONT_SIZE.base, marginBottom: SPACING.lg },
  label: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, marginBottom: SPACING.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: { paddingVertical: SPACING.sm, paddingHorizontal: SPACING.lg, borderRadius: RADIUS.full ?? 999, borderWidth: 1.5 },
  chipText: { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold },
  customInput: { marginTop: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1.5, padding: SPACING.md, fontSize: FONT_SIZE.base },
  reasonInput: { borderRadius: RADIUS.md, borderWidth: 1.5, padding: SPACING.md, fontSize: FONT_SIZE.base, height: 90, lineHeight: 22 },
  buttons: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.xl },
  cancelBtn: { flex: 1, paddingVertical: SPACING.lg, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  cancelText: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.semibold },
  confirmBtn: { flex: 1, flexDirection: 'row', paddingVertical: SPACING.lg, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, backgroundColor: ACCENT },
  confirmText: { color: COLORS.white, fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold },
  disabled: { opacity: 0.6 },
});
