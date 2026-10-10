import { useState, useCallback, useRef } from 'react';
import { Text, StyleSheet, TouchableOpacity, TextInput, View, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { GEOFENCE_EXCURSION } from '@hbcfield/shared/client';
import { useTheme } from '../contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../lib/constants';
import { SlideSheet, SlideSheetActions, SlideSheetHeader, useSlideSheet } from './slide-sheet';

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
  const scrollRef = useRef<ScrollView>(null);

  const [reason, setReason] = useState('');
  const [minutes, setMinutes] = useState<number>(GEOFENCE_EXCURSION.DURATION_PRESETS[0]);
  const [customMode, setCustomMode] = useState(false);
  const [customValue, setCustomValue] = useState('');

  const sheet = useSlideSheet(visible, { dismissKeyboard: true });
  const { animateClose } = sheet;

  const effectiveMinutes = customMode ? parseInt(customValue, 10) || 0 : minutes;
  const canConfirm =
    reason.trim().length > 0 &&
    effectiveMinutes > 0 &&
    effectiveMinutes <= GEOFENCE_EXCURSION.CUSTOM_MAX_MINUTES;

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
    <SlideSheet visible={visible} sheet={sheet} onClose={handleClose} avoidKeyboard maxHeightFraction={0.85}>
      <ScrollView ref={scrollRef} bounces={false} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <SlideSheetHeader
          title={t('attendance.outOfRing.sheetTitle')}
          onClose={handleClose}
          icon={{ name: 'navigate', color: ACCENT }}
        />

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

        <SlideSheetActions
          style={styles.buttons}
          onCancel={handleClose}
          cancelLabel={t('common.cancel')}
          onConfirm={handleConfirm}
          confirmLabel={t('attendance.outOfRing.submit')}
          confirmIcon="send"
          confirmIconSize={18}
          confirmColor={ACCENT}
          disabled={!canConfirm || isLoading}
          isLoading={isLoading}
        />
      </ScrollView>
    </SlideSheet>
  );
}

const styles = StyleSheet.create({
  subtitle: { fontSize: FONT_SIZE.base, marginBottom: SPACING.lg },
  label: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, marginBottom: SPACING.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: { paddingVertical: SPACING.sm, paddingHorizontal: SPACING.lg, borderRadius: RADIUS.full ?? 999, borderWidth: 1.5 },
  chipText: { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold },
  customInput: { marginTop: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1.5, padding: SPACING.md, fontSize: FONT_SIZE.base },
  reasonInput: { borderRadius: RADIUS.md, borderWidth: 1.5, padding: SPACING.md, fontSize: FONT_SIZE.base, height: 90, lineHeight: 22 },
  buttons: { marginTop: SPACING.xl },
});
