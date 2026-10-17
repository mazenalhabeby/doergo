import { event } from '../event';
import type {
  CommentAddedMessage,
  EventTask,
  TaskAssignedMessage,
  TaskDepartureDueMessage,
  TaskStatusChangedMessage,
  TimeOffRequestFacts,
  SentNotRead,
} from './events-types';

/**
 * Events handled by notification-service (task-live.handler, task-notification.handler, time-off-
 * notification.handler, notification.controller). Payload = what the handler reads.
 */

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

export const timeOffRequestedEvent = event<
  {
    timeOffId: string;
    organizationId: string;
    memberId: string;
    memberName: string;
    type?: string;
    startDate: string;
    endDate: string;
    reason?: string | null;
    recipientIds: string[];
  } & TimeOffRequestFacts &
    SentNotRead<'cover'>
>('time_off_requested');

export const timeOffDecidedEvent = event<
  {
    timeOffId: string;
    organizationId: string;
    memberId: string;
    approved: boolean;
    rejectionReason?: string | null;
    startDate: string;
    endDate: string;
  } & TimeOffRequestFacts
>('time_off_decided');

export const userLocaleChangedEvent = event<{ userId: string }>('user_locale_changed');

export const userRemovedEvent = event<{ userId: string; organizationId: string }>('user_removed');

export const userSessionsRevokedEvent = event<{ userId: string }>('user_sessions_revoked');

export const organizationSuspendedEvent = event<{ organizationId: string }>('organization_suspended');

export const memberAccessUpdatedEvent = event<{ memberId: string; organizationId: string }>('member_access_updated');

export const memberChangedEvent = event<{ organizationId: string; memberId?: string; reason?: string }>(
  'member_changed',
);

export const customerChangedEvent = event<{ organizationId: string; customerId?: string }>('customer_changed');

export const invitationCreatedEvent = event<{
  recipientEmail: string;
  organizationName: string | null;
  /** ⚠️ null for an invitation that has no plain code stored — kept as it is. */
  invitationCode: string | null;
  targetRole: string;
  expiresAt: string;
  /** The member who created it — their language is the email's fallback. */
  inviterId?: string | null;
  /** Already decided by the sender — a client's invitation (see EmailService). */
  locale?: string | null;
}>('invitation_created');

/** Handled by task-service (NotificationRoutingController): drop the cached routing. */
export const notificationRoutingChangedEvent = event<{ organizationId?: string; subjectUserId?: string }>(
  'notification_routing_changed',
);

/** Handled by auth-service (UsersController): which app version a member's phone runs. */
export const appVersionSeenEvent = event<{ userId: string; version: string; platform?: string }>('app_version_seen');
