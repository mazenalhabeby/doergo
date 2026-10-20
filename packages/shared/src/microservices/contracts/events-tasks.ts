/** Events about jobs: created, updated, assigned, steps, crew, lead, role offers, comments, attachments, location on the way. */
import { event } from '../event';
import type {
  CommentAddedMessage,
  EventTask,
  SentNotRead,
  TaskAssignedMessage,
  TaskDepartureDueMessage,
  TaskStatusChangedMessage,
} from './events-types';

export const taskHandoverAddedEvent = event<
  {
    taskId: string;
    taskTitle: string;
    authorName: string;
    recipientIds: string[];
    organizationId: string;
  } & SentNotRead<'authorId'>
>('task_handover_added');

export const taskStartedForYouEvent = event<{
  taskId: string;
  taskTitle: string;
  userId: string;
  byName: string;
  reason: string;
  organizationId: string;
}>('task_started_for_you');

export const taskCrewStartedEvent = event<{
  taskId: string;
  taskTitle: string;
  starterName: string;
  startedAt: string;
  memberIds: string[];
}>('task_crew_started');

export const taskLeadChangedEvent = event<{
  taskId: string;
  taskTitle: string;
  toUserId: string;
  byName: string;
  scope: 'TODAY' | 'PERMANENT';
}>('task_lead_changed');

export const taskLeadNeededEvent = event<{
  taskId: string;
  taskTitle: string;
  recipientIds: string[];
  leaderName: string;
  actingName?: string | null;
}>('task_lead_needed');

export const taskCrewIssueEvent = event<{
  taskId: string;
  taskTitle: string;
  leaderId: string;
  name: string;
  reason: string;
}>('task_crew_issue');

export const tasksPausedEvent = event<
  { taskIds: string[]; userId: string; organizationId: string } & SentNotRead<'reason'>
>('tasks_paused');

export const roleTaskOfferedEvent = event<{
  task: { id: string; title: string; organizationId: string };
  roleName: string;
  userIds: string[];
  wave: number;
}>('role_task_offered');

export const roleTaskTakenEvent = event<{
  task: { id: string; title: string; organizationId: string };
  takerName: string;
  notifyIds: string[];
}>('role_task_taken');

export const roleTaskUnclaimedEvent = event<{
  task: { id: string; title: string; organizationId: string };
  roleName: string;
  minutes: number;
  names: string[];
  notifyIds: string[];
}>('role_task_unclaimed');

/** Only the task's id is read; emitters send the whole task (or null when it was not found). */
export const taskUpdatedEvent = event<
  { task?: { id?: string; [field: string]: unknown } | null } & SentNotRead<'actorId'>
>('task_updated');

export const taskCreatedEvent = event<EventTask>('task_created');

export const taskDeclinedEvent = event<{ task: EventTask; declinedBy: unknown }>('task_declined');

export const taskDeletedEvent = event<{ taskId: string; organizationId: string; spaceId?: string | null }>(
  'task_deleted',
);

export const attachmentAddedEvent = event<{ taskId: string; attachment: unknown }>('attachment_added');

/** ⚠️ organizationId may be undefined (tracking-service sends what the token carried) — kept as it is. */
export const workerLocationUpdatedEvent = event<
  { organizationId?: string; workerId: string; location: unknown } & SentNotRead<'taskId'>
>('worker_location_updated');

export const taskDepartureDueEvent = event<TaskDepartureDueMessage>('task_departure_due');

export const taskAssignedEvent = event<TaskAssignedMessage>('task_assigned');

export const taskStatusChangedEvent = event<TaskStatusChangedMessage & SentNotRead<'reportId'>>('task_status_changed');

export const commentAddedEvent = event<CommentAddedMessage>('comment_added');

export const blockedTasksReminderEvent = event<{
  userId: string;
  blockedTasks: { id: string; title: string }[];
  newTaskId: string;
  newTaskTitle: string;
}>('blocked_tasks_reminder');
