import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, type ThemeColors } from '../../lib/constants';

/**
 * Asking for the camera, on the screen that has something to ask for.
 *
 * A permission prompt is a negotiation, and the old one made no case: an outline
 * camera glyph, one flat sentence, a button. This one shows the frame the person
 * is about to aim — so the ask is legible before it is granted — and states the
 * three facts that make granting it reasonable.
 *
 * ⚠️ Those three claims are TRUE of this implementation and must stay true. The
 * reading is on-device (`expo-mlkit-ocr`, no network), the photograph is deleted
 * in the `finally` of `capture()` whether or not it worked, and nothing is saved
 * until the review screen is confirmed. If any of that changes, this copy is a
 * lie told at the exact moment somebody is deciding to trust the app.
 */
export function CameraPermissionScreen({
  canAskAgain,
  onAllow,
  onCancel,
}: {
  /** False once the system will no longer prompt — only Settings can help. */
  canAskAgain: boolean;
  onAllow: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = useMemo(() => styles(colors), [colors]);

  const reasons: Array<{ icon: keyof typeof Ionicons.glyphMap; text: string }> = [
    { icon: 'phone-portrait-outline', text: t('scan.permission.onDevice', 'Read on this phone — the card is never uploaded') },
    { icon: 'trash-outline', text: t('scan.permission.deleted', 'The photo is deleted the moment it has been read') },
    { icon: 'checkmark-circle-outline', text: t('scan.permission.youConfirm', 'You check every field before anything is saved') },
  ];

  return (
    <View style={s.wrap}>
      {/*
        The card frame, not a camera glyph. It is the same 85:55 rectangle the
        viewfinder draws, so the screen previews the action rather than naming
        the hardware it needs.
      */}
      <View style={s.stage}>
        <LinearGradient
          colors={[COLORS.primary + '22', 'transparent']}
          style={s.glow}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        />
        <View style={s.card}>
          {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => (
            <View key={corner} style={[s.corner, s[corner]]} />
          ))}
          {/* Suggests text on a card without pretending to be anybody's card. */}
          <View style={s.cardLines}>
            <View style={[s.line, { width: '58%', height: 9 }]} />
            <View style={[s.line, { width: '40%' }]} />
            <View style={[s.line, { width: '72%', marginTop: 8 }]} />
            <View style={[s.line, { width: '52%' }]} />
          </View>
        </View>
      </View>

      <Text style={s.title}>{t('scan.permission.title', 'Scan a business card')}</Text>
      <Text style={s.subtitle}>
        {t('scan.permission.subtitle', 'Point the camera at a card and the client details fill themselves in.')}
      </Text>

      <View style={s.reasons}>
        {reasons.map((r) => (
          <View key={r.icon} style={s.reason}>
            <View style={s.reasonIcon}>
              <Ionicons name={r.icon} size={14} color={COLORS.primary} />
            </View>
            <Text style={s.reasonText}>{r.text}</Text>
          </View>
        ))}
      </View>

      {/*
        ⚠️ Once the system has stopped asking, `requestPermission()` resolves
        immediately with no dialog — a button that visibly does nothing. The
        only route left is Settings, and the screen has to say so instead of
        letting somebody tap hopefully.
      */}
      {canAskAgain ? (
        <TouchableOpacity style={s.primary} onPress={onAllow} accessibilityRole="button" activeOpacity={0.85}>
          <Ionicons name="camera" size={17} color={COLORS.white} />
          <Text style={s.primaryText}>{t('scan.allow', 'Allow camera')}</Text>
        </TouchableOpacity>
      ) : (
        <>
          <Text style={s.blocked}>
            {t('scan.permission.blocked', 'Camera access is turned off for this app.')}
          </Text>
          <TouchableOpacity
            style={s.primary}
            onPress={() => Linking.openSettings()}
            accessibilityRole="button"
            activeOpacity={0.85}
          >
            <Ionicons name="settings-outline" size={17} color={COLORS.white} />
            <Text style={s.primaryText}>{t('scan.permission.openSettings', 'Open settings')}</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Never a dead end — a card can always be typed in by hand. */}
      <TouchableOpacity style={s.secondary} onPress={onCancel} accessibilityRole="button">
        <Text style={s.secondaryText}>{t('scan.permission.enterByHand', 'Enter the details by hand')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const CARD_W = 232;

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: { flex: 1, alignItems: 'center', paddingHorizontal: SPACING.lg, paddingTop: SPACING.xl },
    stage: { width: '100%', alignItems: 'center', justifyContent: 'center', paddingVertical: SPACING.lg },
    glow: { position: 'absolute', width: CARD_W * 1.6, height: CARD_W, borderRadius: CARD_W, opacity: 0.9 },
    card: {
      width: CARD_W,
      height: Math.round((CARD_W * 55) / 85),
      borderRadius: RADIUS.lg,
      backgroundColor: c.surfaceRaised,
      borderWidth: 1,
      borderColor: c.border,
      justifyContent: 'center',
      paddingHorizontal: 18,
    },
    cardLines: { gap: 5 },
    line: { height: 6, borderRadius: 3, backgroundColor: c.border },
    corner: { position: 'absolute', width: 20, height: 20, borderColor: COLORS.primary },
    tl: { top: -1, left: -1, borderTopWidth: 2.5, borderLeftWidth: 2.5, borderTopLeftRadius: RADIUS.lg },
    tr: { top: -1, right: -1, borderTopWidth: 2.5, borderRightWidth: 2.5, borderTopRightRadius: RADIUS.lg },
    bl: { bottom: -1, left: -1, borderBottomWidth: 2.5, borderLeftWidth: 2.5, borderBottomLeftRadius: RADIUS.lg },
    br: { bottom: -1, right: -1, borderBottomWidth: 2.5, borderRightWidth: 2.5, borderBottomRightRadius: RADIUS.lg },

    title: {
      marginTop: SPACING.md,
      fontSize: 21,
      fontWeight: FONT_WEIGHT.bold,
      color: c.textPrimary,
      textAlign: 'center',
    },
    subtitle: {
      marginTop: 6,
      fontSize: FONT_SIZE.sm,
      lineHeight: 20,
      color: c.textSecondary,
      textAlign: 'center',
      maxWidth: 300,
    },

    reasons: { width: '100%', maxWidth: 340, marginTop: SPACING.xl, gap: 12 },
    reason: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    reasonIcon: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.primaryLight,
    },
    reasonText: { flex: 1, fontSize: 13, lineHeight: 18, color: c.textSecondary },

    blocked: {
      marginTop: SPACING.xl,
      fontSize: 13,
      color: c.textSecondary,
      textAlign: 'center',
    },
    primary: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: SPACING.xl,
      width: '100%',
      maxWidth: 340,
      paddingVertical: 15,
      borderRadius: RADIUS.lg,
      backgroundColor: COLORS.primary,
    },
    primaryText: { color: COLORS.white, fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
    secondary: { marginTop: SPACING.md, paddingVertical: 10, paddingHorizontal: SPACING.md },
    secondaryText: { color: c.textSecondary, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold },
  });
