/** MANAGE_ROWS from manage-row.ts — moved here unchanged (2026-10-17 line-length split). */

/**
 * What Manage offers, and to whom.
 *
 * Each row names the permission its screens actually need, and `orgWide` says
 * whether a grant held in ONE space is enough — because the endpoint behind it
 * decides that, not this file. Members, invitations and join requests are
 * `@RequirePermission`: org-wide columns, refused to a space role however
 * senior. Attendance is `@RequirePermissionInSpace`: the same request answers
 * with one site for its supervisor and the whole company for an admin.
 *
 * A row may also name a `module`. A permission says who may look; a module says
 * whether the organization bought the thing at all, and the two are different
 * questions — a member can legitimately hold `crmViewOwn` in an organization
 * that runs no CRM anywhere, and the row then led to a screen that could only
 * ever be empty.
 *
 * The tab and the list read the same array, so a member never opens a Manage
 * tab to find nothing in it, and never sees a row that would refuse them. The
 * list used to be shown to ADMIN alone — a Space Manager holding the rota could
 * not reach the schedules, and the whole management surface was invisible to
 * everyone whose authority comes from a space.
 */
export const MANAGE_ROWS = [
  /*
    Approvals first: everything below that waits for a decision, in one list
    (packages/shared/src/approvals). Offered to whoever can decide ONE kind,
    asked the way that kind's route asks it — the server lists only those.
  */
  {
    icon: 'file-tray-full',
    labelKey: 'manage.approvals.label',
    descKey: 'manage.approvals.desc',
    route: '/(app)/approvals',
    color: '#dc2626',
    permission: '',
    orgWide: false,
    gate: { decides: true },
  },
  {
    icon: 'stopwatch',
    labelKey: 'manage.attendance.label',
    descKey: 'manage.attendance.desc',
    route: '/(app)/manage/attendance',
    color: '#0ea5e9',
    permission: 'canViewSpaceAttendance',
    orgWide: false,
  },
  // No "Requests" row: waiting requests are in Approvals; the team's record opens from the calendar ("who is off").
  {
    icon: 'people',
    labelKey: 'manage.members.label',
    descKey: 'manage.members.desc',
    route: '/(app)/manage/members',
    color: '#8b5cf6',
    permission: 'canManageUsers',
    orgWide: true,
  },
  /*
    Clients. `crmViewOwn` alone was the whole gate, so an organization that has
    never switched CRM on anywhere still carried the row — and the screen behind
    it can only say "no clients", which reads as a broken list rather than as a
    feature nobody bought. See `moduleAnywhere` in shared for why the question is
    "is it running in a workspace I can see" and not "has the org got it".
  */
  /*
    ⚠️ Decided by the CRM REACH, not by `crmViewOwn` and not by "internal".
    `holds('crmViewOwn')` missed a member granted `crmViewAll` alone in one
    workspace, and `internal` hid the book from an external member the office
    deliberately gave "view clients" in their workspace — the server serves
    them that workspace's clients (`crmReachOf`), so the phone offers them.
  */
  {
    icon: 'people-circle',
    labelKey: 'manage.customers.label',
    descKey: 'manage.customers.desc',
    route: '/(app)/customers',
    color: '#2563eb',
    permission: '',
    orgWide: false,
    module: 'crm',
    gate: { crmCap: 'canAccess' },
  },
  /*
    A workspace's equipment and its client requests — for whoever holds the
    permission there, staff or external alike (the server narrows to those
    workspaces and 404s the rest). Not `internal`: running a client's site is
    exactly what an external member may be given. Custody ("What I have",
    Log expense) stays staff-only above.
  */
  {
    icon: 'construct',
    labelKey: 'manage.equipment.label',
    descKey: 'manage.equipment.desc',
    route: '/(app)/equipment',
    color: '#0f766e',
    permission: 'canViewAssets',
    orgWide: false,
    module: 'assets',
  },
  {
    icon: 'chatbox-ellipses',
    labelKey: 'manage.clientRequests.label',
    descKey: 'manage.clientRequests.desc',
    route: '/(app)/client-requests',
    color: '#b45309',
    permission: 'canViewPortal',
    orgWide: false,
    module: 'b2c_portal',
  },
  {
    icon: 'mail',
    labelKey: 'manage.invitations.label',
    descKey: 'manage.invitations.desc',
    route: '/(app)/manage/invitations',
    color: '#06b6d4',
    permission: 'canManageUsers',
    orgWide: true,
  },
  {
    icon: 'alert-circle',
    labelKey: 'manage.issues.label',
    descKey: 'manage.issues.desc',
    route: 'sheet:issues',
    color: '#ef4444',
    permission: 'canViewAllTasks',
    orgWide: false,
  },
  /*
    Schedules shows who works when — a staffing fact, read on the leader
    permission (`canViewSpaceAttendance`, in a space) like cover and the live
    floor, not on `canViewAllTasks`, which the €2 observer holds.
  */
  {
    icon: 'time',
    labelKey: 'manage.schedules.label',
    descKey: 'manage.schedules.desc',
    route: '/(app)/manage/schedules',
    color: '#10b981',
    permission: 'canViewSpaceAttendance',
    orgWide: false,
  },
] as const;
