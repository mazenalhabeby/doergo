"use client"

import { keys } from "@/lib/query-keys"
import type { QueryKey } from "@tanstack/react-query"
import { Events } from "./realtime-event-names"
export { Events } from "./realtime-event-names"

// The /attendance PAGE query keys (Time → tracking / approvals / breaks / no-shows
// / days-off / availability). Distinct from the DASHBOARD keys below — both must
// refresh on a clock or an admin edit, so keep this list as the single source and
// spread it into every attendance-affecting event (DRY).
export const ATTENDANCE_PAGE_KEYS: QueryKey[] = [
  keys.attendance.list(), // main tracking list — ["attendance", loc, status, ...] (prefix match)
  keys.attendance.approvals(),
  keys.attendance.activeBreaks(),
  keys.attendance.breakHistory(),
  keys.attendance.breakSummary(),
  keys.attendance.noShows(),
  keys.attendance.excursions(),
  keys.timeOff.org(),
]

// The DASHBOARD attendance keys (presence tiles + per-location batch + approvals).
export const DASHBOARD_ATTENDANCE_KEYS: QueryKey[] = [
  keys.attendance.active(),
  keys.attendance.locationBatch(),
  keys.attendance.pendingApprovals(),
  keys.attendance.dashboardBreaks(),
  keys.members.directoryLite(),
]

// Everything that must refresh when attendance changes (clock or admin edit).
export const ALL_ATTENDANCE_KEYS: QueryKey[] = [
  // The "on the floor right now" panel on /employees/availability. It reports
  // the clock, so every clock event moves it.
  keys.attendance.floorNow(),...DASHBOARD_ATTENDANCE_KEYS, ...ATTENDANCE_PAGE_KEYS]

// Everywhere a member, an invitation or a join request is rendered. One list, so
// the four server call sites that emit `member.changed` cannot drift from what the
// screens actually read (DRY).
export const MEMBER_KEYS: QueryKey[] = [
  keys.members.lists(),        // every member list — the /members page, the directory, the pickers
  keys.members.details(),      // /members/[id] detail
  keys.people.contacts(),             // chat / contact directory
  keys.people.pendingInvitations(),      // pending invites shown on /members
  keys.people.invitations(),             // /invitations page
  keys.people.joinRequests(),           // /join-requests page
  keys.locations.rosterBatches(), // space rosters, several at once (/members, the dashboard)
  keys.locations.rosters(),    // one space's roster
]

// Query keys that each event should invalidate
export const EVENT_INVALIDATIONS: Record<string, QueryKey[]> = {
  // Task events → invalidate task lists, counts, and related
  // `portalAllRequests` is the office's inbox for customer-portal requests. A
  // request submitted from the portal creates a Task and announces task.created —
  // but only the task lists were invalidated, so the portal inbox stayed stale and
  // an external customer's request sat unseen until someone reloaded (audit P-D1).
  [Events.TASK_CREATED]: [keys.tasks.lists(), keys.tasks.counts(), keys.portal.allRequests()],
  // `task` and `task-time`: the OPEN job too — its checklist, its crew, its time.
  // Only queries in use refetch, so this is the one job on screen, not every job.
  [Events.TASK_UPDATED]: [keys.tasks.lists(), keys.tasks.counts(), keys.portal.allRequests(), keys.tasks.details(), keys.tasks.times()],
  [Events.TASK_ASSIGNED]: [keys.tasks.lists(), keys.tasks.counts()],
  [Events.TASK_STATUS_CHANGED]: [
    keys.tasks.lists(),
    keys.tasks.counts(),
    keys.attendance.active(),
    keys.attendance.locationBatch(),
    keys.portal.allRequests()],
  [Events.TASK_COMMENT_ADDED]: [keys.tasks.lists()],
  [Events.TASK_ATTACHMENT_ADDED]: [keys.tasks.lists()],
  [Events.TASK_DECLINED]: [keys.tasks.lists(), keys.tasks.counts()],
  [Events.TASK_DELETED]: [keys.tasks.lists(), keys.tasks.counts()],
  // The board's "Paused" chips and the job's handover card.
  [Events.TASKS_PAUSED]: [keys.tasks.lists(), keys.tasks.details()],
  [Events.TASK_HANDOVER_ADDED]: [keys.tasks.lists(), keys.tasks.details(), keys.tasks.timelines()],

  // Attendance events → invalidate the REAL dashboard attendance queries so a
  // clock-in/out live-updates the presence labels without a manual refresh.
  // (`attendance-today` was a phantom key that matched no query — the reason
  // the dashboard used to need refreshing.) `locationAttendanceBatch` is a
  // prefix — invalidateQueries matches ["locationAttendanceBatch", locKey, date].
  // Worker clock/break AND admin edits refresh BOTH the dashboard and the
  // attendance page (previously only the dashboard keys were invalidated, so the
  // /attendance tabs needed a manual reload).
  [Events.CLOCK_IN]: ALL_ATTENDANCE_KEYS,
  [Events.CLOCK_OUT]: ALL_ATTENDANCE_KEYS,
  [Events.BREAK_STARTED]: ALL_ATTENDANCE_KEYS,
  [Events.BREAK_ENDED]: ALL_ATTENDANCE_KEYS,
  [Events.ATTENDANCE_CHANGED]: ALL_ATTENDANCE_KEYS,

  // Availability change → refresh the dashboard roster + contacts (their dot updates)
  [Events.PRESENCE_CHANGED]: [keys.members.directoryLite(), keys.people.contacts(), keys.people.team()],

  // Geofence excursion → refresh the approver panel (["geofence-excursions"]).
  // out/reported/returned change the pending list; approved/rejected/expired also
  // touch clock state (reject clocks out) so refresh the dashboard attendance too.
  [Events.EXCURSION_OUT]: [keys.attendance.excursions()],
  [Events.EXCURSION_REQUESTED]: [keys.attendance.excursions()],
  [Events.EXCURSION_APPROVED]: [keys.attendance.excursions()],
  [Events.EXCURSION_REJECTED]: [...ALL_ATTENDANCE_KEYS], // reject clocks the worker out
  [Events.EXCURSION_RETURNED]: [keys.attendance.excursions()],
  [Events.EXCURSION_EXPIRED]: [keys.attendance.excursions()],

  // Member events → refresh everywhere a member appears. Until these existed there
  // were NO member events in this map at all: another admin's edit, removal, invite
  // or revoke stayed invisible until the viewer reloaded, and — because React Query
  // runs with refetchOnWindowFocus:false — even switching tabs did not fix it.
  // (Audit M-D2 / M-D3.) The payload carries ids only; each client re-reads through
  // its own scoped endpoint, so nothing here widens what a viewer can see.
  [Events.MEMBER_CHANGED]: MEMBER_KEYS,

  // A submitted request already reached the notification bell as a toast, but
  // nothing refreshed the list — so an admin sitting on /join-requests was told
  // about a request that never appeared on the page in front of them (audit A-D1).
  [Events.JOIN_REQUEST_SUBMITTED]: [keys.people.joinRequests()],

  // Leave. Every key, always — time off is read on a member's record
  // (`timeOff.member`) and on /attendance and /employees/availability
  // (`timeOff.org`). Invalidating only the one the viewer happens to be looking
  // at is the split `invalidateTimeOff` exists to stop (audit MD-D1), and a
  // socket event has the same duty. (`["availability"]` was listed too — the key
  // of a calendar that no longer exists, matching no query.)
  // `cover-range` and `floor-now` ride along: a decision changes the chart's
  // footer and the live floor as surely as it changes the list, and leaving
  // either behind is how two numbers on one page come to disagree.
  [Events.TIME_OFF_REQUESTED]: [keys.timeOff.member(), keys.timeOff.org(), keys.timeOff.coverRange()],
  [Events.TIME_OFF_DECIDED]: [keys.timeOff.member(), keys.timeOff.org(), keys.timeOff.coverRange(), keys.attendance.floorNow()],

  // The CRM announced nothing at all (audit C-D2): a rep logging an activity was
  // invisible to a co-manager on the same client, and a new client never appeared
  // on another admin's list. Ids only — a rep who cannot reach the client refetches
  // and gets back what they are allowed to see.
  // NOTE: these must be the keys the screens ACTUALLY read. A key that matches
  // nothing is silent, which is the whole failure mode here — so client lists
  // are named by the endpoint they read (`keys.customers.lists()` = every
  // `GET /customers`, whichever workspace, filter or picker asked), never by a
  // hand-picked string like the `["customers"]` that once matched no query.
  //
  // `["my-clients"]` was here until /clients stopped having a list of its own:
  // it now mounts the workspace's Customers tab.
  [Events.CUSTOMER_CHANGED]: [
    keys.customers.lists(),       // every client list: the CRM, workspace tabs, pickers
    keys.customers.details(),     // /customers/[id]
    keys.customers.activities(),
    keys.customers.addresses(),
  ],

  /*
    A document type moved.

    This matters beyond the types screen: the type carries who may SEE documents
    filed under it, so restricting one has to empty those documents out of every
    colleague's register, member file, verification queue and compliance board
    without them reloading — and lifting a restriction has to put them back.

    Ids only, as everywhere else here. Each client refetches through its own
    scoped endpoint, so a viewer who has just LOST access refetches and gets a
    list without those documents; nothing in the payload widens anything.
  */
  [Events.CALENDAR_CHANGED]: [keys.calendar.all(), keys.calendar.event()],
  // A moved Eid or a new weekend changes counts and shading everywhere at once.
  [Events.CALENDAR_SETTINGS_CHANGED]: [
    keys.calendar.all(),
    keys.calendar.settings(),
    keys.calendar.holidays(),
    keys.timeOff.count(),
    keys.timeOff.myBalance(),
    keys.timeOff.coverRange(),
    keys.calendar.team(),
    keys.timeOff.org()],
  [Events.DOCUMENT_TYPES_CHANGED]: [
    keys.documents.types(),                  // the picker on every documents screen
    keys.documents.browse(),                // the folder register
    keys.documents.sent(),                  // the issued list
    keys.documents.drafts(),
    keys.documents.matchCandidates(),
    keys.documents.awaitingVerification(), // the verification queue
    keys.documents.compliance(),
    keys.documents.mine(),
    keys.documents.myRequirements(),
    keys.documents.templates(),              // a template names its type
  ],

  /*
    The organization's things. Before these, an expense a driver sent in sat
    invisible in the office's queue until somebody reloaded, and a handover
    made by one manager left another's custody tab showing the old driver.

    Ids only, to the organization room. Each screen refetches through its own
    scoped endpoint, so somebody who cannot see assets refetches nothing they
    could not already read.
  */
  // An expense sent in, or decided: the queue, the asset's money tab, and the
  // per-period totals on both custody tabs (only RECORDED counts there).
  [Events.ASSET_EXPENSES_CHANGED]: [
    keys.assets.expensesPending(),
    keys.assets.money(),
    keys.assets.custody(),
    keys.memberRecord.custody(),
  ],
  // A handover: who holds it on the record, on its timeline, in the kind's list
  // and on the member's holdings tab.
  [Events.ASSET_CUSTODY_CHANGED]: [
    keys.assets.record(),
    keys.assets.custody(),
    keys.assets.records(),
    keys.memberRecord.custody(),
  ],

  // The no-show and shift-reminder engine writes to the entries the attendance
  // board renders — a flagged no-show, an escalation, a reminder that moves
  // `reminderState`. All four were emitted and nothing on the web listened, so the
  // board only caught up on the next manual reload (audit AT-D1).
  [Events.NOSHOW_REMINDER]: [keys.attendance.noShows()],
  [Events.NOSHOW_ESCALATION]: [keys.attendance.noShows()],
  [Events.NOSHOW_RESOLVED]: ALL_ATTENDANCE_KEYS,
  [Events.SHIFT_ESCALATION_RESOLVED]: ALL_ATTENDANCE_KEYS,
  [Events.SHIFT_REMINDER]: ALL_ATTENDANCE_KEYS,
  [Events.SHIFT_ESCALATION]: ALL_ATTENDANCE_KEYS,

  // Space events → refresh the space lists and rosters. Until these existed, a
  // space created/renamed/archived by someone else — or a roster edited by
  // another admin — stayed invisible until the viewer reloaded the page. The
  // payload carries ids only; each client re-reads through its own scoped
  // endpoint, so nothing here widens what a viewer can see.
  [Events.SPACE_CHANGED]: [keys.locations.lists(), keys.locations.details(), keys.locations.rosterBatches()],
  [Events.SPACE_ROSTER_CHANGED]: [keys.locations.rosterBatches(), keys.locations.rosters(), keys.spaceMembers.all()],

  // Location events → the task's route map. `["workerLocations"]` matched NO query
  // in the app — a phantom key, so a GPS update refreshed nothing and a dispatcher
  // watching a route saw it frozen. The real key is keys.tasks.route(taskId); this
  // was found by the guard test in hooks/__tests__/realtime-keys.spec.ts.
  [Events.WORKER_LOCATION]: [keys.tasks.routes()],

}

/*
  The approvals inbox reads every kind's own list, so it goes stale on exactly
  the events that add or settle one of them. NOT on task.updated or a clock-in:
  the inbox is a fan-out read, and those fire all day.
*/
export const APPROVAL_EVENTS: string[] = [
  Events.TASK_CREATED, // a portal request arrives as a task
  Events.CLOCK_OUT, Events.ATTENDANCE_CHANGED,
  Events.EXCURSION_REQUESTED, Events.EXCURSION_APPROVED, Events.EXCURSION_REJECTED,
  Events.EXCURSION_RETURNED, Events.EXCURSION_EXPIRED,
  Events.JOIN_REQUEST_SUBMITTED, Events.MEMBER_CHANGED,
  Events.TIME_OFF_REQUESTED, Events.TIME_OFF_DECIDED,
  Events.ASSET_EXPENSES_CHANGED,
  Events.NOSHOW_ESCALATION, Events.NOSHOW_RESOLVED,
]
