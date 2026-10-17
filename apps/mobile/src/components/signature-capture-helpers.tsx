import { StyleSheet } from 'react-native';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOWS } from '../lib/constants';

/** SignatureCapture's module-level helpers, moved here unchanged so its sections can read them too. */
export const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.sm,
  },

  // =========================================================================
  // Trigger Card
  // =========================================================================
  triggerCard: {
    borderWidth: 1.5,
    borderRadius: RADIUS.lg,
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  triggerEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.lg,
  },
  triggerIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  triggerTextCol: {
    flex: 1,
  },
  triggerTitle: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.semibold,
  },
  triggerHint: {
    fontSize: FONT_SIZE.sm,
    marginTop: 3,
  },
  triggerSigned: {
    padding: SPACING.md,
  },
  triggerSignedTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  triggerSignedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  signedIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  triggerSignedLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
  },
  triggerClearBtn: {
    padding: SPACING.xs,
  },
  triggerPreviewContainer: {
    height: 70,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
  },
  triggerPreviewImage: {
    width: '100%',
    height: '100%',
  },

  // =========================================================================
  // Full-screen Modal
  // =========================================================================
  /** Fills the screen and centres the rotated page inside it. */
  rotateHost: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContainer: {
    // No flex: the size is set explicitly from the swapped window dimensions,
    // because a rotated view still lays out in its parent's axes.
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
  },
  headerBtn: {
    minWidth: 50,
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
  },
  headerClearText: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.semibold,
  },

  // Instruction
  instructionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
  },
  instructionText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
  },

  // Canvas
  canvasOuter: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  canvasCard: {
    flex: 1,
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    borderWidth: 2,
    ...SHADOWS.md,
  },
  signatureCanvas: {
    flex: 1,
  },
  baselineContainer: {
    position: 'absolute',
    bottom: '22%',
    left: SPACING.xxl,
    right: SPACING.xxl,
    alignItems: 'center',
  },
  baseline: {
    width: '100%',
    height: 1,
  },
  baselineLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.medium,
    marginTop: 6,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  // Footer
  modalFooter: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: RADIUS.lg,
    ...SHADOWS.md,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.white,
  },
});
