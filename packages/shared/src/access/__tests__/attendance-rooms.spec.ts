import { attendanceEventRooms, attendanceRoom, attendanceRoomsFor } from '../attendance-rooms';
import type { ResolvedAccess } from '../../types/permissions';

/** Who may hear a member's clock live (clock review A1): never everybody in the organization. */
describe('attendance rooms', () => {
  const access = (org: Record<string, boolean>, perSpace: Record<string, Record<string, boolean>> = {}) =>
    ({ org, perSpace }) as unknown as ResolvedAccess;

  it('an administrator hears the whole organization', () => {
    expect(attendanceRoomsFor('ADMIN', null, 'o1')).toEqual(['attendance:o1']);
  });

  it('an org-wide viewer (or a bridged one) hears the whole organization', () => {
    expect(attendanceRoomsFor('EMPLOYEE', access({ canViewSpaceAttendance: true }), 'o1')).toEqual(['attendance:o1']);
    expect(attendanceRoomsFor('EMPLOYEE', access({ canViewAllTasks: true }), 'o1')).toEqual(['attendance:o1']);
  });

  it('a workspace viewer hears only that workspace', () => {
    const a = access({}, { s1: { canViewSpaceAttendance: true }, s2: { canViewAllTasks: true } });
    expect(attendanceRoomsFor('EMPLOYEE', a, 'o1')).toEqual(['attendance:o1:s1']);
  });

  it('a plain employee, an external observer, or an unknown access hears nothing', () => {
    expect(attendanceRoomsFor('EMPLOYEE', access({ canCreateTasks: true }), 'o1')).toEqual([]);
    const observer = access({}, { s1: { canViewAllTasks: true, canCreateTasks: true } });
    expect(attendanceRoomsFor('EMPLOYEE', observer, 'o1')).toEqual([]);
    expect(attendanceRoomsFor('EMPLOYEE', null, 'o1')).toEqual([]);
  });

  it('an event goes to org-wide viewers, its workspace and the member — never org:{id}', () => {
    expect(attendanceEventRooms('o1', 's1', 'u1')).toEqual(['attendance:o1', 'attendance:o1:s1', 'user:u1']);
    expect(attendanceEventRooms('o1', null, null)).toEqual([attendanceRoom('o1')]);
    expect(attendanceEventRooms('o1', 's1', 'u1')).not.toContain('org:o1');
  });
});
