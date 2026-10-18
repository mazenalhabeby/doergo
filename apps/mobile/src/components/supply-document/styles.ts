import { StyleSheet } from 'react-native';
import { useTheme } from '../../contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../../lib/constants';

/**
 * The supply sheet's words and surfaces, in the app's own design. Named after
 * the old palette's roles so the long form reads unchanged.
 */
export function useSupplyPalette() {
  const { amazen } = useTheme();
  const a = amazen.color;
  const colors = {
    textPrimary: a.inkStrong, textSecondary: a.ink, textMuted: a.inkMuted,
    surface: a.well, surfaceRaised: a.tile, border: a.lineWell, primaryLight: a.accentTint,
  };
  const accent = { primary: a.accentSolid, white: a.accentInk };
  return { amazen, a, colors, COLORS: accent };
}


export const s = StyleSheet.create({
  scroll: { flexShrink: 1 },
  body: { paddingBottom: SPACING.md },
  subtitle: { fontSize: FONT_SIZE.base, lineHeight: 20, marginTop: SPACING.xs, marginBottom: SPACING.sm },
  empty: { fontSize: FONT_SIZE.base, textAlign: 'center', paddingVertical: SPACING.xl },

  /* Small, spaced, muted — a section marker rather than a heading competing
     with the sheet's own title for the top of the visual hierarchy. */
  eyebrow: {
    fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginTop: SPACING.lg, marginBottom: SPACING.sm,
  },

  typeList: { gap: SPACING.xs },
  /* Fixed, so a described type and a bare one are the same size. */
  typeRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    height: 62, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.md,
  },
  typeRowOn: {
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  typeIcon: {
    width: 38, height: 38, borderRadius: RADIUS.md,
    alignItems: 'center', justifyContent: 'center',
  },
  typeText: { flex: 1, gap: 1 },
  typeLabel: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.semibold, letterSpacing: -0.2 },
  typeHint: { fontSize: FONT_SIZE.sm },

  scanButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
    height: 54, borderRadius: RADIUS.lg,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  scanText: {
    color: COLORS.white, fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.semibold, letterSpacing: -0.2,
  },
  pickButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
    height: 46, borderRadius: RADIUS.lg, marginTop: SPACING.sm,
  },
  pickText: { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.medium },

  picked: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    height: 62, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.md,
  },
  pickedIcon: {
    width: 30, height: 30, borderRadius: RADIUS.full,
    alignItems: 'center', justifyContent: 'center',
  },
  pickedName: { flex: 1, fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.medium },

  dateButton: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    height: 54, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.md,
  },
  dateText: { flex: 1, fontSize: FONT_SIZE.lg },
  dateTextSet: { fontWeight: FONT_WEIGHT.semibold },
  expiryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  expiryReading: {
    fontSize: FONT_SIZE.sm,
  },
  expiryFound: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.md,
    gap: 4,
  },
  expiryValue: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semibold,
  },
  expiryFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
    paddingLeft: 26,
  },
  changeDate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  changeDateText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.medium,
  },
  dateNote: { fontSize: FONT_SIZE.sm, marginTop: SPACING.xs, marginLeft: SPACING.xs },

  notice: {
    flexDirection: 'row', gap: SPACING.sm, alignItems: 'flex-start',
    marginTop: SPACING.lg, paddingHorizontal: SPACING.xs,
  },
  noticeText: { flex: 1, fontSize: FONT_SIZE.sm, lineHeight: 18 },

  submit: {
    alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center',
    height: 54, borderRadius: RADIUS.lg, marginTop: SPACING.md,
  },
  submitOn: {
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  submitText: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.semibold, letterSpacing: -0.2 },
  titleInput: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    fontSize: FONT_SIZE.base,
  },
  titleHint: { fontSize: FONT_SIZE.xs, lineHeight: 16, marginTop: -2 },
});
