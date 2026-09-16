import { moduleAnywhere } from '@hbcfield/shared/client';
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
  { icon: 'stopwatch', labelKey: 'manage.attendance.label', descKey: 'manage.attendance.desc', route: '/(app)/manage/attendance', color: '#0ea5e9', permission: 'canViewSpaceAttendance', orgWide: false },
  { icon: 'timer', labelKey: 'manage.extraTime.label', descKey: 'manage.extraTime.desc', route: '/(app)/extra-time', color: '#a855f7', permission: 'canApproveOvertime', orgWide: false },
  { icon: 'calendar', labelKey: 'manage.timeOff.label', descKey: 'manage.timeOff.desc', route: '/(app)/manage/time-off-requests', color: '#f59e0b', permission: 'canViewAllTasks', orgWide: false },
  { icon: 'people', labelKey: 'manage.members.label', descKey: 'manage.members.desc', route: '/(app)/manage/members', color: '#8b5cf6', permission: 'canManageUsers', orgWide: true },
  /*
    Clients. `crmViewOwn` alone was the whole gate, so an organization that has
    never switched CRM on anywhere still carried the row — and the screen behind
    it can only say "no clients", which reads as a broken list rather than as a
    feature nobody bought. See `moduleAnywhere` in shared for why the question is
    "is it running in a workspace I can see" and not "has the org got it".
  */
  { icon: 'people-circle', labelKey: 'manage.customers.label', descKey: 'manage.customers.desc', route: '/(app)/customers', color: '#2563eb', permission: 'crmViewOwn', orgWide: false, module: 'crm' },
  { icon: 'person-add', labelKey: 'manage.joinRequests.label', descKey: 'manage.joinRequests.desc', route: '/(app)/manage/join-requests', color: '#f97316', permission: 'canManageUsers', orgWide: true },
  { icon: 'mail', labelKey: 'manage.invitations.label', descKey: 'manage.invitations.desc', route: '/(app)/manage/invitations', color: '#06b6d4', permission: 'canManageUsers', orgWide: true },
  { icon: 'alert-circle', labelKey: 'manage.issues.label', descKey: 'manage.issues.desc', route: 'sheet:issues', color: '#ef4444', permission: 'canViewAllTasks', orgWide: false },
  { icon: 'time', labelKey: 'manage.schedules.label', descKey: 'manage.schedules.desc', route: '/(app)/manage/schedules', color: '#10b981', permission: 'canViewAllTasks', orgWide: true },
  /*
    Photograph a rental agreement at the desk and the van is on the books before
    you are out of the car park — created, handed over, and the one it replaces
    retired.

    `canManageAssets`, held org-wide OR in a space, matching the endpoint:
    `POST /assets/contracts/apply` is `@RequirePermissionInSpace` and narrows
    each kind to the workspaces the grant covers. It used to be org-wide only,
    which refused a Space Manager the one flow built for their depot's desk —
    the screen itself then offers only the kinds of their own workspaces.
  */
  { icon: 'document-attach', labelKey: 'manage.contract.label', descKey: 'manage.contract.desc', route: '/(app)/asset-contract', color: '#0f766e', permission: 'canManageAssets', orgWide: false },
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

/**
 * The session fields a row can be decided from: whatever `holds` reads, plus
 * the two module lists the server resolves with the session.
 *
 * Declared here rather than on the mobile `User` interface because this is the
 * only thing that asks — and because `manageRowsFor` is called with `user || {}`
 * at one site, which a required field would break.
 */
type ManageSubject =
  | (NonNullable<Parameters<typeof holds>[0]> & {
      /** The union of enabled modules across the workspaces this member can see. */
      spaceModules?: string[] | null;
      /** The organization's own list — the fallback, and never the first answer. */
      orgModules?: string[] | null;
    })
  /*
    ⚠️ The nullable arms are part of the type, not an oversight. `holds` accepts
    null and undefined because a screen asks this while the session is still
    loading; intersecting the extra fields onto `Parameters<typeof holds>[0]`
    silently drops them and breaks both call sites.
  */
  | null
  | undefined;

/**
 * Whether a module runs in a workspace this member can see.
 *
 * ⚠️ Not "has the organization got it" — a module is bought per space, so the
 * org-wide list answers a different question and is wrong in both directions.
 * The rule and every caveat behind it (absent ≠ empty, most of all) live once
 * in `moduleAnywhere` in shared, because the web navbar asks the same question
 * and the two clients must not answer it differently — that is how a member
 * comes to see Clients on the web and not on the phone.
 */

/** The rows this member can actually open. */
export function manageRowsFor(user: ManageSubject): ManageRow[] {
  return MANAGE_ROWS.filter((row) => {
    const allowed = row.orgWide ? holdsOrgWide(user, row.permission) : holds(user, row.permission);
    if (!allowed) return false;
    // Rows naming no module are not gated on one — most of Manage is the
    // organization itself (members, invitations, the rota), which is never
    // bought or unbought.
    const module = 'module' in row ? (row.module as string) : undefined;
    return module === undefined || moduleAnywhere(user, module);
  });
}

/** Is there a Manage tab for this member at all? */
export function hasManageSurface(user: ManageSubject): boolean {
  return manageRowsFor(user).length > 0;
}
