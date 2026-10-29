/**
 * What the task queue's jobs carry, written once here and read by the gateway (which
 * queues them) and task-service (which handles them). Each was the handler's own
 * parameter type; task-service keeps the old names as aliases.
 */
import type { ResolvedAccess } from '../types/permissions/resolved-access';
import type { OccurrenceEvidence } from '../sync/occurrence';
import type { TaskAccessFacts } from '../microservices/contracts/task-service-types';

/** Who is asking, as the gateway resolved it from the token — never from the body. */
export interface TaskJobCaller {
  userId: string;
  userRole: string;
  organizationId: string;
  /** The ORG-wide resolution of canViewAllTasks. */
  canViewAllTasks?: boolean;
  /** The caller's resolved access (cross-org shared spaces, per-space grants). */
  access?: ResolvedAccess | null;
}

/** The fields of a task a create or an edit may set. */
export interface TaskFields {
  title?: string;
  description?: string | null;
  priority?: string;
  /** ISO date or date-time; midnight means "no hour" (appointment-times). */
  dueDate?: string | Date | null;
  startDate?: string | Date | null;
  estimatedHours?: number | null;
  storyPoints?: number | null;
  spaceId?: string | null;
  workflowId?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  locationAddress?: string | null;
  assetId?: string | null;
  customerId?: string | null;
  unitId?: string | null;
  phaseId?: string | null;
  sprintId?: string | null;
  epicId?: string | null;
}

/** `task.create` — a new task (TaskRecordsService.create and its steps). The create never reads the role. */
export interface TaskCreateJob extends Omit<TaskJobCaller, 'userRole'>, TaskFields {
  userRole?: string;
  /** Id made on the phone — a resend returns the task it made. */
  id?: string;
  title: string;
  parentId?: string | null;
  assignedToId?: string | null;
  assigneeIds?: string[];
  /** Open to a WORK role instead of named people (role-pool.ts). */
  openRoleId?: string | null;
  openSpots?: number | null;
  /** Spaces where the caller may open a task to a role; absent = no narrowing. */
  roleAssignSpaceIds?: string[];
  /** `false` = an un-triaged portal request: no workspace, no flow, until triage. */
  triaged?: boolean;
  source?: string;
  /** SPACE = the caller creates inside a workspace they are assigned to. */
  taskCreationScope?: string;
}

/**
 * `task.update` — an edit. The caller's facts are taken off before the write; the
 * remaining fields are the change (recorded on the task's history as sent).
 */
export interface TaskUpdateJob extends TaskJobCaller, TaskFields {
  id: string;
  canCreateTasks?: boolean;
  createSpaceIds?: string[];
  viewAllSpaceIds?: string[];
  canAssignTasks?: boolean;
  sharedSpaceIds?: string[];
  taskCreationScope?: string;
  /** Anything else the edit names is kept on the history row, never written raw. */
  [field: string]: unknown;
}

/** `task.createSubtask` — a task under another one (TaskHierarchyService.createSubtask). */
export interface SubtaskCreateJob extends TaskJobCaller, TaskFields {
  parentId: string;
  title: string;
  /** The parent's id as some clients send it. */
  taskId?: string;
  assignedToId?: string | null;
  canCreateTasks?: boolean;
  createSpaceIds?: string[];
  canAssignTasks?: boolean;
  assignSpaceIds?: string[];
}

/** `task.updateStatus` — moving a task to a step (TaskStatusService.updateStatus). */
export interface TaskStatusJob {
  id: string;
  status: string;
  userId: string;
  userRole: string;
  canViewAllTasks?: boolean;
  /** Org-wide "assign tasks" — in crew mode, what moves a step past the leader (CrewService.assertMayMoveStep). */
  canAssignTasks?: boolean;
  organizationId: string;
  reason?: string;
  lat?: number;
  lng?: number;
  /**
   * The error radius the device reported, in metres.
   *
   * Widens the arrival zone rather than being ignored. Absent means the client
   * made no claim about accuracy and is treated as zero tolerance, so an older
   * app that does not send it behaves exactly as it always did.
   */
  accuracy?: number;
  /** The status the phone saw when the member tapped — see the conflict check in updateStatus. */
  expectedFrom?: string;
  /** When and where the tap happened, from a phone that may have been offline. */
  evidence?: OccurrenceEvidence;
  /**
   * Answers to the form of the step being moved into — see step-submission.ts.
   * Untrusted: re-validated here against the step's own definition.
   */
  answers?: unknown;
  // Server-authoritative cross-org grant map (forwarded from the gateway).
  // Used to allow a guest org to move a task in a space explicitly shared to it.
  access?: ResolvedAccess | null;
  /**
   * The office starting somebody's job for them (packages/shared/src/tasks/job-time.ts):
   * why — required — and optionally when it really started. Recorded as the
   * office's action, and the worker is told.
   */
  onBehalf?: { reason?: string; at?: string };
}

/** Who is asking about a crew, as the gateway resolved it. */
export interface CrewActor {
  userId: string;
  userRole: string;
  organizationId: string;
  /** Org-wide "view all tasks" — the office's authority over a job's step. */
  canViewAllTasks?: boolean;
  /** Org-wide "assign tasks" — the office's authority over who leads. */
  canAssignTasks?: boolean;
  access?: ResolvedAccess | null;
  /** Spaces where the caller holds canViewAllTasks by a SPACE role — the task gate reads them. */
  viewAllSpaceIds?: string[];
  /** Cross-org shared spaces (reads only; the gateway sends [] on writes). */
  sharedSpaceIds?: string[];
}

/** The grants a checklist owner change is judged on — the gateway forwards them, never the client. */
export type ChecklistActor = { canAssignTasks?: boolean; access?: ResolvedAccess | null };

/** A checklist job's caller: the task gate's facts and the owner-change grants. */
export type ChecklistJobCaller = TaskAccessFacts & ChecklistActor;
