/**
 * Shared styles for the mobile app
 * Centralized status badges, priority indicators, and common style patterns
 */

import { StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOWS, type ThemeColors } from './constants';
import type { TaskStatus } from './api';

// Re-export TaskStatus for convenience
export type { TaskStatus };

// =============================================================================
// STATUS BADGE STYLES
// =============================================================================

export type StatusStyle = {
  bg: string;
  text: string;
  border: string;
  label: string;
};

/**
 * Get theme-aware status styles.
 * Most statuses use fixed accent colors; DRAFT/CANCELED/CLOSED adapt to theme.
 */
export function getThemedStatusStyles(colors: ThemeColors): Record<TaskStatus, StatusStyle> {
  return {
    DRAFT: {
      bg: colors.surfaceRaised,
      text: colors.textSecondary,
      border: colors.border,
      label: 'Draft',
    },
    NEW: {
      bg: COLORS.infoLight,
      text: COLORS.primary,
      border: COLORS.infoBorder,
      label: 'New',
    },
    ASSIGNED: {
      bg: COLORS.purpleLight,
      text: COLORS.purple,
      border: COLORS.purpleBorder,
      label: 'Assigned',
    },
    ACCEPTED: {
      bg: COLORS.emeraldLight,
      text: COLORS.emerald,
      border: COLORS.emeraldBorder,
      label: 'Accepted',
    },
    EN_ROUTE: {
      bg: COLORS.cyanLight,
      text: COLORS.cyan,
      border: COLORS.cyanBorder,
      label: 'On The Way',
    },
    ARRIVED: {
      bg: COLORS.indigoLight,
      text: COLORS.indigo,
      border: COLORS.indigoBorder,
      label: 'Arrived',
    },
    IN_PROGRESS: {
      bg: COLORS.amberLight,
      text: COLORS.amber,
      border: COLORS.amberBorder,
      label: 'In Progress',
    },
    BLOCKED: {
      bg: colors.blockedLight,
      text: COLORS.blocked,
      border: COLORS.blockedBorder,
      label: 'Blocked',
    },
    COMPLETED: {
      bg: COLORS.successLight,
      text: COLORS.success,
      border: COLORS.successBorder,
      label: 'Completed',
    },
    CANCELED: {
      bg: colors.surfaceRaised,
      text: colors.textMuted,
      border: colors.borderLight,
      label: 'Canceled',
    },
    CLOSED: {
      bg: colors.surfaceRaised,
      text: colors.textMuted,
      border: colors.border,
      label: 'Closed',
    },
  };
}

// Static fallback (light theme) for non-themed contexts
export const STATUS_STYLES: Record<TaskStatus, StatusStyle> = {
  DRAFT: { bg: COLORS.slate50, text: COLORS.slate500, border: COLORS.slate200, label: 'Draft' },
  NEW: { bg: COLORS.infoLight, text: COLORS.primary, border: COLORS.infoBorder, label: 'New' },
  ASSIGNED: { bg: COLORS.purpleLight, text: COLORS.purple, border: COLORS.purpleBorder, label: 'Assigned' },
  ACCEPTED: { bg: COLORS.emeraldLight, text: COLORS.emerald, border: COLORS.emeraldBorder, label: 'Accepted' },
  EN_ROUTE: { bg: COLORS.cyanLight, text: COLORS.cyan, border: COLORS.cyanBorder, label: 'On The Way' },
  ARRIVED: { bg: COLORS.indigoLight, text: COLORS.indigo, border: COLORS.indigoBorder, label: 'Arrived' },
  IN_PROGRESS: { bg: COLORS.amberLight, text: COLORS.amber, border: COLORS.amberBorder, label: 'In Progress' },
  BLOCKED: { bg: COLORS.blockedLight, text: COLORS.blocked, border: COLORS.blockedBorder, label: 'Blocked' },
  COMPLETED: { bg: COLORS.successLight, text: COLORS.success, border: COLORS.successBorder, label: 'Completed' },
  CANCELED: { bg: COLORS.slate100, text: COLORS.slate500, border: COLORS.slate300, label: 'Canceled' },
  CLOSED: { bg: COLORS.slate50, text: COLORS.slate400, border: COLORS.slate200, label: 'Closed' },
};

/**
 * Get status style by status string (case-insensitive).
 * Accepts optional theme colors for dark mode support.
 */
export function getStatusStyle(status: string, colors?: ThemeColors): StatusStyle {
  const normalizedStatus = status.toUpperCase() as TaskStatus;
  if (colors) {
    return getThemedStatusStyles(colors)[normalizedStatus] || getThemedStatusStyles(colors).DRAFT;
  }
  return STATUS_STYLES[normalizedStatus] || STATUS_STYLES.DRAFT;
}

// =============================================================================
// PRIORITY STYLES
// =============================================================================

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type PriorityStyle = {
  color: string;
  bg: string;
  label: string;
};

export const PRIORITY_STYLES: Record<TaskPriority, PriorityStyle> = {
  LOW: { color: COLORS.slate400, bg: COLORS.slate100, label: 'Low' },
  MEDIUM: { color: COLORS.primary, bg: COLORS.primaryLight, label: 'Medium' },
  HIGH: { color: COLORS.amber, bg: COLORS.amberLight, label: 'High' },
  URGENT: { color: COLORS.error, bg: COLORS.errorLight, label: 'Urgent' },
};

/**
 * Get theme-aware priority styles. LOW adapts to theme.
 */
export function getThemedPriorityStyles(colors: ThemeColors): Record<TaskPriority, PriorityStyle> {
  return {
    LOW: { color: colors.textMuted, bg: colors.surfaceRaised, label: 'Low' },
    MEDIUM: { color: COLORS.primary, bg: colors.primaryLight, label: 'Medium' },
    HIGH: { color: COLORS.amber, bg: colors.amberLight, label: 'High' },
    URGENT: { color: COLORS.error, bg: colors.errorLight, label: 'Urgent' },
  };
}

/**
 * Get priority style by priority string (case-insensitive).
 * Accepts optional theme colors for dark mode support.
 */
export function getPriorityStyle(priority: string, colors?: ThemeColors): PriorityStyle {
  const normalizedPriority = priority.toUpperCase() as TaskPriority;
  if (colors) {
    return getThemedPriorityStyles(colors)[normalizedPriority] || getThemedPriorityStyles(colors).MEDIUM;
  }
  return PRIORITY_STYLES[normalizedPriority] || PRIORITY_STYLES.MEDIUM;
}

// =============================================================================
// TIME OFF REQUEST STATUS STYLES
// =============================================================================

export type TimeOffStatus = 'APPROVED' | 'PENDING' | 'REJECTED' | 'CANCELED';

export type TimeOffStatusStyle = {
  bg: string;
  text: string;
  border: string;
  label: string;
};

export const TIME_OFF_STATUS_STYLES: Record<TimeOffStatus, TimeOffStatusStyle> = {
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

// =============================================================================
// COMMON STYLES
// =============================================================================

export const commonStyles = StyleSheet.create({
  // Containers — backgroundColor provided inline via colors.surface
  container: {
    flex: 1,
  },
  screenContainer: {
    flex: 1,
  },

  // Cards — backgroundColor provided inline via colors.card
  card: {
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.md,
  },
  cardSmall: {
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    ...SHADOWS.sm,
  },

  // Sections
  section: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },

  // Flex utilities
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Loading & Error states — backgroundColor provided inline via colors.surface
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  errorText: {
    fontSize: FONT_SIZE.lg,
    color: COLORS.error,
    textAlign: 'center',
    marginTop: SPACING.md,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xxxl,
  },
  // emptyText — color provided inline via colors.textSecondary
  emptyText: {
    fontSize: FONT_SIZE.lg,
    textAlign: 'center',
    marginTop: SPACING.md,
  },

  // Dividers — backgroundColor provided inline via colors.border
  divider: {
    height: 1,
    marginVertical: SPACING.md,
  },

  // Badge base
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    gap: SPACING.xs,
  },
  badgeText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.semibold,
  },
});

// =============================================================================
// STYLE HELPERS
// =============================================================================

/**
 * Create a status badge style object
 */
export function createStatusBadgeStyle(status: string): {
  container: ViewStyle;
  text: TextStyle;
} {
  const style = getStatusStyle(status);
  return {
    container: {
      backgroundColor: style.bg,
      borderColor: style.border,
      borderWidth: 1,
      borderRadius: RADIUS.sm,
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xs,
    },
    text: {
      color: style.text,
      fontSize: FONT_SIZE.xs,
      fontWeight: FONT_WEIGHT.semibold,
    },
  };
}

/**
 * Create a priority dot style
 */
export function createPriorityDotStyle(priority: string): ViewStyle {
  const style = getPriorityStyle(priority);
  return {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: style.color,
  };
}
