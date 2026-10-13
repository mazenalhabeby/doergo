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

interface NotificationViewer {
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

/** The calendar, with the event opened (its sheet answers, snoozes, joins). */
const CALENDAR: Resolve = (d) => to('/(app)/(tabs)/calendar', { event: str(d.eventId) });

export const NOTIFICATION_ROUTES: Record<string, Resolve> = {
  // Calendar (shared calendar/*): an invitation, a moved or canceled event, an answer, a reminder.
  calendar_invite: CALENDAR,
  calendar_canceled: CALENDAR,
  calendar_answer: CALENDAR,
  calendar_reminder: CALENDAR,
  // "A new version is ready" opens the full-page update (the layout handles it before routing); no screen.
  app_update: () => null,

  // Tasks
  task_assigned: TASK,
  task_departure_due: TASK,
  // A task open to a work role (shared tasks/role-pool.ts): the job page shows Take it.
  task_role_offer: TASK,
  task_role_taken: TASK,
  task_role_unclaimed: TASK,
  status_change: TASK,
  comment_added: TASK,
  blocked_tasks_reminder: TASK,
  task_handover: TASK,
  task_started_for_you: TASK,
  // A crew on one job: "Tobias started — are you with him?", the lead handed to you,
  // a crew member stopped, the leader off today — each opens the job.
  task_crew_started: TASK,
  task_lead_changed: TASK,
  task_lead_needed: TASK,
  task_crew_issue: TASK,
  task_crew_refused: TASK, // a crew action this phone queued was refused — its job shows why // "Anna started a job for you" // "Handover from Mike" — the job, with the note on top

  // The member's own shift
  shift_reminder: CLOCK, // "Still clocked in?" — the clock-out button
  break_due: CLOCK,
  break_over: CLOCK,
  overtime_decision: CLOCK,
  // An office rule's second approval: the inbox, where the item says who went first.
  approval_second_step: () => to('/(app)/approvals'),
  // Nobody answered: a reminder, or it was passed to them.
  approval_reminder: () => to('/(app)/approvals'),
  noshow_reminder: CLOCK,
  'attendance.geofence_excursion_out': CLOCK,
  'attendance.geofence_excursion_approved': CLOCK,
  'attendance.geofence_excursion_rejected': CLOCK,
  'attendance.geofence_excursion_expired': CLOCK,
  // A shift left open was closed with a temporary time: the Clock screen asks when they left.
  'attendance.clock_out_unconfirmed': CLOCK,
  // The automatic clock's own local notifications (services/auto-clock): clocked in, the rest, "still here?".
  'attendance.auto_clock': CLOCK,
  // A workspace chose them for the automatic clock: the Time screen, where the switch now is.
  'attendance.auto_clock_offered': CLOCK,

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
  /*
    ⚠️ THE FULL PATH, INCLUDING `(tabs)` — like `CLOCK` above, and unlike what
    this row used to say.

    Chat moved into the tab group and this row was left pointing at
    `/(app)/chat`, with a `<Redirect>` parked at the old path to cover it. But
    `(tabs)` is a GROUP, so `(app)/chat.tsx` and `(app)/(tabs)/chat.tsx` both
    resolve to `/chat` — two files claiming one route. Expo Router picked the
    redirect, which redirected to itself, and `/chat` rendered a permanently
    blank white screen. Every chat push landed there.

    The redirect was never needed in the first place: this table is PURE and is
    evaluated when the member TAPS, so a notification delivered last month gets
    today's path. Nothing is baked into the push.
  */
  chat: (d) => to('/(app)/(tabs)/chat', { conversationId: str(d.conversationId) }),
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

/**
 * "I'm with him" on a crew push: the job it is about. The JOIN itself is not in
 * the target — a route is a URL, and a URL must never act. The caller arms it
 * in memory (`armCrewJoin`) and the job page takes it once.
 */
export function crewJoinTarget(data: Data | null | undefined): NotificationTarget | null {
  const id = data ? str(data.taskId) : null;
  return id ? to('/(app)/task/[id]', { id }) : null;
}
