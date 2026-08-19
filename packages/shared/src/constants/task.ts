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
/**
 * Execution statuses that any assigned user can transition to
 */
const EXECUTION_STATUSES: TaskStatus[] = [
  TaskStatus.ACCEPTED,
  TaskStatus.EN_ROUTE,
  TaskStatus.ARRIVED,
  TaskStatus.IN_PROGRESS,
  TaskStatus.BLOCKED,
  TaskStatus.COMPLETED,
];

export const ROLE_STATUS_PERMISSIONS: Record<Role, TaskStatus[]> = {
  [Role.ADMIN]: [...EXECUTION_STATUSES, TaskStatus.ASSIGNED, TaskStatus.CANCELED],
  [Role.EMPLOYEE]: EXECUTION_STATUSES,
  // External customers never drive task execution — they only open requests.
  [Role.CUSTOMER]: [],
};

/**
 * Check if a role can transition to a specific status.
 * Any legacy/admin string collapses to ADMIN; everything else to EMPLOYEE.
 */
export function canRoleSetStatus(role: Role | string, status: TaskStatus): boolean {
  const normalizedRole = role === 'ADMIN' || role === 'CLIENT' ? Role.ADMIN : Role.EMPLOYEE;
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

/**
 * Is this task past its due date and still open?
 *
 * "Overdue" needs both halves — a completed task due last week is not overdue —
 * and the second half is exactly the terminal-status list above. This existed as
 * four byte-identical copies across the task card, the table row, the timeline
 * and the dashboard, each re-inlining the status list, so a change to what
 * counts as finished would have had to be found in four places.
 */
export function isTaskOverdue(task: {
  dueDate?: string | Date | null;
  status: TaskStatus | string;
}): boolean {
  if (!task.dueDate) return false;
  if (isTerminalStatus(task.status as TaskStatus)) return false;
  return new Date(task.dueDate) < new Date();
}

/**
 * Is this status the end of the line?
 *
 * A finished task stops moving: COMPLETED may only be CLOSED, and CANCELED and
 * CLOSED may do nothing. The server enforces it; screens use this so they stop
 * OFFERING what the server will refuse — a card that slides into a column and
 * snaps back is worse than one that never lifted.
 *
 * Canonical statuses only. A task on a custom workflow is finished when its
 * current column is marked isFinal or isCanceled, which the caller knows and
 * this cannot.
 */
export function isFinishedStatus(status: string | null | undefined): boolean {
  return (
    status === TaskStatus.COMPLETED ||
    status === TaskStatus.CLOSED ||
    status === TaskStatus.CANCELED
  );
}

/**
 * May a task move from one status to another?
 *
 * The single statement of a rule that had been written twice — once in the
 * service and once, differently, in each screen that offers the move. That is
 * how the board came to allow dragging a completed task the server would
 * refuse, and how the task page came to hide a transition the server allows.
 *
 * A manager may drop a card in any column of the flow, which is what makes a
 * board usable. That freedom stops at a finished task: from there the declared
 * transitions govern, so COMPLETED may still be CLOSED — the step it has — and
 * CANCELED and CLOSED may do nothing.
 *
 * Screens use it to decide what to OFFER; the service uses it to decide what to
 * accept. Same answer, so nothing is offered that will then be refused.
 */
export function mayChangeStatus(opts: {
  from: string;
  to: string;
  /** Statuses `from` declares it can become — the workflow's, or the canonical table's. */
  allowedTargets: readonly string[];
  /** Is `to` a status of this task's flow at all? */
  targetIsValidStatus: boolean;
  /** ADMIN, or the "view all tasks" grant — may move any card of an ACTIVE task. */
  isManager: boolean;
  /** Is `from` a terminal status? Canonical, or the workflow's isFinal/isCanceled. */
  fromIsFinished: boolean;
}): boolean {
  if (opts.from === opts.to) return false;
  const managerFreeMove = opts.isManager && opts.targetIsValidStatus && !opts.fromIsFinished;
  return managerFreeMove || opts.allowedTargets.includes(opts.to);
}

/**
 * Can this task move at all? If not, screens should not offer to move it —
 * a card that lifts and snaps back is worse than one that never lifted.
 */
export function hasAnyTransition(opts: {
  allowedTargets: readonly string[];
  isManager: boolean;
  fromIsFinished: boolean;
}): boolean {
  if (!opts.fromIsFinished && opts.isManager) return true; // free-move on the board
  return opts.allowedTargets.length > 0;
}
