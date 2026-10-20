/** The one `keys` object every query uses, and the invalidation helpers that read it. */
import type { QueryClient } from '@tanstack/react-query';
import {
  approvalsKeys,
  attendanceKeys,
  calendarKeys,
  chatKeys,
  documentsKeys,
  employeesKeys,
  memberRecordKeys,
  overtimeKeys,
  ratesKeys,
  schedulesKeys,
  shiftIssuesKeys,
  supportKeys,
  timeOffKeys,
} from './people';
import {
  assetsKeys,
  billingKeys,
  companiesKeys,
  meKeys,
  notificationsKeys,
  peopleKeys,
  portalKeys,
  reportsKeys,
  searchKeys,
  sharedSpacesKeys,
  spacesKeys,
  taskExtrasKeys,
} from './things';
import {
  customFieldsKeys,
  customersKeys,
  epicsKeys,
  invoicesKeys,
  locationsKeys,
  membersKeys,
  organizationKeys,
  phasesKeys,
  recurringTasksKeys,
  spaceMembersKeys,
  sprintsKeys,
  tasksKeys,
  workflowsKeys,
} from './work';

export const keys = {
  tasks: tasksKeys,
  members: membersKeys,
  locations: locationsKeys,
  spaceMembers: spaceMembersKeys,
  sprints: sprintsKeys,
  epics: epicsKeys,
  phases: phasesKeys,
  recurringTasks: recurringTasksKeys,
  customFields: customFieldsKeys,
  workflows: workflowsKeys,
  invoices: invoicesKeys,
  organization: organizationKeys,
  customers: customersKeys,
  attendance: attendanceKeys,
  overtime: overtimeKeys,
  timeOff: timeOffKeys,
  schedules: schedulesKeys,
  shiftIssues: shiftIssuesKeys,
  approvals: approvalsKeys,
  memberRecord: memberRecordKeys,
  employees: employeesKeys,
  documents: documentsKeys,
  chat: chatKeys,
  support: supportKeys,
  calendar: calendarKeys,
  rates: ratesKeys,
  assets: assetsKeys,
  spaces: spacesKeys,
  sharedSpaces: sharedSpacesKeys,
  portal: portalKeys,
  people: peopleKeys,
  taskExtras: taskExtrasKeys,
  reports: reportsKeys,
  companies: companiesKeys,
  me: meKeys,
  search: searchKeys,
  notifications: notificationsKeys,
  billing: billingKeys,
} as const

/**
 * Query keys that describe the SAME data from different angles.
 *
 * Time off is read under several keys — `timeOff.member` on a member's record,
 * `timeOff.org` on /attendance and /schedule, and the cover chart
 * and live floor on /schedule, which the server computes from
 * schedule + time-off. Each screen invalidated only its own, so approving a day
 * off in one place left the others showing it as still pending (audit MD-D1).
 * Schedules had the same split against the cover chart (MD-D2).
 *
 * Both helpers used to invalidate `["availability"]`, the key of a calendar that
 * no longer exists — it matched no query, so the cover chart was never told.
 *
 * These helpers exist so a caller does not have to know which other screens read
 * the thing they just changed — that knowledge lives here, once.
 */

/** Everything that renders time-off records. */
export function invalidateTimeOff(qc: QueryClient, memberId?: string): void {
  qc.invalidateQueries({ queryKey: timeOffKeys.member() })
  qc.invalidateQueries({ queryKey: timeOffKeys.org() })
  qc.invalidateQueries({ queryKey: timeOffKeys.coverRange() })
  if (memberId) qc.invalidateQueries({ queryKey: timeOffKeys.member(memberId) })
}

/**
 * Everything that renders a working week. The cover chart derives from the
 * schedule, so it is stale the moment one is saved.
 */
export function invalidateSchedule(qc: QueryClient, memberId?: string): void {
  qc.invalidateQueries({ queryKey: memberId ? schedulesKeys.member(memberId) : schedulesKeys.member() })
  qc.invalidateQueries({ queryKey: timeOffKeys.coverRange() })
}

/**
 * Every task list and the status/workspace counts beside them — what changes
 * when a task is created, assigned, moved or removed. Everything refetches even
 * when not on screen (`refetchType: "all"`), so the next page opened is already
 * right. One rule instead of the same two lines in eight hooks (audit 2026-10-16).
 */
export function invalidateTaskLists(qc: QueryClient): Promise<unknown> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: tasksKeys.lists(), refetchType: "all" }),
    qc.invalidateQueries({ queryKey: tasksKeys.counts(), refetchType: "all" }),
  ])
}

/**
 * One task and every list it appears in; `also` adds the reads that only some
 * changes touch (its history, its worked time, the counts).
 */
export function invalidateTask(
  qc: QueryClient,
  id: string,
  also: { timeline?: boolean; time?: boolean; counts?: boolean } = {},
): Promise<unknown> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: tasksKeys.detail(id), refetchType: "all" }),
    qc.invalidateQueries({ queryKey: tasksKeys.lists(), refetchType: "all" }),
    also.counts ? qc.invalidateQueries({ queryKey: tasksKeys.counts(), refetchType: "all" }) : null,
    also.timeline ? qc.invalidateQueries({ queryKey: tasksKeys.timeline(id), refetchType: "all" }) : null,
    also.time ? qc.invalidateQueries({ queryKey: tasksKeys.time(id), refetchType: "all" }) : null,
  ])
}
