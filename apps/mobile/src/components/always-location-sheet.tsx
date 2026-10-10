import { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../lib/constants';
import { SlideSheet, useSlideSheet } from './slide-sheet';

const BRAND = '#2563EB';
const GREEN = '#059669';

/**
 * Guided "enable Always location" sheet. The OS won't let an app flip background
 * location itself past the first ask, so we prime the worker with a clear reason,
 * a visual of the exact option to pick ("Allow all the time"), numbered steps,
 * then a prominent button into the OS settings — the in-app equivalent of the
 * grant-permission + coach-mark flow other apps use for this OS limitation.
 */
export function AlwaysLocationSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const sheet = useSlideSheet(visible);
  const { animateClose } = sheet;

  const handleClose = useCallback(() => animateClose(onClose), [animateClose, onClose]);
  const handleOpenSettings = useCallback(() => {
    animateClose(() => {
      onClose();
      Linking.openSettings();
    });
  }, [animateClose, onClose]);

  // The four options the OS location chooser shows — "Allow all the time" is the
  // one to pick, highlighted with a pointer to mirror the native screen.
  const chosenLabel = t('attendance.alwaysLocation.optAllowAlways');
  const otherOptions = [
    t('attendance.alwaysLocation.optWhileUsing'),
    t('attendance.alwaysLocation.optAsk'),
    t('attendance.alwaysLocation.optDeny'),
  ];

  const steps = [
    t('attendance.alwaysLocation.step1'),
    t('attendance.alwaysLocation.step2'),
    t('attendance.alwaysLocation.step3'),
  ];

  return (
    <SlideSheet visible={visible} sheet={sheet} onClose={handleClose} maxHeightFraction={0.9}>
      <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={[styles.heroIcon, { backgroundColor: BRAND + '18' }]}>
            <Ionicons name="navigate" size={30} color={BRAND} />
          </View>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{t('attendance.alwaysLocation.sheetTitle')}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {t('attendance.alwaysLocation.sheetBody')}
          </Text>
        </View>

        {/* Visual: the OS location chooser with the right option highlighted */}
        <View style={[styles.chooser, { backgroundColor: isDark ? colors.surfaceRaised : '#f8fafc', borderColor: colors.border }]}>
          <Text style={[styles.chooserLabel, { color: colors.textMuted }]}>{t('attendance.alwaysLocation.chooserLabel')}</Text>

          <View style={[styles.optionRow, styles.optionChosen]}>
            <Ionicons name="radio-button-on" size={20} color={GREEN} />
            <Text style={[styles.optionText, { color: GREEN, fontWeight: FONT_WEIGHT.bold }]}>{chosenLabel}</Text>
            <Text style={styles.pointer}>👈</Text>
          </View>

          {otherOptions.map((label) => (
            <View key={label} style={styles.optionRow}>
              <Ionicons name="radio-button-off" size={20} color={colors.textMuted} />
              <Text style={[styles.optionText, { color: colors.textSecondary }]}>{label}</Text>
            </View>
          ))}
        </View>

        {/* Numbered steps */}
        <View style={styles.steps}>
          {steps.map((s, i) => (
            <View key={i} style={styles.stepRow}>
              <View style={[styles.stepNum, { backgroundColor: BRAND }]}>
                <Text style={styles.stepNumText}>{i + 1}</Text>
              </View>
              <Text style={[styles.stepText, { color: colors.textPrimary }]}>{s}</Text>
            </View>
          ))}
        </View>

        {/* Actions */}
        <TouchableOpacity style={styles.primaryBtn} onPress={handleOpenSettings} activeOpacity={0.85}>
          <Ionicons name="settings-outline" size={20} color={COLORS.white} />
          <Text style={styles.primaryText}>{t('attendance.alwaysLocation.openSettings')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={handleClose}>
          <Text style={[styles.secondaryText, { color: colors.textSecondary }]}>{t('attendance.alwaysLocation.notNow')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SlideSheet>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', marginBottom: SPACING.lg },
  heroIcon: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md },
  title: { fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.bold, textAlign: 'center' },
  subtitle: { fontSize: FONT_SIZE.base, textAlign: 'center', marginTop: SPACING.xs, lineHeight: 21 },
  chooser: { borderRadius: RADIUS.lg, borderWidth: 1, padding: SPACING.md, marginBottom: SPACING.lg },
  chooserLabel: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: SPACING.sm },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.sm },
  optionChosen: { backgroundColor: GREEN + '14', borderRadius: RADIUS.md, paddingHorizontal: SPACING.sm, marginHorizontal: -SPACING.sm },
  optionText: { flex: 1, fontSize: FONT_SIZE.base },
  pointer: { fontSize: FONT_SIZE.lg },
  steps: { gap: SPACING.md, marginBottom: SPACING.xl },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  stepNum: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { color: COLORS.white, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold },
  stepText: { flex: 1, fontSize: FONT_SIZE.base, lineHeight: 20 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, backgroundColor: BRAND, paddingVertical: SPACING.lg, borderRadius: RADIUS.md },
  primaryText: { color: COLORS.white, fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold },
  secondaryBtn: { alignItems: 'center', paddingVertical: SPACING.md, marginTop: SPACING.xs },
  secondaryText: { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold },
});
