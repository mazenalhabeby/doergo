import { event } from '../event';
import { OVERTIME_NOTICE_EVENT, type OvertimeNotice } from '../../attendance/overtime-notice';
import type {
  GeofenceExcursionEvent,
  ShiftIssueCreatedMessage,
  ShiftIssueEventMessage,
  SentNotRead,
} from './events-types';

/**
 * Events handled by notification-service (excursion-notification.handler, join-request-notification.handler, no-
 * show-notification.handler, overtime-notification.handler, report-notification.handler, role-task-
 * notification.handler, shift-issue-notification.handler, support-notification.handler). Payload = what the
 * handler reads.
 */

export const geofenceExcursionOutEvent = event<GeofenceExcursionEvent>('geofence_excursion_out');

export const geofenceExcursionRequestedEvent = event<GeofenceExcursionEvent>('geofence_excursion_requested');

export const geofenceExcursionApprovedEvent = event<GeofenceExcursionEvent>('geofence_excursion_approved');

export const geofenceExcursionRejectedEvent = event<GeofenceExcursionEvent>('geofence_excursion_rejected');

export const geofenceExcursionReturnedEvent = event<GeofenceExcursionEvent>('geofence_excursion_returned');

export const geofenceExcursionExpiredEvent = event<GeofenceExcursionEvent>('geofence_excursion_expired');

export const joinRequestSubmittedEvent = event<{
  userId: string;
  userName: string;
  organizationId: string;
  organizationName: string;
  message?: string;
  recipientIds?: string[];
}>('join_request_submitted');

export const joinRequestApprovedEvent = event<{
  userId: string;
  /** ⚠️ Read by the handler, never sent by the gateway (join-requests.controller) — kept as it is. */
  userName?: string;
  organizationId: string;
  organizationName: string;
  role: string;
  approvedByName: string;
}>('join_request_approved');

export const joinRequestRejectedEvent = event<{
  userId: string;
  /** ⚠️ Read by the handler, never sent by the gateway (join-requests.controller) — kept as it is. */
  userName?: string;
  organizationId: string;
  organizationName: string;
  reason?: string;
  rejectedByName: string;
}>('join_request_rejected');

export const attendanceNoshowReminderEvent = event<{
  instanceId: string;
  userId: string;
  userName: string;
  spaceId: string;
  expectedClockInAt: string | null;
  reminderCount: number;
  organizationId: string;
}>('attendance_noshow_reminder');

export const attendanceNoshowEscalationEvent = event<{
  instanceId: string;
  userId: string;
  userName: string;
  spaceId: string;
  expectedClockInAt: string | null;
  leaderIds: string[];
  organizationId: string;
}>('attendance_noshow_escalation');

export const attendanceNoshowResolvedEvent = event<{
  instanceId: string;
  userId: string;
  userName: string;
  spaceId: string;
  clockInAt: string;
  timezone?: string | null;
  recordedOffline: boolean;
  leaderIds: string[];
  organizationId: string;
}>('attendance_noshow_resolved');

export const overtimeNoticeEvent = event<OvertimeNotice>(OVERTIME_NOTICE_EVENT);

export const reportEmailEvent = event<{ recipients: string[]; subject: string; html: string }>('report_email');

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

export const shiftIssueCreatedEvent = event<ShiftIssueCreatedMessage>('shift_issue_created');

export const shiftIssueEventEvent = event<ShiftIssueEventMessage>('shift_issue_event');

export const supportTicketCreatedEvent = event<{ ticket: any }>('support_ticket_created');

export const supportMessageEvent = event<
  {
    ticketId: string;
    message: any;
    ticket: any;
    isInternalNote?: boolean;
    customerId: string;
  } & SentNotRead<'organizationId'>
>('support_message');

export const supportTicketUpdatedEvent = event<{ ticket: any }>('support_ticket_updated');

export const supportSlaBreachedEvent = event<{ ticket: any }>('support_sla_breached');
