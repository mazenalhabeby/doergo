import { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../../lib/constants';
import { type RouteStop, formatDuration } from '@hbcfield/shared/client';

/** RoutePlannerScreen's module-level helpers, moved here unchanged so its sections can read them too. */
/** A drive time in seconds, said to the minute — "45m", "1h 5m". */
export const fmtDur = (s: number) => formatDuration(Math.round(s / 60));

/** One stop of an ordered route: its number (or a tick once behind you), where, and the drive to it. */
export const LegRow = memo(function LegRow({ stop: s, index: i, last, done, drive, onNav }: {
  stop: RouteStop; index: number; last: boolean; done: boolean; drive: string | null; onNav: (s: RouteStop) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.legRow}>
      <View style={styles.legRail}>
        <View style={[styles.legDot, { backgroundColor: done ? COLORS.success : COLORS.primary }]}>
          {done
            ? <Ionicons name="checkmark" size={15} color="#fff" />
            : <Text style={styles.legDotText}>{i + 1}</Text>}
        </View>
        {!last && <View style={[styles.legLine, { backgroundColor: colors.border }]} />}
      </View>
      <View style={styles.legBody}>
        <Text style={[styles.legTitle, { color: done ? colors.textMuted : colors.textPrimary }]} numberOfLines={1}>
          {s.label}
        </Text>
        {!!s.address && <Text style={[styles.legAddr, { color: colors.textMuted }]} numberOfLines={1}>{s.address}</Text>}
        {/* The drive that gets you here — the number a rep plans the
            morning around, and the reason the order matters. */}
        {!!drive && <Text style={[styles.legDrive, { color: colors.textMuted }]}>{drive}</Text>}
      </View>
      <TouchableOpacity onPress={() => onNav(s)} hitSlop={8} style={[styles.legNav, { borderColor: colors.border }]}>
        <Ionicons name="navigate-outline" size={16} color={COLORS.primary} />
      </TouchableOpacity>
    </View>
  );
});

/** One task to pick for the route — ticked or not. */
export const PickRow = memo(function PickRow({ id, title, address, on, onToggle }: {
  id: string; title: string; address: string | null; on: boolean; onToggle: (id: string) => void;
}) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      onPress={() => onToggle(id)}
      activeOpacity={0.7}
      style={[
        styles.pickRow,
        {
          borderColor: on ? COLORS.primary : colors.border,
          backgroundColor: on ? 'rgba(37,99,235,0.06)' : 'transparent',
        },
      ]}
    >
      <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={on ? COLORS.primary : colors.textMuted} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.pickTitle, { color: colors.textPrimary }]} numberOfLines={1}>{title}</Text>
        {!!address && <Text style={[styles.pickAddr, { color: colors.textMuted }]} numberOfLines={1}>{address}</Text>}
      </View>
    </TouchableOpacity>
  );
});

export const styles = StyleSheet.create({
  screen: { flex: 1 },

  // ── Map furniture ───────────────────────────────────────────────────────
  floatTop: {
    position: 'absolute',
    left: SPACING.lg,
    right: SPACING.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  floatTopRight: { gap: SPACING.sm },
  fab: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },

  // Where the driver is standing: a dot, not a pin. A pin says "a place you
  // are going to", and this is the place they already are.
  originOuter: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(37,99,235,0.22)',
  },
  originInner: {
    width: 11, height: 11, borderRadius: 6,
    backgroundColor: COLORS.primary,
    borderWidth: 2, borderColor: '#fff',
  },

  pin: { alignItems: 'center' },
  pinBubble: {
    minWidth: 26, height: 26, borderRadius: 13,
    paddingHorizontal: 6,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  pinText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold as any },
  // The stem that plants the bubble on its coordinate.
  pinTail: {
    width: 0, height: 0, marginTop: -2,
    borderLeftWidth: 4, borderRightWidth: 4, borderTopWidth: 6,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
  },

  // ── Sheet ───────────────────────────────────────────────────────────────
  sheetHead: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md, gap: 6 },
  sheetTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.bold as any, letterSpacing: -0.2 },
  sheetReset: { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold as any },
  sheetMeta: { fontSize: FONT_SIZE.base },
  sheetError: { color: '#dc2626', fontSize: FONT_SIZE.sm },
  sheetNote: { fontSize: FONT_SIZE.xs, lineHeight: 15 },
  cta: {
    marginTop: SPACING.sm,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: 14,
    borderRadius: RADIUS.lg,
  },
  ctaText: { color: '#fff', fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold as any },

  // ── Picking stops ───────────────────────────────────────────────────────
  pickRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    paddingVertical: SPACING.md, paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md, borderWidth: 1,
    marginBottom: SPACING.sm,
  },
  pickTitle: { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold as any },
  pickAddr: { fontSize: FONT_SIZE.xs, marginTop: 1 },

  // ── The ordered route ───────────────────────────────────────────────────
  // A rail with a connecting line, so the list reads as one journey rather
  // than a set of unrelated rows that happen to be numbered.
  legRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md },
  legRail: { alignItems: 'center', width: 26 },
  legDot: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  legDotText: { color: '#fff', fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold as any },
  legLine: { width: 2, flex: 1, minHeight: 26, marginVertical: 2 },
  legBody: { flex: 1, paddingBottom: SPACING.lg },
  legTitle: { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold as any },
  legAddr: { fontSize: FONT_SIZE.xs, marginTop: 1 },
  legDrive: { fontSize: FONT_SIZE.xs, marginTop: 3, fontWeight: FONT_WEIGHT.medium as any },
  legNav: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },

  chooser: { paddingHorizontal: SPACING.lg, gap: SPACING.sm },
  chooserRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    paddingVertical: 14, paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md, borderWidth: 1,
  },
  chooserLabel: { flex: 1, fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold as any },
  chooserCancel: { alignItems: 'center', paddingVertical: SPACING.md },
  chooserCancelText: { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.medium as any },
  navNote: { fontSize: FONT_SIZE.xs, marginTop: SPACING.sm, lineHeight: 16 },
  navChip: {
    paddingVertical: 7, paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full, borderWidth: 1,
  },

  empty: { alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.xxxl },
  emptyText: { fontSize: FONT_SIZE.base, textAlign: 'center', paddingHorizontal: SPACING.lg },
});
