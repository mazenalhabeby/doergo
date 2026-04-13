import { StyleSheet } from 'react-native';
import {
  COLORS,
  SPACING,
  RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
  SHADOWS,
} from '../../lib/constants';

export { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOWS };

export const styles = StyleSheet.create({
  sheetContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '92%',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    // backgroundColor provided inline via colors.borderLight
    marginBottom: SPACING.sm,
  },
  sheetContent: {
    flex: 1,
    // backgroundColor provided inline via colors.surface
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
    // backgroundColor provided inline via colors.surface
  },
  sheetTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.bold,
    // color provided inline via colors.textPrimary
  },
  scrollView: {
    flex: 1,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xxxl,
    // backgroundColor provided inline via colors.surface
  },
  errorText: {
    fontSize: FONT_SIZE.xl,
    // color provided inline via colors.textMuted
    textAlign: 'center',
    marginTop: SPACING.lg,
    marginBottom: SPACING.xxl,
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xxl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.sm,
    marginBottom: SPACING.md,
  },
  retryButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.semibold,
  },
  backButton: {
    paddingHorizontal: SPACING.xxl,
    paddingVertical: SPACING.md,
  },
  backButtonText: {
    color: COLORS.primary,
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.semibold,
  },

  // =========================================================================
  // Section 1: Hero Status Card
  // =========================================================================
  heroCard: {
    // backgroundColor provided inline via colors.card
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    ...SHADOWS.sm,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  heroJobId: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    // color provided inline via colors.textMuted
    letterSpacing: 0.5,
  },
  statusBadge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.lg,
  },
  statusBadgeText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
  },
  heroTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.bold,
    // color provided inline via colors.textPrimary
    marginBottom: SPACING.md,
    lineHeight: 24,
  },
  heroMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.lg,
  },
  priorityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.sm,
    gap: SPACING.xs,
  },
  priorityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  priorityText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
  },
  dueDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  dueDateText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
    // color provided inline via colors.textSecondary
  },

  // =========================================================================
  // Section 2: Compact Progress Dots
  // =========================================================================
  progressCard: {
    // backgroundColor provided inline via colors.card
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    ...SHADOWS.sm,
  },
  progressLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    // color provided inline via colors.textMuted
    marginBottom: SPACING.md,
    letterSpacing: 0.3,
  },
  progressDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressDotWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  progressDotWrapperLast: {
    flex: 0,
  },
  progressDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    // backgroundColor provided inline via colors.border
  },
  progressDotCompleted: {
    backgroundColor: COLORS.success,
  },
  progressDotCurrent: {
    backgroundColor: COLORS.primary,
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  progressDotPending: {
    // backgroundColor provided inline via colors.border
  },
  progressLine: {
    flex: 1,
    height: 2,
    // backgroundColor provided inline via colors.border
  },
  progressLineCompleted: {
    backgroundColor: COLORS.success,
  },
  progressCurrentLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.primary,
    marginTop: SPACING.sm,
    textAlign: 'center',
  },

  // =========================================================================
  // Section 3: Info Rows Card
  // =========================================================================
  sectionCard: {
    // backgroundColor provided inline via colors.card
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    ...SHADOWS.sm,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    // color provided inline via colors.textMuted
    marginBottom: SPACING.md,
    letterSpacing: 0.3,
  },
  sectionTitleInline: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    // color provided inline via colors.textMuted
    letterSpacing: 0.3,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: SPACING.md,
  },
  infoRowBorder: {
    borderTopWidth: 1,
    // borderTopColor provided inline via colors.border
  },
  infoIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    // backgroundColor provided inline via colors.surfaceRaised
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoContent: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  infoLabel: {
    fontSize: FONT_SIZE.sm,
    // color provided inline via colors.textMuted
    marginBottom: 2,
  },
  infoValue: {
    fontSize: FONT_SIZE.base,
    // color provided inline via colors.textPrimary
    fontWeight: FONT_WEIGHT.medium,
  },
  infoSubValue: {
    fontSize: FONT_SIZE.sm,
    // color provided inline via colors.textSecondary
    marginTop: 2,
  },
  openMapsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.xs + 2,
  },
  openMapsText: {
    fontSize: FONT_SIZE.base,
    color: COLORS.primary,
    fontWeight: FONT_WEIGHT.medium,
  },

  // =========================================================================
  // Section 4: Description Card
  // =========================================================================
  descriptionText: {
    fontSize: FONT_SIZE.base,
    // color provided inline via colors.textSecondary
    lineHeight: 22,
  },

  // =========================================================================
  // Section 5: Location Map Card
  // =========================================================================
  mapContainer: {
    height: 160,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    marginBottom: SPACING.md,
  },
  map: {
    flex: 1,
  },
  locationAddress: {
    fontSize: FONT_SIZE.base,
    // color provided inline via colors.textSecondary
    marginBottom: SPACING.lg,
    lineHeight: 20,
  },
  navigationButton: {
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md + 2,
    borderRadius: RADIUS.sm + 2,
  },
  navigationButtonText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.white,
  },

  // =========================================================================
  // Section 6: Attachments Card
  // =========================================================================
  attachmentsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  attachmentUploadRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  attachmentUploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  attachmentUploadProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  attachmentUploadText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.primary,
  },
  attachmentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  attachmentThumb: {
    width: 80,
    height: 80,
    borderRadius: RADIUS.sm,
    overflow: 'hidden',
    // backgroundColor provided inline via colors.surfaceRaised
  },
  attachmentThumbImage: {
    width: 80,
    height: 80,
  },
  attachmentDocCard: {
    width: 80,
    height: 80,
    borderRadius: RADIUS.sm,
    // backgroundColor provided inline via colors.surface
    borderWidth: 1,
    // borderColor provided inline via colors.border
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xs,
  },
  attachmentDocName: {
    fontSize: FONT_SIZE.xs,
    // color provided inline via colors.textSecondary
    marginTop: 2,
    textAlign: 'center',
  },
  attachmentEmptyState: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
  },
  attachmentEmptyText: {
    fontSize: FONT_SIZE.sm,
    // color provided inline via colors.textMuted
    marginTop: SPACING.xs,
  },
  attachmentEmptyHint: {
    fontSize: FONT_SIZE.xs,
    // color provided inline via colors.textMuted
    marginTop: 2,
  },

  // =========================================================================
  // Section 7: Comments Card
  // =========================================================================
  commentItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
  },
  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  commentAvatarText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.primary,
  },
  commentBody: {
    flex: 1,
    marginLeft: SPACING.sm,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  commentAuthor: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    // color provided inline via colors.textPrimary
  },
  commentTime: {
    fontSize: FONT_SIZE.xs,
    // color provided inline via colors.textMuted
  },
  commentText: {
    fontSize: FONT_SIZE.base,
    // color provided inline via colors.textSecondary
    lineHeight: 20,
  },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
    borderTopWidth: 1,
    // borderTopColor provided inline via colors.border
    paddingTop: SPACING.md,
  },
  commentInput: {
    flex: 1,
    // backgroundColor provided inline via colors.input
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    fontSize: FONT_SIZE.base,
    // color provided inline via colors.textPrimary
    borderWidth: 1,
    // borderColor provided inline via colors.inputBorder
  },
  commentSendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  commentSendBtnDisabled: {
    // backgroundColor provided inline via colors.border
  },
  commentsEmpty: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  commentsEmptyText: {
    fontSize: FONT_SIZE.sm,
    // color provided inline via colors.textMuted
  },

  // =========================================================================
  // Bottom Bar
  // =========================================================================
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    // backgroundColor provided inline via colors.surface
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    // borderTopColor provided inline via colors.border
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  timerText: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.semibold,
    // color provided inline via colors.textPrimary
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  reportIssueButton: {
    width: 52,
    height: 52,
    borderRadius: RADIUS.sm + 2,
    backgroundColor: COLORS.errorLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  declineButton: {
    flex: 0.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.sm + 2,
    // backgroundColor provided inline via colors.card
    borderWidth: 1.5,
    borderColor: COLORS.error,
  },
  declineButtonText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.error,
  },
  finishButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.sm + 2,
    backgroundColor: COLORS.primary,
  },
  finishButtonText: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.white,
  },

  // =========================================================================
  // Modals
  // =========================================================================
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xxl,
  },
  modalContent: {
    // backgroundColor provided inline via colors.card
    borderRadius: RADIUS.lg,
    padding: SPACING.xxl,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: FONT_SIZE.xl + 2,
    fontWeight: FONT_WEIGHT.bold,
    // color provided inline via colors.textPrimary
    marginBottom: SPACING.sm,
  },
  modalSubtitle: {
    fontSize: FONT_SIZE.base,
    // color provided inline via colors.textSecondary
    marginBottom: SPACING.lg,
  },
  reasonInput: {
    // backgroundColor provided inline via colors.input
    borderRadius: RADIUS.md,
    padding: SPACING.md + 2,
    fontSize: FONT_SIZE.lg,
    minHeight: 100,
    maxHeight: 150,
    textAlignVertical: 'top',
    borderWidth: 1,
    // borderColor provided inline via colors.inputBorder
    marginBottom: SPACING.xl,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: SPACING.md + 2,
    borderRadius: RADIUS.sm + 2,
    // backgroundColor provided inline via colors.surfaceRaised
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.semibold,
    // color provided inline via colors.textSecondary
  },
  modalSubmitButton: {
    flex: 1,
    paddingVertical: SPACING.md + 2,
    borderRadius: RADIUS.sm + 2,
    backgroundColor: COLORS.error,
    alignItems: 'center',
  },
  modalSubmitText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.white,
  },
  buttonDisabled: {
    opacity: 0.6,
  },

  // Location Tracking Styles
  trackingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  trackingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.sm,
    // backgroundColor provided inline via colors.surfaceRaised
  },
  trackingIndicatorActive: {
    backgroundColor: COLORS.success,
  },
  trackingIndicatorText: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.medium,
    // color provided inline via colors.textSecondary
  },
  trackingIndicatorTextActive: {
    color: COLORS.white,
  },
  trackingPulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.white,
    marginLeft: SPACING.xs,
  },
  retryTrackingButton: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
  },
  retryTrackingText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.primary,
    fontWeight: FONT_WEIGHT.medium,
  },

  // Completion Full-Screen Sheet
  completionSheetContainer: {
    flex: 1,
    // backgroundColor provided inline via colors.surface
  },
  completionSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md + 2,
    // backgroundColor provided inline via colors.card
    borderBottomWidth: 1,
    // borderBottomColor provided inline via colors.border
  },
  completionSheetCancelText: {
    fontSize: FONT_SIZE.lg,
    color: COLORS.primary,
    fontWeight: FONT_WEIGHT.medium,
    width: 60,
  },
  completionSheetTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
    // color provided inline via colors.textPrimary
  },
  completionSheetScroll: {
    flex: 1,
  },
  completionSheetScrollContent: {
    paddingTop: SPACING.lg,
    paddingHorizontal: SPACING.lg,
  },
  completionDurationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    // backgroundColor provided inline via colors.card
    padding: SPACING.lg,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.lg,
    ...SHADOWS.sm,
  },
  completionDurationIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  completionDurationLabel: {
    fontSize: FONT_SIZE.sm,
    // color provided inline via colors.textMuted
    marginBottom: 2,
  },
  completionDurationValue: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.bold,
    // color provided inline via colors.textPrimary
  },
  completionSection: {
    // backgroundColor provided inline via colors.card
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOWS.sm,
  },
  completionSectionTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    // color provided inline via colors.textMuted
    marginBottom: SPACING.sm,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  completionTextInput: {
    borderWidth: 1,
    // borderColor provided inline via colors.inputBorder
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    fontSize: FONT_SIZE.base,
    // color provided inline via colors.textPrimary
    minHeight: 80,
    textAlignVertical: 'top',
    // backgroundColor provided inline via colors.input
  },
  completionSheetFooter: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    // backgroundColor provided inline via colors.card
    borderTopWidth: 1,
    // borderTopColor provided inline via colors.border
  },
  completionSheetSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.success,
  },
  completionSheetSubmitText: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.white,
  },

  // Future Date Banner (shown when task due date is in the future)
  futureDateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.amberLight,
    borderWidth: 1,
    borderColor: COLORS.amberBorder,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  futureDateText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    color: COLORS.amber,
    lineHeight: 18,
  },

  // Centered modal content (used by edit modal)
  completionModalContent: {
    // backgroundColor provided inline via colors.card
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    width: '90%',
    maxWidth: 400,
  },

  // Shared modal inputs (used by edit modal, block modal)
  inputLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    // color provided inline via colors.textPrimary
    marginBottom: SPACING.xs,
  },
  summaryInput: {
    borderWidth: 1,
    // borderColor provided inline via colors.inputBorder
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    fontSize: FONT_SIZE.base,
    // color provided inline via colors.textPrimary
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: SPACING.md,
  },
  detailsInput: {
    borderWidth: 1,
    // borderColor provided inline via colors.inputBorder
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    fontSize: FONT_SIZE.base,
    // color provided inline via colors.textPrimary
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: SPACING.lg,
  },
  completionSubmitButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.md + 2,
    borderRadius: RADIUS.sm + 2,
    backgroundColor: COLORS.success,
  },
  completionSubmitText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.white,
  },
});

// Admin-specific styles for task detail
export const adminDetailStyles = StyleSheet.create({
  adminActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.md + 2,
    borderRadius: RADIUS.sm + 2,
    // backgroundColor provided inline via colors.card
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  adminActionBtnText: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.primary,
  },
  editLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    // color provided inline via colors.textPrimary
    marginBottom: SPACING.xs,
    marginTop: SPACING.sm,
  },
  editPriorityRow: {
    flexDirection: 'row',
    gap: SPACING.xs,
    marginBottom: SPACING.md,
  },
  editPriorityChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    // borderColor provided inline via colors.border
    gap: SPACING.xs,
  },
  editPriorityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  editPriorityText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.medium,
    // color provided inline via colors.textSecondary
  },
});
