import { StyleSheet } from 'react-native';
import { SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '@/lib/constants';

/** SignDocumentScreen's module-level helpers, moved here unchanged so its sections can read them too. */
export const s = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  progress: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, gap: SPACING.xs },
  progressText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },

  pane: { padding: SPACING.lg, gap: SPACING.md },
  h1: { fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.bold },
  body: { fontSize: FONT_SIZE.base, lineHeight: 21 },
  hint: { fontSize: FONT_SIZE.sm, textAlign: 'center' },

  /*
    alignSelf: 'stretch' on BOTH.

    The confirmation pane centres its children so the tick and the headline sit
    on the middle line — and that made every button shrink to the width of its
    own label. "Open the signed document" came out wide, "View my documents"
    narrow, neither aligned with the card above them, and the pair read as two
    unrelated controls rather than a primary and its alternative.

    Setting it on the button rather than fixing the parent means the same button
    keeps its full width in any pane, however that pane chooses to align things.
  */
  primary: {
    alignSelf: 'stretch',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
    minHeight: 52,
    paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.md, marginTop: SPACING.xs,
  },
  primaryText: { color: '#FFFFFF', fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.semibold },
  secondary: {
    alignSelf: 'stretch',
    // Same height as the primary, so the pair reads as one stack rather than
    // two controls that happen to be near each other.
    minHeight: 52,
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.md, borderWidth: 1,
  },
  secondaryText: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.medium },
  disabled: { opacity: 0.45 },

  consentBox: {
    padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: StyleSheet.hairlineWidth,
  },
  consentText: { fontSize: FONT_SIZE.base, lineHeight: 21, fontWeight: FONT_WEIGHT.medium },

  recordList: {
    borderRadius: RADIUS.md, borderWidth: StyleSheet.hairlineWidth,
    padding: SPACING.md, gap: SPACING.xs,
  },
  recordRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  recordText: { fontSize: FONT_SIZE.sm, flex: 1 },

  busyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm },

  done: { alignItems: 'center', paddingTop: SPACING.xxl, gap: SPACING.md },
  sigCard: {
    width: '100%', padding: SPACING.md, borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', gap: SPACING.xs,
  },
  sigLabel: {
    fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold,
    letterSpacing: 1, textTransform: 'uppercase',
  },
  // On white, because that is how it was captured and how it sits on the page.
  sigImage: { width: '80%', height: 90, backgroundColor: '#FFFFFF', borderRadius: RADIUS.sm },
  sigRule: { width: '80%', height: StyleSheet.hairlineWidth },
  sigHint: { fontSize: FONT_SIZE.sm, textAlign: 'center' },
  ring: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },

  chainCard: {
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  chainTitle: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: SPACING.sm,
  },
  chainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: 5,
  },
  chainName: { flex: 1, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium },
  chainRole: { fontSize: FONT_SIZE.xs },
});
