import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/theme-context';
import { registerConsentUI, resolveBackgroundLocationConsent } from '../services/location-consent';
import { BlurSheet } from './blur-sheet';
import { SheetPanel } from './sheet-panel';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../lib/constants';

/**
 * Prominent background-location disclosure (Google Play requirement).
 *
 * Rendered once near the app root. It appears BEFORE the OS background-location
 * permission prompt — the location-consent service shows it via registerConsentUI.
 * The user must explicitly Allow or Not Now; only Allow lets the app proceed to
 * request the OS "Allow all the time" permission.
 */
export function LocationConsentModal() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => registerConsentUI(setVisible), []);

  const decide = (granted: boolean) => {
    void resolveBackgroundLocationConsent(granted);
  };

  return (
    /*
      ⚠️ Through the app's one modal slot (blur-sheet.tsx), never a raw <Modal>:
      it is asked for from inside other flows, and on iOS a second modal while
      one is up is refused — the caller then waits on this forever.
    */
    <BlurSheet visible={visible} onClose={() => decide(false)}>
        <SheetPanel onClose={() => decide(false)} maxHeightFraction={0.9} style={styles.card}>
          <View style={styles.iconWrap}>
            <View style={styles.iconCircle}>
              <Ionicons name="navigate" size={30} color={COLORS.primary} />
            </View>
          </View>

          <Text style={[styles.title, { color: colors.textPrimary }]}>
            {t('locationConsent.title')}
          </Text>

          <ScrollView style={styles.bodyScroll} contentContainerStyle={styles.body}>
            <Text style={[styles.text, { color: colors.textSecondary }]}>
              {t('locationConsent.introPre')}<Text style={{ fontWeight: FONT_WEIGHT.bold, color: colors.textPrimary }}>{t('locationConsent.introBold')}</Text>{t('locationConsent.introPost')}
            </Text>

            <View style={styles.bullet}>
              <Ionicons name="car-outline" size={18} color={COLORS.primary} style={styles.bulletIcon} />
              <Text style={[styles.bulletText, { color: colors.textSecondary }]}>
                {t('locationConsent.drivePre')}<Text style={{ fontWeight: FONT_WEIGHT.semibold, color: colors.textPrimary }}>{t('locationConsent.driveBold')}</Text>{t('locationConsent.drivePost')}
              </Text>
            </View>
            <View style={styles.bullet}>
              <Ionicons name="time-outline" size={18} color={COLORS.primary} style={styles.bulletIcon} />
              <Text style={[styles.bulletText, { color: colors.textSecondary }]}>
                {t('locationConsent.clockPre')}<Text style={{ fontWeight: FONT_WEIGHT.semibold, color: colors.textPrimary }}>{t('locationConsent.clockBold')}</Text>{t('locationConsent.clockPost')}
              </Text>
            </View>
            {/* The automatic clock watches arriving BEFORE any clock-in — the disclosure must say so (Play's prominent-disclosure rule). */}
            <View style={styles.bullet}>
              <Ionicons name="enter-outline" size={18} color={COLORS.primary} style={styles.bulletIcon} />
              <Text style={[styles.bulletText, { color: colors.textSecondary }]}>
                {t('locationConsent.autoPre')}<Text style={{ fontWeight: FONT_WEIGHT.semibold, color: colors.textPrimary }}>{t('locationConsent.autoBold')}</Text>{t('locationConsent.autoPost')}
              </Text>
            </View>

            <Text style={[styles.text, { color: colors.textSecondary, marginTop: SPACING.sm }]}>
              {t('locationConsent.privacyPre')}<Text style={{ color: COLORS.primary }}>{t('locationConsent.privacyLink')}</Text>{t('locationConsent.privacyPost')}
            </Text>
          </ScrollView>

          <TouchableOpacity style={styles.allowBtn} onPress={() => decide(true)} activeOpacity={0.9}>
            <Text style={styles.allowText}>{t('locationConsent.allow')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.denyBtn} onPress={() => decide(false)} activeOpacity={0.7}>
            <Text style={[styles.denyText, { color: colors.textMuted }]}>{t('locationConsent.deny')}</Text>
          </TouchableOpacity>
        </SheetPanel>
    </BlurSheet>
  );
}

const styles = StyleSheet.create({
  card: {
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
  },
  iconWrap: { alignItems: 'center', marginBottom: SPACING.md },
  iconCircle: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center', alignItems: 'center',
  },
  title: {
    fontSize: 22, fontWeight: FONT_WEIGHT.bold, textAlign: 'center', marginBottom: SPACING.md,
  },
  bodyScroll: { maxHeight: 320 },
  body: { paddingBottom: SPACING.sm },
  text: { fontSize: FONT_SIZE.md, lineHeight: 22 },
  bullet: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, marginTop: SPACING.md },
  bulletIcon: { marginTop: 2 },
  bulletText: { flex: 1, fontSize: FONT_SIZE.md, lineHeight: 22 },
  allowBtn: {
    marginTop: SPACING.lg,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
  },
  allowText: { color: COLORS.white, fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold },
  denyBtn: { height: 44, justifyContent: 'center', alignItems: 'center', marginTop: SPACING.xs },
  denyText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.medium },
});
