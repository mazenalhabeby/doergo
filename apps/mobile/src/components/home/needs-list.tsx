import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { PressableScale } from '../pressable-scale';
import { SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../../lib/constants';

/**
 * The things waiting for a decision, on the home screen instead of behind a
 * floating button.
 *
 * What made the old dashboard feel empty was not the amount of content — it was
 * that everything worth opening the app for (hours to approve, a job somebody is
 * stuck on) sat one tap away under an icon, while the screen itself showed a
 * roster and half a phone of nothing.
 *
 * A row appears ONLY when its permission and its count both say so. That is why
 * this takes a list rather than rendering fixed rows: the caller assembles what
 * this member may act on, so a viewer with one grant gets one row and the screen
 * still looks deliberate rather than broken.
 */

export type NeedTone = 'urgent' | 'attention' | 'neutral';

export interface NeedItem {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail?: string;
  count?: number;
  tone: NeedTone;
  onPress: () => void;
}

const TONE = {
  urgent: { color: '#f87171', tint: 'rgba(248,113,113,0.13)', line: 'rgba(248,113,113,0.26)' },
  attention: { color: '#f59e0b', tint: 'rgba(245,158,11,0.13)', line: 'rgba(245,158,11,0.28)' },
  neutral: { color: null as string | null, tint: 'transparent', line: null },
} as const;

export const NeedsList = React.memo(function NeedsList({ items }: { items: NeedItem[] }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();

  /*
    Nothing waiting is a state worth saying, not a gap to leave.

    Three rows reading zero is what made the first draft flat; one calm line
    that says the work is done reads as finished rather than broken.
  */
  if (items.length === 0) {
    return (
      <View style={[s.clear, { borderColor: colors.border }]}>
        <Ionicons name="checkmark-circle" size={18} color="#10b981" />
        <Text style={[s.clearText, { color: colors.textSecondary }]}>{t('home.needs.allClear')}</Text>
      </View>
    );
  }

  return (
    <View style={s.stack}>
      {items.map((item) => {
        const tone = TONE[item.tone];
        const glyphColor = tone.color ?? colors.textSecondary;
        return (
          <PressableScale key={item.key} onPress={item.onPress} activeScale={0.985}>
            <View
              style={[
                s.row,
                {
                  backgroundColor: isDark ? 'rgba(255,255,255,0.045)' : colors.card,
                  borderColor: tone.line ?? colors.border,
                },
              ]}
            >
              {/* The colour bleeds from the left rather than filling the row —
                  urgency read before the words, without shouting over them. */}
              {tone.color && (
                <LinearGradient
                  pointerEvents="none"
                  colors={[tone.tint, 'transparent']}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 0.85, y: 0.5 }}
                  style={StyleSheet.absoluteFill as never}
                />
              )}

              <View
                style={[
                  s.glyph,
                  {
                    backgroundColor: tone.color ? tone.tint : isDark ? 'rgba(255,255,255,0.06)' : colors.surface,
                    borderColor: tone.line ?? colors.border,
                  },
                ]}
              >
                <Ionicons name={item.icon} size={18} color={glyphColor} />
              </View>

              <View style={s.text}>
                <Text style={[s.title, { color: colors.textPrimary }]} numberOfLines={1}>{item.title}</Text>
                {!!item.detail && (
                  <Text style={[s.detail, { color: colors.textMuted }]} numberOfLines={1}>{item.detail}</Text>
                )}
              </View>

              {item.count !== undefined && (
                <Text style={[s.count, { color: tone.color ?? colors.textMuted }]}>{item.count}</Text>
              )}
              <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
            </View>
          </PressableScale>
        );
      })}
    </View>
  );
});

const s = StyleSheet.create({
  stack: { gap: SPACING.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  glyph: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: { flex: 1, minWidth: 0 },
  title: { fontSize: 15.5, fontWeight: FONT_WEIGHT.semibold, letterSpacing: -0.2 },
  detail: { fontSize: 12.5, marginTop: 1 },
  count: { fontSize: 25, fontWeight: '800', letterSpacing: -1 },
  clear: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  clearText: { fontSize: FONT_SIZE.base },
});
