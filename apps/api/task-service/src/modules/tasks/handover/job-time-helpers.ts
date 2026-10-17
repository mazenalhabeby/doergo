import { TaskEventType } from '@prisma/client';
import { type WorkTimelineEvent, TERMINAL_STATUSES } from '@hbcfield/shared';

type TaskRef = { id: string; workflowId: string | null; spaceId: string | null; organizationId: string };

type EventRow = { taskId: string; createdAt: Date; userId: string; eventType: TaskEventType; metadata: unknown };

const PERSON = { select: { id: true, firstName: true, lastName: true } } as const;

const TIME_EVENTS = [TaskEventType.STATUS_CHANGED, TaskEventType.PAUSED, TaskEventType.RESUMED];

/** Taken off the job: who is credited changes there (shared jobWindows). */
const LEAVE_EVENTS = [TaskEventType.UNASSIGNED, TaskEventType.ASSIGNEE_REMOVED];

/** One person's own presence on a crew job (shared crew.ts). */
const CREW_EVENTS = [
  TaskEventType.CREW_JOINED,
  TaskEventType.CREW_LEFT,
  TaskEventType.SELF_BLOCKED,
  TaskEventType.SELF_RESUMED,
];

/** A job's history is read whole up to this many rows (newest kept) — years of a daily crew. */
const EVENTS_PER_TASK = 5000;

/** Up to this many jobs are read one query each; more share one query. */
const PER_TASK_READS = 20;

/** Built-in closed steps (shared TERMINAL_STATUSES) — a custom flow's own final step simply counts nothing after it. */
const CLOSED_KEYS: string[] = TERMINAL_STATUSES;

const PERSONAL_KIND: Record<string, WorkTimelineEvent['kind']> = {
  [TaskEventType.CREW_JOINED]: 'JOINED',
  [TaskEventType.CREW_LEFT]: 'LEFT',
  [TaskEventType.SELF_BLOCKED]: 'SELF_BLOCKED',
  [TaskEventType.SELF_RESUMED]: 'SELF_RESUMED',
};

/** What the office wrote on a move it made for somebody — see TasksService.updateStatus. */
type MoveMeta = {
  newStatus?: string;
  occurredAt?: string;
  at?: string;
  byOffice?: boolean;
  forUserId?: string;
  officeReason?: string;
  reason?: string;
};

export {
  TaskRef,
  EventRow,
  PERSON,
  TIME_EVENTS,
  LEAVE_EVENTS,
  CREW_EVENTS,
  EVENTS_PER_TASK,
  PER_TASK_READS,
  CLOSED_KEYS,
  PERSONAL_KIND,
  MoveMeta,
};
