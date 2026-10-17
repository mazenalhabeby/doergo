import { event } from '../event';
import type {
  AssetLogDueMessage,
  AssetProposalDecidedMessage,
  AssetProposalRaisedMessage,
  ExpenseDecidedEvent,
  ExpenseSubmittedEvent,
  HandedOverEvent,
  SentNotRead,
} from './events-types';

/**
 * Events handled by notification-service (approval-notification.handler, asset-log-notification.handler, asset-
 * notification.handler, asset-proposal-notification.handler, attendance-alerts.handler, attendance-
 * live.handler). Payload = what the handler reads.
 */

export const approvalSecondStepEvent = event<
  {
    recipientIds?: string[];
    kind: string;
    itemId: string;
    firstName?: string;
    subjectName?: string;
  } & SentNotRead<'organizationId'>
>('approval_second_step');

export const approvalReminderEvent = event<
  {
    recipientIds?: string[];
    kind: 'overtime' | 'request' | 'expense';
    itemId: string;
    stage: 'REMIND' | 'ESCALATE';
    subjectName?: string;
    hours?: number;
  } & SentNotRead<'organizationId'>
>('approval_reminder');

export const assetLogDueEvent = event<AssetLogDueMessage>('asset_log_due');

export const assetExpenseSubmittedEvent = event<ExpenseSubmittedEvent>('asset_expense_submitted');

export const assetExpenseDecidedEvent = event<ExpenseDecidedEvent>('asset_expense_decided');

export const assetHandedOverEvent = event<HandedOverEvent>('asset_handed_over');

export const assetProposalRaisedEvent = event<AssetProposalRaisedMessage>('asset_proposal_raised');

export const assetProposalDecidedEvent = event<AssetProposalDecidedMessage>('asset_proposal_decided');

export const attendanceOvertimeRequestEvent = event<
  {
    entryId: string;
    userId: string;
    userName: string;
    locationId: string;
    locationName: string;
    leaderIds: string[];
    organizationId: string;
  } & SentNotRead<'cycle'>
>('attendance_overtime_request');

export const attendanceOvertimeDecisionEvent = event<{
  entryId: string;
  userId: string;
  decision: 'approved' | 'rejected';
  minutes?: number;
  newExpectedClockOutAt?: string;
  organizationId: string;
}>('attendance_overtime_decision');

export const attendanceGeofenceAlertEvent = event<{
  userId: string;
  userName: string;
  userEmail: string;
  locationName: string;
  distance: number;
  allowedRadius: number;
  action: 'clock_in' | 'clock_out';
  dispatcherEmails: string[];
  dispatcherIds: string[];
  organizationId: string;
}>('attendance_geofence_alert');

export const attendancePendingApprovalEvent = event<{
  entryId: string;
  userId: string;
  userName: string;
  locationName: string;
  flagReasons: string[];
  totalMinutes: number;
  managerIds: string[];
  organizationId: string;
}>('attendance_pending_approval');

/** ⚠️ organizationId is the caller's, which the type allows to be null (gateway users.controller) — kept as it is. */
export const presenceChangedEvent = event<{ userId: string; presence: string | null; organizationId: string | null }>(
  'presence_changed',
);

export const spaceChangedEvent = event<{ organizationId: string; spaceId?: string | null }>('space_changed');

export const documentTypesChangedEvent = event<{ organizationId: string; typeId?: string | null }>(
  'document_types_changed',
);

export const spaceRosterChangedEvent = event<{ organizationId: string; spaceId?: string | null }>(
  'space_roster_changed',
);

// The entry is passed through to screens as sent.
export const attendanceClockInEvent = event<{ userId: string; organizationId: string; timeEntry: unknown }>(
  'attendance_clock_in',
);

export const attendanceClockOutEvent = event<{ userId: string; organizationId: string; timeEntry: unknown }>(
  'attendance_clock_out',
);

export const attendanceChangedEvent = event<{ organizationId: string; action: string; entryId?: string }>(
  'attendance_changed',
);

export const breakStartedEvent = event<{
  userId: string;
  userName: string;
  breakId: string;
  breakType: string;
  startedAt: string;
  organizationId: string;
}>('break_started');

export const breakEndedEvent = event<{
  userId: string;
  userName: string;
  breakId: string;
  breakType: string;
  startedAt: string;
  endedAt: string;
  durationMinutes: number;
  organizationId: string;
}>('break_ended');
