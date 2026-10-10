import { StyleSheet } from 'react-native';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOWS } from '../../lib/constants';

/* The Time off screen's styles — shared by the route and its pieces, unchanged. */

const CELL_SIZE = 40;

export const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  // Stats
  /*
    Four tiles across, sized for the LONGEST language rather than the shortest.

    German broke "Ausstehend" across two lines mid-word, which is what React
    Native does when a single word is wider than its box — there is no
    hyphenation to fall back on, so it simply cuts. English never showed it:
    "Pending" is three characters shorter and the tiles were built around it.

    A tighter gap and tighter padding buy roughly 11pt of text width per tile,
    which is what a ten-character word needs at this size — and ten characters
    covers the longest label in all five languages ("Ausstehend", "Pendientes",
    "Rechazadas") with room to spare on a 375pt phone.
  */
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    gap: SPACING.xs,
  },
  statCard: {
    flex: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    ...SHADOWS.sm,
  },
  statIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xs,
  },
  statNumber: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.bold,
  },
  statLabel: {
    fontSize: FONT_SIZE.xs,
    lineHeight: 14,
    marginTop: 2,
    textAlign: 'center',
    /*
      Two lines' worth, always. A one-word label next to a two-word one left the
      tiles with their text sitting at different heights — the row read as four
      cards that had been laid out separately, which in a language where two of
      the four wrap is most of them.
    */
    height: 30,
  },

  // Info banner
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.sm,
  },
  infoBannerText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    color: COLORS.primary,
  },

  // Calendar card
  calendarCard: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.sm,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
  },
  calendarTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.semibold,
  },

  // Day headers
  dayHeaderRow: {
    flexDirection: 'row',
    marginBottom: SPACING.sm,
  },
  dayHeaderCell: {
    flex: 1,
    alignItems: 'center',
  },
  dayHeaderText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.semibold,
    textTransform: 'uppercase',
  },

  // Week rows & day cells
  weekRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: CELL_SIZE,
    borderRadius: RADIUS.sm,
  },
  dayCellToday: {
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  dayCellInRange: {
  },
  dayCellEndpoint: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.sm,
  },
  dayText: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.medium,
  },
  dayTextPast: {
  },
  dayTextOffDay: {
  },
  dayTextInRange: {
    color: COLORS.primaryDark,
    fontWeight: FONT_WEIGHT.semibold,
  },
  dayTextEndpoint: {
    color: COLORS.white,
    fontWeight: FONT_WEIGHT.bold,
  },

  // Dots
  dotRow: {
    flexDirection: 'row',
    gap: 2,
    height: 6,
    alignItems: 'center',
    marginTop: 1,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },

  // Legend
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.lg,
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: FONT_SIZE.xs,
  },

  selectionHint: {
    textAlign: 'center',
    fontSize: FONT_SIZE.sm,
    color: COLORS.primary,
    marginTop: SPACING.sm,
    fontStyle: 'italic',
  },

  // Insight card
  insightCard: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.sm,
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  insightTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.semibold,
  },
  insightContent: {
    gap: SPACING.sm,
  },
  insightSummary: {
    fontSize: FONT_SIZE.base,
  },
  insightMuted: {
    fontSize: FONT_SIZE.sm,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.sm,
    borderRadius: RADIUS.sm,
  },
  warningText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    color: COLORS.amber,
    fontWeight: FONT_WEIGHT.medium,
  },
  teamOffSection: {
    marginTop: SPACING.xs,
  },
  teamOffLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    marginBottom: SPACING.xs,
  },
  teamOffName: {
    fontSize: FONT_SIZE.sm,
    paddingLeft: SPACING.md,
    marginBottom: 2,
  },
  teamOffMore: {
    fontSize: FONT_SIZE.sm,
    paddingLeft: SPACING.md,
    fontStyle: 'italic',
  },

  // Form card
  formCard: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.sm,
  },
  formTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.semibold,
    marginBottom: SPACING.md,
  },
  formDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.sm,
    marginBottom: SPACING.lg,
  },
  formDateText: {
    fontSize: FONT_SIZE.base,
    color: COLORS.primaryDark,
    fontWeight: FONT_WEIGHT.medium,
  },
  formLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    marginBottom: SPACING.sm,
  },
  chipScroll: {
    marginBottom: SPACING.lg,
  },
  chipRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  notesInput: {
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    fontSize: FONT_SIZE.base,
    minHeight: 72,
    textAlignVertical: 'top',
    marginBottom: SPACING.lg,
  },
  formButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  clearButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearButtonText: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.semibold,
  },
  submitButton: {
    flex: 1.5,
    flexDirection: 'row',
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  submitButtonText: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.white,
  },
  buttonDisabled: {
    opacity: 0.6,
  },

  // Requests section
  section: {
    marginTop: SPACING.xxl,
    paddingHorizontal: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.semibold,
    marginBottom: SPACING.md,
  },
  filterScroll: {
    marginBottom: SPACING.lg,
  },
  filterRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  emptyState: {
    borderRadius: RADIUS.md,
    padding: SPACING.xxxl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: FONT_SIZE.base,
    marginTop: SPACING.md,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: FONT_SIZE.sm,
    marginTop: SPACING.xs,
    textAlign: 'center',
  },

  // Request cards
  requestCard: {
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOWS.sm,
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  requestType: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  requestTypeText: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.semibold,
  },
  statusBadge: {
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  statusText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
  },
  requestDetails: {
    gap: SPACING.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  detailText: {
    fontSize: FONT_SIZE.base,
  },
  reasonText: {
    fontSize: FONT_SIZE.base,
    marginTop: SPACING.sm,
  },
  approvedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
  },
  approvedText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.success,
  },
  rejectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
  },
  rejectionText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    color: COLORS.error,
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
  },
  cancelButtonText: {
    fontSize: FONT_SIZE.base,
    color: COLORS.error,
    fontWeight: FONT_WEIGHT.medium,
  },
});
