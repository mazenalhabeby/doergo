import { Prisma } from '@prisma/client';
import type { OccurrenceEvidence } from '@hbcfield/shared';

/** What `TaskStatusService.updateStatus` is asked. */
export interface UpdateStatusInput {
  id: string;
  status: string;
  userId: string;
  userRole: string;
  canViewAllTasks?: boolean;
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
  access?: unknown;
  /**
   * The office starting somebody's job for them (packages/shared/src/tasks/job-time.ts):
   * why — required — and optionally when it really started. Recorded as the
   * office's action, and the worker is told.
   */
  onBehalf?: { reason?: string; at?: string };
}

/** The task as updateStatus reads it: with its site's zone. */
export type StatusTask = Prisma.TaskGetPayload<{ include: { space: { select: { timezone: true } } } }>;

/** The task as every status answer returns it. */
export const TASK_WITH_PEOPLE_INCLUDE = {
  assignedTo: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
} as const;

/** The task as read back after the write. */
export type TaskWithPeople = Prisma.TaskGetPayload<{
  include: {
    assignedTo: { select: { id: true; firstName: true; lastName: true; avatarUrl: true } };
    createdBy: { select: { id: true; firstName: true; lastName: true; avatarUrl: true } };
  };
}>;

/** The office starting a job for somebody: for whom, why, and (when given) when. */
export interface OfficeStart {
  forUserId: string;
  reason: string;
  at: Date | null;
}
