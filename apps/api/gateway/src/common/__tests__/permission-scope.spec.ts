import { scopeFor } from '../permission-scope';

/**
 * scopeFor is THE narrowing rule (common/permission-scope.ts). The case that
 * broke: a member whose permission is a BRIDGE (org-wide canManageUsers →
 * canApproveAttendance) passed the guard and was then narrowed to nothing.
 */
describe('scopeFor', () => {
  const access = (org: Record<string, boolean>, perSpace: Record<string, Record<string, boolean>> = {}) => ({ org, perSpace });

  it('an administrator is never narrowed', () => {
    expect(scopeFor({ role: 'ADMIN', access: access({}) }, 'canApproveAttendance')).toBeNull();
  });

  it('a bridged org flag is org-wide, not an empty list', () => {
    const user = { role: 'EMPLOYEE', canApproveAttendance: true, access: access({ canManageUsers: true }) };
    expect(scopeFor(user, 'canApproveAttendance')).toBeNull();
  });

  it('a space grant narrows to exactly those spaces', () => {
    const user = { role: 'EMPLOYEE', access: access({}, { A: { canApproveAttendance: true }, B: { canViewAllTasks: true } }) };
    expect(scopeFor(user, 'canApproveAttendance')).toEqual(['A']);
  });

  it('granted nowhere is an empty list (matches nothing), never null', () => {
    expect(scopeFor({ role: 'EMPLOYEE', access: access({}) }, 'canDeleteAttendance')).toEqual([]);
    expect(scopeFor(undefined, 'canDeleteAttendance')).toEqual([]);
  });

  it('a flat flag set to anything but true does not widen', () => {
    expect(scopeFor({ role: 'EMPLOYEE', canApproveAttendance: 'true', access: access({}) }, 'canApproveAttendance')).toEqual([]);
  });
});
