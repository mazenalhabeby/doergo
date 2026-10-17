import { Role } from '@hbcfield/shared';
import {
  clearsMemberRole,
  flatPermissionFields,
  modulesFor,
  roleChangeFields,
  scheduleFields,
  touchesPrivilege,
} from '../member-profile-fields';

describe('member profile fields', () => {
  it('counts the access profile and the role id as privilege', () => {
    expect(touchesPrivilege({ firstName: 'A' } as any)).toBe(false);
    expect(touchesPrivilege({ enabledModules: {} } as any)).toBe(true);
    expect(touchesPrivilege({ memberRoleId: null } as any)).toBe(true);
  });

  it('a role change defaults every flag from the role', () => {
    const admin: Record<string, unknown> = {};
    roleChangeFields({ role: Role.ADMIN } as any, admin);
    expect(admin).toEqual({
      role: Role.ADMIN,
      canCreateTasks: true,
      taskCreationScope: 'ORG',
      canViewAllTasks: true,
      canAssignTasks: true,
      canManageUsers: true,
    });
    const emp: Record<string, unknown> = {};
    roleChangeFields({ role: Role.EMPLOYEE, canAssignTasks: true } as any, emp);
    expect(emp).toMatchObject({ canCreateTasks: false, taskCreationScope: 'SELF', canAssignTasks: true });
  });

  it('without a role only the flags sent are written', () => {
    const data: Record<string, unknown> = {};
    flatPermissionFields({ canViewAllTasks: false } as any, data);
    expect(data).toEqual({ canViewAllTasks: false });
  });

  it('a birthday is stored at noon UTC', () => {
    const data: Record<string, any> = {};
    scheduleFields({ dateOfBirth: '1990-03-01' } as any, data);
    expect(data.dateOfBirth.toISOString()).toBe('1990-03-01T12:00:00.000Z');
  });

  it('an external member loses clock and time_off; staff keep them', () => {
    expect(modulesFor({ modules: ['clock', 'tasks'] }, true)).toEqual({ modules: ['tasks'] });
    expect(modulesFor(['clock', 'time_off', 'tasks'], true)).toEqual(['tasks']);
    expect(modulesFor(['clock'], false)).toEqual(['clock']);
  });

  it('null or empty clears the org role', () => {
    expect(clearsMemberRole({ memberRoleId: '' } as any)).toBe(true);
    expect(clearsMemberRole({ memberRoleId: 'r' } as any)).toBe(false);
    expect(clearsMemberRole({} as any)).toBe(false);
  });
});
