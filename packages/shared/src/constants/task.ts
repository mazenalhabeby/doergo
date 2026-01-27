/**
 * Task Constants
 *
 * Centralized task-related business logic constants.
 * Includes status transitions, validation rules, and defaults.
 */

import { TaskStatus, TaskPriority, Role } from '../types';

// =============================================================================
// STATUS TRANSITIONS
// =============================================================================

/**
 * Valid status transitions for task workflow
 * Maps current status to array of allowed next statuses
 *
 * Flow: DRAFT → NEW → ASSIGNED → ACCEPTED → EN_ROUTE → ARRIVED → IN_PROGRESS → COMPLETED → CLOSED
 *                                                                       ↓
 *                                                                   BLOCKED → IN_PROGRESS
 *       ← ← ← ← ← ← ← ← ← ← ← ← CANCELED ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ←
 */
export const STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  [TaskStatus.DRAFT]: [TaskStatus.NEW],
  [TaskStatus.NEW]: [TaskStatus.ASSIGNED, TaskStatus.CANCELED],
  [TaskStatus.ASSIGNED]: [TaskStatus.ACCEPTED, TaskStatus.CANCELED],
  [TaskStatus.ACCEPTED]: [TaskStatus.EN_ROUTE, TaskStatus.CANCELED],
  [TaskStatus.EN_ROUTE]: [TaskStatus.ARRIVED, TaskStatus.CANCELED],
  [TaskStatus.ARRIVED]: [TaskStatus.IN_PROGRESS, TaskStatus.CANCELED],
  [TaskStatus.IN_PROGRESS]: [TaskStatus.BLOCKED, TaskStatus.COMPLETED, TaskStatus.CANCELED],
  [TaskStatus.BLOCKED]: [TaskStatus.IN_PROGRESS, TaskStatus.CANCELED],
  [TaskStatus.COMPLETED]: [TaskStatus.CLOSED],
  [TaskStatus.CANCELED]: [],
  [TaskStatus.CLOSED]: [],
};

/**
 * Check if a status transition is valid
 */
export function isValidStatusTransition(
  currentStatus: TaskStatus,
  newStatus: TaskStatus,
): boolean {
  const allowedTransitions = STATUS_TRANSITIONS[currentStatus] || [];
  return allowedTransitions.includes(newStatus);
}

/**
 * Get allowed next statuses for a given current status
 */
export function getAllowedNextStatuses(currentStatus: TaskStatus): TaskStatus[] {
  return STATUS_TRANSITIONS[currentStatus] || [];
}

// =============================================================================
// ROLE-BASED STATUS PERMISSIONS
// =============================================================================

/**
 * Statuses that each role can transition TO
 */
export const ROLE_STATUS_PERMISSIONS: Record<Role, TaskStatus[]> = {
  [Role.ADMIN]: [TaskStatus.CANCELED],
  [Role.CLIENT]: [TaskStatus.CANCELED], // DEPRECATED: Use ADMIN instead
  [Role.DISPATCHER]: [TaskStatus.ASSIGNED, TaskStatus.CANCELED],
  [Role.TECHNICIAN]: [
    TaskStatus.ACCEPTED,
    TaskStatus.EN_ROUTE,
    TaskStatus.ARRIVED,
    TaskStatus.IN_PROGRESS,
    TaskStatus.BLOCKED,
    TaskStatus.COMPLETED,
  ],
};

/**
 * Check if a role can transition to a specific status
 * Handles backward compatibility: CLIENT is treated as ADMIN
 */
export function canRoleSetStatus(role: Role | string, status: TaskStatus): boolean {
  // Handle backward compatibility: CLIENT maps to ADMIN
  const normalizedRole = role === 'CLIENT' ? Role.ADMIN : (role as Role);
  return ROLE_STATUS_PERMISSIONS[normalizedRole]?.includes(status) || false;
}

// =============================================================================
// PRIORITY LEVELS
// =============================================================================

/**
 * Priority sort order (lower = higher priority)
 */
export const PRIORITY_ORDER: Record<TaskPriority, number> = {
  [TaskPriority.URGENT]: 0,
  [TaskPriority.HIGH]: 1,
  [TaskPriority.MEDIUM]: 2,
  [TaskPriority.LOW]: 3,
};

/**
 * Default priority for new tasks
 */
export const DEFAULT_PRIORITY = TaskPriority.MEDIUM;

// =============================================================================
// PAGINATION DEFAULTS
// =============================================================================

/**
 * Default page size for task lists
 */
export const DEFAULT_PAGE_SIZE = 10;

/**
 * Maximum page size for task lists
 */
export const MAX_PAGE_SIZE = 100;

// =============================================================================
// VALIDATION LIMITS
// =============================================================================

/**
 * Maximum title length
 */
export const TASK_TITLE_MAX_LENGTH = 200;

/**
 * Maximum description length
 */
export const TASK_DESCRIPTION_MAX_LENGTH = 5000;

/**
 * Maximum comment length
 */
export const COMMENT_MAX_LENGTH = 2000;

/**
 * Maximum attachments per task
 */
export const MAX_ATTACHMENTS_PER_TASK = 20;

/**
 * Maximum file size in bytes (10MB)
 */
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

// =============================================================================
// ACTIVE/TERMINAL STATUSES
// =============================================================================

/**
 * Statuses that indicate the task is still active (not finished)
 */
export const ACTIVE_STATUSES: TaskStatus[] = [
  TaskStatus.DRAFT,
  TaskStatus.NEW,
  TaskStatus.ASSIGNED,
  TaskStatus.ACCEPTED,
  TaskStatus.EN_ROUTE,
  TaskStatus.ARRIVED,
  TaskStatus.IN_PROGRESS,
  TaskStatus.BLOCKED,
];

/**
 * Statuses that indicate the task is finished (terminal)
 */
export const TERMINAL_STATUSES: TaskStatus[] = [
  TaskStatus.COMPLETED,
  TaskStatus.CANCELED,
  TaskStatus.CLOSED,
];

/**
 * Check if a task is in an active (non-terminal) state
 */
export function isActiveStatus(status: TaskStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

/**
 * Check if a task is in a terminal (finished) state
 */
export function isTerminalStatus(status: TaskStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}
