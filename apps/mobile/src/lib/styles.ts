/**
 * Time-off request status badges — the one status-style table the app still draws.
 *
 * (The task status / priority tables and the TaskCard that read them were
 * removed 2026-10-10: nothing rendered them any more.)
 */

import { COLORS, type ThemeColors } from './constants';

// =============================================================================
// TIME OFF REQUEST STATUS STYLES
// =============================================================================

type TimeOffStatus = 'APPROVED' | 'PENDING' | 'REJECTED' | 'CANCELED';

type TimeOffStatusStyle = {
  bg: string;
  text: string;
  border: string;
  label: string;
};

const TIME_OFF_STATUS_STYLES: Record<TimeOffStatus, TimeOffStatusStyle> = {
  APPROVED: { bg: COLORS.successLight, text: COLORS.success, border: COLORS.success, label: 'Approved' },
  PENDING: { bg: COLORS.amberLight, text: COLORS.amber, border: COLORS.amber, label: 'Pending' },
  REJECTED: { bg: COLORS.errorLight, text: COLORS.error, border: COLORS.error, label: 'Rejected' },
  CANCELED: { bg: COLORS.slate100, text: COLORS.slate500, border: COLORS.slate300, label: 'Canceled' },
};

/**
 * Get time off status style by status string (case-insensitive).
 * Accepts optional theme colors for dark mode support.
 */
export function getTimeOffStatusStyle(status: string, colors?: ThemeColors): TimeOffStatusStyle {
  const normalizedStatus = status.toUpperCase() as TimeOffStatus;
  if (colors) {
    const themed: Record<TimeOffStatus, TimeOffStatusStyle> = {
      APPROVED: { bg: colors.successLight, text: COLORS.success, border: COLORS.success, label: 'Approved' },
      PENDING: { bg: colors.amberLight, text: COLORS.amber, border: COLORS.amber, label: 'Pending' },
      REJECTED: { bg: colors.errorLight, text: COLORS.error, border: COLORS.error, label: 'Rejected' },
      CANCELED: { bg: colors.surfaceRaised, text: colors.textMuted, border: colors.borderLight, label: 'Canceled' },
    };
    return themed[normalizedStatus] || themed.PENDING;
  }
  return TIME_OFF_STATUS_STYLES[normalizedStatus] || TIME_OFF_STATUS_STYLES.PENDING;
}
