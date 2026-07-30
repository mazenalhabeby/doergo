/**
 * Presentational overlay for a single active step. RN can't cut a hole in a
 * View (no box-shadow trick), so we dim with FOUR rectangles around the target
 * (top/left/right/bottom) + a highlight ring, and a premium tooltip card. The
 * full-screen root intercepts background touches so the tour stays guided.
 */
import { useMemo } from 'react';
import { Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '../../lib/constants';
import type { TargetRect, TourStep } from './types';

const DIM = 'rgba(2,6,23,0.62)';
const GAP = 12;

export function TourOverlay({
  rect,
  step,
  index,
  total,
  onNext,
  onBack,
  onSkip,
  onTapTarget,
}: {
  rect: TargetRect;
  step: TourStep;
  index: number;
  total: number;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onTapTarget: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { width: SW, height: SH } = Dimensions.get('window');

  const pad = step.padding ?? 8;
  const isTap = step.action === 'tap';

  // Spotlight box (target + padding), clamped to the screen.
  const hx = Math.max(0, rect.x - pad);
  const hy = Math.max(0, rect.y - pad);
  const hw = Math.min(SW - hx, rect.width + pad * 2);
  const hh = Math.min(SH - hy, rect.height + pad * 2);

  // Tooltip placement: below the target, flipped above if it won't fit.
  const tipW = Math.min(360, SW - SPACING.lg * 2);
  const { tipTop, placeBelow } = useMemo(() => {
    const estH = 176;
    const below = hy + hh + GAP;
    const fitsBelow = below + estH < SH - 16;
    return fitsBelow
      ? { tipTop: below, placeBelow: true }
      : { tipTop: Math.max(16, hy - GAP - estH), placeBelow: false };
  }, [hy, hh, SH]);
  const tipLeft = Math.min(Math.max(SPACING.lg, hx + hw / 2 - tipW / 2), SW - tipW - SPACING.lg);

  return (
    // Full-screen root intercepts background touches (keeps the tour guided).
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* ── 4 dimming rectangles around the target ── */}
      <View style={[styles.dim, { left: 0, top: 0, width: SW, height: hy }]} />
      <View style={[styles.dim, { left: 0, top: hy + hh, width: SW, height: SH - (hy + hh) }]} />
      <View style={[styles.dim, { left: 0, top: hy, width: hx, height: hh }]} />
      <View style={[styles.dim, { left: hx + hw, top: hy, width: SW - (hx + hw), height: hh }]} />

      {/* highlight ring around the target */}
      <View
        pointerEvents="none"
        style={[styles.ring, { left: hx, top: hy, width: hw, height: hh, borderColor: COLORS.primary }]}
      />

      {/* do-it-with-me: a tap hot-spot over the target */}
      {isTap && (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onTapTarget}
          style={{ position: 'absolute', left: hx, top: hy, width: hw, height: hh, borderRadius: RADIUS.md }}
        />
      )}

      {/* tooltip card */}
      <View
        style={[
          styles.card,
          { left: tipLeft, top: tipTop, width: tipW, backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        {/* slim progress bar */}
        <View style={[styles.track, { backgroundColor: colors.border }]}>
          <View style={[styles.fill, { width: `${((index + 1) / total) * 100}%` }]} />
        </View>

        <View style={styles.body}>
          <View style={styles.headerRow}>
            <Text style={styles.counter}>{t('tours.progress', { current: index + 1, total })}</Text>
            <TouchableOpacity onPress={onSkip} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.title, { color: colors.textPrimary }]}>{t(step.titleKey)}</Text>
          <Text style={[styles.text, { color: colors.textSecondary }]}>{t(step.bodyKey)}</Text>

          {isTap && (
            <View style={styles.hint}>
              <Ionicons name="hand-left-outline" size={14} color={COLORS.primary} />
              <Text style={styles.hintText}>{t('tours.tapHint')}</Text>
            </View>
          )}

          <View style={styles.footer}>
            {index > 0 ? (
              <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="chevron-back" size={15} color={colors.textMuted} />
                <Text style={[styles.backText, { color: colors.textMuted }]}>{t('common.back')}</Text>
              </TouchableOpacity>
            ) : (
              <View />
            )}
            {isTap ? (
              <Text style={[styles.skipText, { color: colors.textMuted }]}>{t('tours.skip')}</Text>
            ) : (
              <TouchableOpacity onPress={onNext} style={styles.nextBtn} activeOpacity={0.85}>
                <Text style={styles.nextText}>{index === total - 1 ? t('tours.finish') : t('tours.next')}</Text>
                <Ionicons name="chevron-forward" size={15} color={COLORS.white} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dim: { position: 'absolute', backgroundColor: DIM },
  ring: { position: 'absolute', borderWidth: 2, borderRadius: RADIUS.md },
  card: {
    position: 'absolute',
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.28,
    shadowRadius: 24,
    elevation: 12,
  },
  track: { height: 3, width: '100%' },
  fill: { height: '100%', backgroundColor: COLORS.primary },
  body: { padding: SPACING.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm },
  counter: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold, color: COLORS.primary, letterSpacing: 0.5 },
  title: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold, marginBottom: 6, lineHeight: 22 },
  text: { fontSize: FONT_SIZE.base, lineHeight: 20 },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: SPACING.md,
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
  },
  hintText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: COLORS.primary },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SPACING.xl },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 6, paddingHorizontal: 4 },
  backText: { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold },
  skipText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
  },
  nextText: { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, color: COLORS.white },
});
