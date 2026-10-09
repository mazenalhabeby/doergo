import { isAdmin, spacesGranting, type AccessPermissionKey } from '@hbcfield/shared';

/**
 * How far a caller's authority over OTHER people's shifts reaches.
 *
 * The work log and the shift issues each had a private `canManage(req)` reading
 * the flat org columns `canManageUsers || canViewAllTasks` — two copies of a
 * rule about attendance that asked neither attendance permission. Somebody
 * granted "view all tasks" managed everybody's log; a supervisor granted the
 * attendance permissions by a space role counted as nobody.
 *
 * Read from the RESOLVED access now:
 *   - reading somebody's log or issue needs `canViewSpaceAttendance`;
 *   - changing it needs `canReconcileAttendance`;
 * each org-wide (`canManage: true`, no space list) or in the spaces listed;
 * an org-wide `canManageUsers` counts as org-wide for both.
 * `spaceIds: []` means granted nowhere and must match nothing. A member's OWN
 * session and own issues are decided in the service by `callerUserId`, so
 * nobody needs either permission for their own.
 */
export type AttendanceNeed = 'read' | 'write';

export const ATTENDANCE_AUTHORITY_KEY: Record<AttendanceNeed, AccessPermissionKey> = {
  read: 'canViewSpaceAttendance',
  write: 'canReconcileAttendance',
};

export interface AttendanceAuthority {
  /** Held org-wide (or an administrator). */
  canManage: boolean;
  /** Where it is held, when not org-wide. undefined = org-wide. */
  spaceIds: string[] | undefined;
}

export function attendanceAuthority(req: { user?: any }, need: AttendanceNeed): AttendanceAuthority {
  const user = req.user;
  if (!user) return { canManage: false, spaceIds: [] };
  if (isAdmin(user)) return { canManage: true, spaceIds: undefined };
  /*
    Somebody who manages the organization's PEOPLE org-wide (the built-in
    Manager) manages their shift records too — the same bridge the labour-cost
    rule makes. Without it the Manager, who never held the attendance
    permissions by name, could no longer resolve a shift issue or annotate a
    work log after the copies were replaced.
  */
  if (user.access?.org?.canManageUsers === true) return { canManage: true, spaceIds: undefined };
  const granted = spacesGranting(user.access, ATTENDANCE_AUTHORITY_KEY[need]);
  return granted === null ? { canManage: true, spaceIds: undefined } : { canManage: false, spaceIds: granted };
}
