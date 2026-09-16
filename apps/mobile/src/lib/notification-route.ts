/**
 * Where tapping a notification takes the member.
 *
 * One table, keyed by the `type` the notification service puts in the push.
 * `notification-routes.spec.ts` reads that service and fails when it sends a
 * type this table does not name — a new push that silently lands on Home is
 * exactly the bug this file exists to end.
 *
 * Pure: no router, no React, so every row is tested.
 */

export interface NotificationTarget {
  pathname: string;
  params?: Record<string, string>;
}

export interface NotificationViewer {
  /** Holds the Manage tab's shift-issue row (canViewAllTasks somewhere). */
  managesIssues: boolean;
}

type Data = Record<string, unknown>;
type Resolve = (data: Data, viewer: NotificationViewer) => NotificationTarget | null;

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const to = (pathname: string, params?: Record<string, string | null>): NotificationTarget => {
  const kept = Object.fromEntries(Object.entries(params ?? {}).filter((e): e is [string, string] => e[1] !== null));
  return Object.keys(kept).length ? { pathname, params: kept } : { pathname };
};

const TASK: Resolve = (d) => (str(d.taskId) ? to('/(app)/task/[id]', { id: str(d.taskId) }) : null);
/** The member's own clock: clock out, rests, extra time and the out-of-ring banners live there. */
const CLOCK: Resolve = () => to('/(app)/(tabs)/attendance');
/** A supervisor's view of other people's shifts. */
const TEAM_ATTENDANCE: Resolve = () => to('/(app)/manage/attendance');
/** Somewhere the app already is — Home — said on purpose, with the reason next to it. */
const HOME: Resolve = () => null;

/*
  A document push goes to Documents with the document named. The screen decides
  what opening it means — the signing flow when it still needs this member's
  signature, nothing more when it was signed meanwhile — because it holds the
  document's type and chain, and a push only holds an id.
*/
const DOCUMENT: Resolve = (d) => to('/(app)/documents', { open: str(d.documentId) });

export const NOTIFICATION_ROUTES: Record<string, Resolve> = {
  // Tasks
  task_assigned: TASK,
  task_departure_due: TASK,
  status_change: TASK,
  comment_added: TASK,
  blocked_tasks_reminder: TASK,

  // The member's own shift
  shift_reminder: CLOCK, // "Still clocked in?" — the clock-out button
  break_due: CLOCK,
  break_over: CLOCK,
  overtime_decision: CLOCK,
  noshow_reminder: CLOCK,
  'attendance.geofence_excursion_out': CLOCK,
  'attendance.geofence_excursion_approved': CLOCK,
  'attendance.geofence_excursion_rejected': CLOCK,
  'attendance.geofence_excursion_expired': CLOCK,
  // A shift left open was closed with a temporary time: the Clock screen asks when they left.
  'attendance.clock_out_unconfirmed': CLOCK,

  // Somebody else's shift
  shift_escalation: TEAM_ATTENDANCE,
  noshow_escalation: TEAM_ATTENDANCE,
  noshow_resolved: TEAM_ATTENDANCE,
  shift_escalation_resolved: TEAM_ATTENDANCE,
  attendance_left_early: TEAM_ATTENDANCE,
  pending_approval: TEAM_ATTENDANCE,
  geofence_alert: TEAM_ATTENDANCE,
  overtime_alert: TEAM_ATTENDANCE,
  // The approve / refuse card for an away-from-site request is on the supervisor's Home.
  'attendance.geofence_excursion_requested': HOME,
  overtime_request: () => to('/(app)/extra-time'),

  // Leave
  time_off_request: () => to('/(app)/manage/time-off-requests'),
  time_off_response: () => to('/(app)/(tabs)/time-off'),

  // Conversations
  chat: (d) => to('/(app)/chat', { conversationId: str(d.conversationId) }),
  support: (d) => to('/(app)/support', { ticketId: str(d.ticketId) }),
  shift_issue: (d, viewer) =>
    to(viewer.managesIssues ? '/(app)/(tabs)/manage' : '/(app)/(tabs)/attendance', { issueId: str(d.issueId) }),

  // Documents
  document_issued: DOCUMENT,
  document_awaiting_signature: DOCUMENT,
  document_reviewed: DOCUMENT,
  credential_expiring: DOCUMENT,

  // Equipment. A decision goes to the member who sent the page in; a new proposal
  // goes to reviewers, and reviewing is on the web only.
  asset_proposal: (d) => (d.kind === 'raised' ? null : to('/(app)/my-assets')),
  // An expense to confirm goes to approvers, and the queue they confirm it in is
  // on the web only: no phone screen lists other people's expenses. `/my-assets`
  // would open the approver's OWN holdings — a screen about something else — so
  // the tap stays on Home, where the notice itself already said what and whose.
  'asset.expense_submitted': HOME,
  // What the office decided about something I sent in: my own list shows it.
  'asset.expense_decided': () => to('/(app)/my-assets'),
  // Something was handed to me, or taken back: what I hold now.
  'asset.handed_over': () => to('/(app)/my-assets'),
  // Something on a thing I hold (or look after) is due — its "due soon" line is on What I have.
  asset_log_due: () => to('/(app)/my-assets'),

  // Organization
  join_request_submitted: () => to('/(app)/manage/join-requests'),
  // Sent to somebody still waiting on the onboarding screen, which checks by itself.
  join_request_approved: HOME,
  join_request_rejected: HOME,

  // CRM
  /*
    Straight to the Reminders tab, not to Information.

    The push exists because something is due; landing on the record's first tab
    makes the member hunt for the thing they were just told about, and the
    record now has three tabs to hunt through. The screen reads `tab` on open,
    so the deep link costs one parameter.
  */
  crm_reminder: (d) =>
    str(d.customerId)
      ? to('/(app)/customer/[id]', { id: str(d.customerId), tab: 'reminders' })
      : to('/(app)/customers'),
};

export function notificationTarget(data: Data | null | undefined, viewer: NotificationViewer): NotificationTarget | null {
  if (!data) return null;
  const type = str(data.type);
  // Legacy overtime module: `overtime.<event>` with the request's id.
  if (type?.startsWith('overtime.')) return to('/(app)/overtime/[id]', { id: str(data.overtimeRequestId) ?? 'active' });
  const resolve = type ? NOTIFICATION_ROUTES[type] : undefined;
  if (resolve) return resolve(data, viewer);
  // An unknown type that still names a task: the task is the best guess there is.
  return TASK(data, viewer);
}
