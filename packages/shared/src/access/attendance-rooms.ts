import { isAdmin } from '../guards/role-helpers';
import { spacesGranting, type ResolvedAccess } from '../types/permissions';
import { orgFlagFields } from './org-flags';

/**
 * Who may HEAR a member's clock live (clock review A1, 2026-10-25).
 *
 * Clock-ins, clock-outs, rests, "still clocked in", "left early" (with the person's own reason), distance alerts and
 * no-show reminders were emitted to `org:{id}` — a room every staff socket joins, external members included. The API
 * never let those people read such hours; the socket did. They now go to the person and to ATTENDANCE rooms, joined
 * only by a socket whose session may read those hours (`canViewSpaceAttendance`, bridges applied, the API's rule):
 *
 *   attendance:{org}            — org-wide viewers (admins, the org flag)
 *   attendance:{org}:{spaceId}  — viewers of that workspace only
 *
 * An event names its workspace; one with none reaches the org-wide room and the person only (fewer, never more).
 */
export function attendanceRoom(organizationId: string, spaceId?: string | null): string {
  return spaceId ? `attendance:${organizationId}:${spaceId}` : `attendance:${organizationId}`;
}

/** The attendance rooms a socket joins, from its resolved access (none without it, except an admin). */
export function attendanceRoomsFor(
  role: string,
  access: ResolvedAccess | null | undefined,
  organizationId: string,
): string[] {
  if (isAdmin({ role })) return [attendanceRoom(organizationId)];
  if (!access) return [];
  if (orgFlagFields(access).canViewSpaceAttendance) return [attendanceRoom(organizationId)];
  return (spacesGranting(access, 'canViewSpaceAttendance') ?? []).map((id) => attendanceRoom(organizationId, id));
}

/** Where one member's clock event goes: the org-wide viewers, that workspace's viewers, the member. */
export function attendanceEventRooms(
  organizationId: string,
  spaceId: string | null | undefined,
  subjectUserId?: string | null,
): string[] {
  const rooms = [attendanceRoom(organizationId)];
  if (spaceId) rooms.push(attendanceRoom(organizationId, spaceId));
  if (subjectUserId) rooms.push(`user:${subjectUserId}`);
  return rooms;
}
