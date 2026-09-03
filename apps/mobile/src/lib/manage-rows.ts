import { holds, holdsOrgWide } from './permissions';

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
 * The tab and the list read the same array, so a member never opens a Manage
 * tab to find nothing in it, and never sees a row that would refuse them. The
 * list used to be shown to ADMIN alone — a Space Manager holding the rota could
 * not reach the schedules, and the whole management surface was invisible to
 * everyone whose authority comes from a space.
 */
export const MANAGE_ROWS = [
  { icon: 'stopwatch', labelKey: 'manage.attendance.label', descKey: 'manage.attendance.desc', route: '/(app)/manage/attendance', color: '#0ea5e9', permission: 'canViewSpaceAttendance', orgWide: false },
  { icon: 'timer', labelKey: 'manage.extraTime.label', descKey: 'manage.extraTime.desc', route: '/(app)/extra-time', color: '#a855f7', permission: 'canApproveOvertime', orgWide: false },
  { icon: 'calendar', labelKey: 'manage.timeOff.label', descKey: 'manage.timeOff.desc', route: '/(app)/manage/time-off-requests', color: '#f59e0b', permission: 'canViewAllTasks', orgWide: true },
  { icon: 'people', labelKey: 'manage.members.label', descKey: 'manage.members.desc', route: '/(app)/manage/members', color: '#8b5cf6', permission: 'canManageUsers', orgWide: true },
  { icon: 'people-circle', labelKey: 'manage.customers.label', descKey: 'manage.customers.desc', route: '/(app)/customers', color: '#2563eb', permission: 'crmViewOwn', orgWide: false },
  { icon: 'person-add', labelKey: 'manage.joinRequests.label', descKey: 'manage.joinRequests.desc', route: '/(app)/manage/join-requests', color: '#f97316', permission: 'canManageUsers', orgWide: true },
  { icon: 'mail', labelKey: 'manage.invitations.label', descKey: 'manage.invitations.desc', route: '/(app)/manage/invitations', color: '#06b6d4', permission: 'canManageUsers', orgWide: true },
  { icon: 'alert-circle', labelKey: 'manage.issues.label', descKey: 'manage.issues.desc', route: 'sheet:issues', color: '#ef4444', permission: 'canViewAllTasks', orgWide: false },
  { icon: 'time', labelKey: 'manage.schedules.label', descKey: 'manage.schedules.desc', route: '/(app)/manage/schedules', color: '#10b981', permission: 'canViewAllTasks', orgWide: true },
] as const;

export type ManageRow = (typeof MANAGE_ROWS)[number];

/*
  Two surfaces a supervisor holds the permission for and had no door to.

  Extra-time approvals live on the CLOCK tab, which an external member does not
  have; shift issues live on the clock card, likewise. Both were therefore
  reachable only by tapping a push notification — the permission was real, the
  route was not. Approving somebody's overtime should not depend on still having
  the notification.
*/

/** The rows this member can actually open. */
export function manageRowsFor(user: Parameters<typeof holds>[0]): ManageRow[] {
  return MANAGE_ROWS.filter((row) =>
    row.orgWide ? holdsOrgWide(user, row.permission) : holds(user, row.permission),
  );
}

/** Is there a Manage tab for this member at all? */
export function hasManageSurface(user: Parameters<typeof holds>[0]): boolean {
  return manageRowsFor(user).length > 0;
}
