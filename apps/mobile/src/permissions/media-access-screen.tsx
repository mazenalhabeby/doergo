import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, type ThemeColors } from '../lib/constants';
import { purposeOf, type MediaPurpose } from './purposes';
import type { MediaAccess } from './use-media-access';

/**
 * Asking for the camera, on the screen that has something to ask for.
 *
 * One component for every surface. What differs per flow — the title, the
 * sentence, the promises, the way out — comes from `purposes.ts`, so a new
 * scanner is a row of data and this file never changes.
 *
 * It shows the frame the person is about to aim, so the ask is legible before
 * it is granted, and states the facts that make granting it reasonable.
 *
 * ⚠️ Three states, and they are not two. `resolved` false means nothing is
 * known yet and NEITHER a button nor a refusal may be shown; `blocked` means
 * the system has stopped prompting and only Settings can help; otherwise there
 * is something to ask. Collapsing the first into either of the others is the
 * bug this component was rewritten to remove.
 */
export function MediaAccessScreen({
  purpose,
  access,
  onCancel,
}: {
  purpose: MediaPurpose;
  access: MediaAccess;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = useMemo(() => styles(colors), [colors]);
  const p = purposeOf(purpose);

  return (
    <View style={s.wrap}>
      {/*
        The card frame, not a camera glyph: the screen previews the action
        rather than naming the hardware it needs.
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
          <View style={s.cardLines}>
            <View style={[s.line, { width: '58%', height: 9 }]} />
            <View style={[s.line, { width: '40%' }]} />
            <View style={[s.line, { width: '72%', marginTop: 8 }]} />
            <View style={[s.line, { width: '52%' }]} />
          </View>
        </View>
      </View>

      <Text style={s.title}>{t(p.title.k, p.title.d)}</Text>
      <Text style={s.subtitle}>{t(p.subtitle.k, p.subtitle.d)}</Text>

      <View style={s.reasons}>
        {p.promises.map((r) => (
          <View key={r.k} style={s.reason}>
            <View style={s.reasonIcon}>
              <Ionicons name={r.icon} size={14} color={COLORS.primary} />
            </View>
            <Text style={s.reasonText}>{t(r.k, r.d)}</Text>
          </View>
        ))}
      </View>

      {!access.resolved ? (
        /* Neither offer nor refuse until the answer is known — a button here
           would be a promise made before the fact. */
        <View style={[s.primary, { backgroundColor: colors.border }]}>
          <ActivityIndicator size="small" color={colors.textMuted} />
        </View>
      ) : access.blocked ? (
        <>
          <Text style={s.blocked}>
            {t('perm.blocked', 'Camera access is turned off for this app.')}
          </Text>
          <TouchableOpacity
            style={s.primary}
            onPress={() => Linking.openSettings()}
            accessibilityRole="button"
            activeOpacity={0.85}
          >
            <Ionicons name="settings-outline" size={17} color={COLORS.white} />
            <Text style={s.primaryText}>{t('perm.openSettings', 'Open settings')}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <TouchableOpacity
          style={[s.primary, access.asking && { opacity: 0.7 }]}
          onPress={() => void access.ask()}
          disabled={access.asking}
          accessibilityRole="button"
          activeOpacity={0.85}
        >
          {access.asking ? <ActivityIndicator size="small" color={COLORS.white} /> : (
            <>
              <Ionicons name="camera" size={17} color={COLORS.white} />
              <Text style={s.primaryText}>{t('perm.allow', 'Allow camera')}</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {/* Never a dead end — every one of these flows can be done by hand. */}
      <TouchableOpacity style={s.secondary} onPress={onCancel} accessibilityRole="button">
        <Text style={s.secondaryText}>{t(p.cancel.k, p.cancel.d)}</Text>
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
      width: CARD_W, height: CARD_W * 0.647, borderRadius: RADIUS.lg,
      backgroundColor: c.card, justifyContent: 'center', paddingHorizontal: SPACING.lg,
    },
    corner: { position: 'absolute', width: 26, height: 26, borderColor: COLORS.primary },
    tl: { top: -1, left: -1, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: RADIUS.lg },
    tr: { top: -1, right: -1, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: RADIUS.lg },
    bl: { bottom: -1, left: -1, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: RADIUS.lg },
    br: { bottom: -1, right: -1, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: RADIUS.lg },
    cardLines: { gap: 6 },
    line: { height: 6, borderRadius: 3, backgroundColor: c.border },

    title: { fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.bold as any, color: c.textPrimary, textAlign: 'center', marginTop: SPACING.md },
    subtitle: { fontSize: FONT_SIZE.sm, color: c.textMuted, textAlign: 'center', marginTop: SPACING.sm, lineHeight: 21, paddingHorizontal: SPACING.md },

    reasons: { width: '100%', gap: SPACING.md, marginTop: SPACING.xl, marginBottom: SPACING.xl },
    reason: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
    reasonIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.primary + '1a', alignItems: 'center', justifyContent: 'center' },
    reasonText: { flex: 1, fontSize: FONT_SIZE.sm, color: c.textSecondary, lineHeight: 20 },

    blocked: { fontSize: FONT_SIZE.sm, color: '#f59e0b', textAlign: 'center', marginBottom: SPACING.md },
    primary: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      backgroundColor: COLORS.primary, borderRadius: 99, height: 52, width: '100%',
    },
    primaryText: { color: COLORS.white, fontSize: FONT_SIZE.base, fontWeight: '700' },
    secondary: { paddingVertical: SPACING.lg },
    secondaryText: { fontSize: FONT_SIZE.sm, color: c.textMuted, fontWeight: FONT_WEIGHT.semibold as any },
  });
