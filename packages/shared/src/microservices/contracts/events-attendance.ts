/** Events about attendance: clocking, rests, shift reminders and escalations, no-shows, geofence, overtime, shift issues, time off. */
import { event } from '../event';
import type {
  GeofenceExcursionEvent,
  SentNotRead,
  ShiftIssueCreatedMessage,
  ShiftIssueEventMessage,
  TimeOffRequestFacts,
} from './events-types';
import { OVERTIME_NOTICE_EVENT, type OvertimeNotice } from '../../attendance/overtime-notice';

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
  locationId?: string | null; // who may hear it live (clock review A1)
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

/**
 * A person's working day was decided — the last entry of the day still waiting left review.
 * `approved` is false when any entry of the day was rejected. Pushed to the person only.
 */
export const attendanceDayDecidedEvent = event<{
  userId: string;
  organizationId: string;
  /** The day in the workspace's zone (yyyy-mm-dd). */
  localDate: string;
  approved: boolean;
  /** Counted minutes of the day's entries that were not rejected. */
  countedMinutes: number;
}>('attendance_day_decided');

/** ⚠️ organizationId is the caller's, which the type allows to be null (gateway users.controller) — kept as it is. */
export const presenceChangedEvent = event<{ userId: string; presence: string | null; organizationId: string | null }>(
  'presence_changed',
);

// The entry is passed through to screens as sent.
export const attendanceClockInEvent = event<{ userId: string; organizationId: string; timeEntry: unknown }>(
  'attendance_clock_in',
);

export const attendanceClockOutEvent = event<{ userId: string; organizationId: string; timeEntry: unknown }>(
  'attendance_clock_out',
);

/** A refresh signal; `spaceId`/`userId` decide who hears it live (clock review A1). */
export const attendanceChangedEvent = event<{ organizationId: string; action: string } & AttendanceAbout>(
  'attendance_changed',
);
type AttendanceAbout = { entryId?: string; spaceId?: string | null; userId?: string | null };

export const breakStartedEvent = event<{
  userId: string;
  userName: string;
  breakId: string;
  breakType: string;
  startedAt: string;
  organizationId: string;
  spaceId?: string | null; // who may hear it live (clock review A1)
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
  spaceId?: string | null; // who may hear it live (clock review A1)
}>('break_ended');

export const attendanceShiftReminderEvent = event<{
  entryId: string;
  userId: string;
  userName: string;
  locationId: string;
  locationName: string;
  expectedClockOutAt: string | null;
  reminderCount: number;
  unscheduled?: boolean;
  hoursOpen?: number;
  organizationId: string;
}>('attendance_shift_reminder');

export const attendanceLeftEarlyEvent = event<
  {
    entryId: string;
    userId: string;
    userName: string;
    locationId: string;
    locationName: string;
    shortfallMinutes: number;
    reason?: string | null;
    leaderIds: string[];
    organizationId: string;
  } & SentNotRead<'expectedClockOutAt'>
>('attendance_left_early');

export const attendanceShiftEscalationEvent = event<{
  entryId: string;
  userId: string;
  userName: string;
  locationId: string;
  locationName: string;
  expectedClockOutAt: string | null;
  unscheduled?: boolean;
  hoursOpen?: number;
  leaderIds: string[];
  organizationId: string;
}>('attendance_shift_escalation');

export const attendanceShiftClosedProvisionallyEvent = event<{
  entryId: string;
  userId: string;
  clockInAt: string;
  clockOutAt: string;
  basis: string;
  timezone?: string | null;
  locationName?: string | null;
  organizationId: string;
}>('attendance_shift_closed_provisionally');

export const attendanceShiftEscalationResolvedEvent = event<{
  entryId: string;
  userId: string;
  userName: string;
  clockOutAt: string;
  timezone?: string | null;
  recordedOffline: boolean;
  leaderIds: string[];
  organizationId: string;
}>('attendance_shift_escalation_resolved');

export const attendanceBreakDueEvent = event<
  {
    entryId: string;
    userId: string;
    ruleId: string;
    name: string;
    durationMinutes: number;
    isPaid: boolean;
    expiresAt?: string | null;
    snoozeCount: number;
    locationName: string;
    organizationId: string;
  } & SentNotRead<'userName' | 'locationId'>
>('attendance_break_due');

export const attendanceBreakOverEvent = event<
  {
    entryId: string;
    userId: string;
    breakId: string;
    name: string;
    durationMinutes: number;
    organizationId: string;
  } & SentNotRead<'userName' | 'locationId' | 'locationName'>
>('attendance_break_over');

/** A planned rest started because the member left the site inside its window (rest-away.service). */
export const attendanceRestStartedEvent = event<{
  entryId: string;
  userId: string;
  organizationId: string;
  restName: string;
  plannedMinutes: number;
  isPaid: boolean;
  startedAt: string;
  locationName: string | null;
}>('attendance_rest_started');

export const autoClockOfferedEvent = event<{
  organizationId: string;
  spaceId: string;
  spaceName: string;
  userIds: string[];
}>('auto_clock_offered');

export const geofenceExcursionOutEvent = event<GeofenceExcursionEvent>('geofence_excursion_out');

export const geofenceExcursionRequestedEvent = event<GeofenceExcursionEvent>('geofence_excursion_requested');

export const geofenceExcursionApprovedEvent = event<GeofenceExcursionEvent>('geofence_excursion_approved');

export const geofenceExcursionRejectedEvent = event<GeofenceExcursionEvent>('geofence_excursion_rejected');

export const geofenceExcursionReturnedEvent = event<GeofenceExcursionEvent>('geofence_excursion_returned');

export const geofenceExcursionExpiredEvent = event<GeofenceExcursionEvent>('geofence_excursion_expired');

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

export const shiftIssueCreatedEvent = event<ShiftIssueCreatedMessage>('shift_issue_created');

export const shiftIssueEventEvent = event<ShiftIssueEventMessage>('shift_issue_event');

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
    /** Set by the office, not asked for (a day's hours): who set it — the push says "changed", not "approved". */
    setBy?: string | null;
  } & TimeOffRequestFacts
>('time_off_decided');
