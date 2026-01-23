/**
 * Shared styles for the mobile app
 * Centralized status badges, priority indicators, and common style patterns
 */

import { StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOWS } from './constants';
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

export const STATUS_STYLES: Record<TaskStatus, StatusStyle> = {
  DRAFT: {
    bg: COLORS.slate50,
    text: COLORS.slate500,
    border: COLORS.slate200,
    label: 'Draft'
  },
  NEW: {
    bg: COLORS.infoLight,
    text: COLORS.primary,
    border: COLORS.infoBorder,
    label: 'New'
  },
  ASSIGNED: {
    bg: COLORS.purpleLight,
    text: COLORS.purple,
    border: COLORS.purpleBorder,
    label: 'Assigned'
  },
  ACCEPTED: {
    bg: '#d1fae5', // emerald light
    text: '#059669', // emerald
    border: '#6ee7b7', // emerald border
    label: 'Accepted'
  },
  EN_ROUTE: {
    bg: '#cffafe', // cyan light
    text: '#0891b2', // cyan
    border: '#67e8f9', // cyan border
    label: 'On The Way'
  },
  ARRIVED: {
    bg: '#e0e7ff', // indigo light
    text: '#4f46e5', // indigo
    border: '#a5b4fc', // indigo border
    label: 'Arrived'
  },
  IN_PROGRESS: {
    bg: COLORS.amberLight,
    text: COLORS.amber,
    border: COLORS.amberBorder,
    label: 'In Progress'
  },
  BLOCKED: {
    bg: COLORS.errorLight,
    text: COLORS.error,
    border: COLORS.errorBorder,
    label: 'Blocked'
  },
  COMPLETED: {
    bg: COLORS.successLight,
    text: COLORS.success,
    border: COLORS.successBorder,
    label: 'Completed'
  },
  CANCELED: {
    bg: COLORS.slate100,
    text: COLORS.slate500,
    border: COLORS.slate300,
    label: 'Canceled'
  },
  CLOSED: {
    bg: COLORS.slate50,
    text: COLORS.slate400,
    border: COLORS.slate200,
    label: 'Closed'
  },
};

/**
 * Get status style by status string (case-insensitive)
 */
export function getStatusStyle(status: string): StatusStyle {
  const normalizedStatus = status.toUpperCase() as TaskStatus;
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
  LOW: {
    color: COLORS.slate400,
    bg: COLORS.slate100,
    label: 'Low'
  },
  MEDIUM: {
    color: COLORS.primary,
    bg: COLORS.primaryLight,
    label: 'Medium'
  },
  HIGH: {
    color: COLORS.amber,
    bg: COLORS.amberLight,
    label: 'High'
  },
  URGENT: {
    color: COLORS.error,
    bg: COLORS.errorLight,
    label: 'Urgent'
  },
};

/**
 * Get priority style by priority string (case-insensitive)
 */
export function getPriorityStyle(priority: string): PriorityStyle {
  const normalizedPriority = priority.toUpperCase() as TaskPriority;
  return PRIORITY_STYLES[normalizedPriority] || PRIORITY_STYLES.MEDIUM;
}

// =============================================================================
// TIME OFF REQUEST STATUS STYLES
// =============================================================================

export type TimeOffStatus = 'APPROVED' | 'PENDING' | 'REJECTED';

export type TimeOffStatusStyle = {
  bg: string;
  text: string;
  border: string;
  label: string;
};

export const TIME_OFF_STATUS_STYLES: Record<TimeOffStatus, TimeOffStatusStyle> = {
  APPROVED: {
    bg: COLORS.successLight,
    text: COLORS.success,
    border: COLORS.success,
    label: 'Approved',
  },
  PENDING: {
    bg: COLORS.amberLight,
    text: COLORS.amber,
    border: COLORS.amber,
    label: 'Pending',
  },
  REJECTED: {
    bg: COLORS.errorLight,
    text: COLORS.error,
    border: COLORS.error,
    label: 'Rejected',
  },
};

/**
 * Get time off status style by status string (case-insensitive)
 */
export function getTimeOffStatusStyle(status: string): TimeOffStatusStyle {
  const normalizedStatus = status.toUpperCase() as TimeOffStatus;
  return TIME_OFF_STATUS_STYLES[normalizedStatus] || TIME_OFF_STATUS_STYLES.PENDING;
}

// =============================================================================
// COMMON STYLES
// =============================================================================

export const commonStyles = StyleSheet.create({
  // Containers
  container: {
    flex: 1,
    backgroundColor: COLORS.slate50,
  },
  screenContainer: {
    flex: 1,
    backgroundColor: COLORS.slate50,
  },

  // Cards
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.md,
  },
  cardSmall: {
    backgroundColor: COLORS.white,
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

  // Loading & Error states
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.slate50,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
    backgroundColor: COLORS.slate50,
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
  emptyText: {
    fontSize: FONT_SIZE.lg,
    color: COLORS.slate500,
    textAlign: 'center',
    marginTop: SPACING.md,
  },

  // Dividers
  divider: {
    height: 1,
    backgroundColor: COLORS.slate100,
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
