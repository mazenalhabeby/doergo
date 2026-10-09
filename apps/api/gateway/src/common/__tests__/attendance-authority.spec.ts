import fs from 'fs';
import path from 'path';
import { attendanceAuthority } from '../attendance-authority';
import { AttendanceController } from '../../modules/attendance/attendance.controller';
import { ShiftIssuesController } from '../../modules/shift-issues/shift-issues.controller';

/*
  Somebody ELSE's work log or shift issue: reading needs canViewSpaceAttendance,
  changing needs canReconcileAttendance — from the RESOLVED access, org-wide or
  per space. Both controllers used to read the flat org columns
  `canManageUsers || canViewAllTasks`, each in its own private copy.
*/
const user = (extra: any = {}) => ({ id: 'u-1', role: 'EMPLOYEE', organizationId: 'org-1', access: { org: {}, perSpace: {} }, ...extra });

describe('attendanceAuthority', () => {
  it('reads and writes are different permissions', () => {
    const viewer = { user: user({ access: { org: {}, perSpace: { s1: { canViewSpaceAttendance: true } } } }) };
    expect(attendanceAuthority(viewer, 'read')).toEqual({ canManage: false, spaceIds: ['s1'] });
    expect(attendanceAuthority(viewer, 'write')).toEqual({ canManage: false, spaceIds: [] });
  });

  it('org-wide or an administrator is canManage with no space list', () => {
    expect(attendanceAuthority({ user: user({ access: { org: { canReconcileAttendance: true }, perSpace: {} } }) }, 'write'))
      .toEqual({ canManage: true, spaceIds: undefined });
    expect(attendanceAuthority({ user: user({ role: 'ADMIN' }) }, 'read')).toEqual({ canManage: true, spaceIds: undefined });
  });

  it('the flat columns no longer count — "view all tasks" is not authority over shifts', () => {
    expect(attendanceAuthority({ user: user({ canViewAllTasks: true, canManageUsers: true }) }, 'read'))
      .toEqual({ canManage: false, spaceIds: [] });
  });
});

describe('the controllers forward it', () => {
  const supervisor = {
    user: user({ access: { org: {}, perSpace: { s1: { canViewSpaceAttendance: true, canReconcileAttendance: true }, s2: { canViewSpaceAttendance: true } } } }),
  };

  it('work log: a read carries the viewing spaces, a write the reconciling ones', async () => {
    const svc = { worklogList: jest.fn(), worklogDeleteNote: jest.fn() };
    const c = new AttendanceController(svc as any, {} as any);
    await c.worklogList('e1', supervisor);
    await c.worklogDelete('n1', supervisor);
    expect(svc.worklogList).toHaveBeenCalledWith(expect.objectContaining({ canManage: false, manageSpaceIds: ['s1', 's2'] }));
    expect(svc.worklogDeleteNote).toHaveBeenCalledWith(expect.objectContaining({ canManage: false, manageSpaceIds: ['s1'] }));
  });

  it('shift issues: the same split', async () => {
    const svc = { list: jest.fn(), setStatus: jest.fn() };
    const c = new ShiftIssuesController(svc as any);
    await c.list('OPEN', 'all', supervisor);
    await c.setStatus('i1', { status: 'RESOLVED' } as any, supervisor);
    expect(svc.list).toHaveBeenCalledWith(expect.objectContaining({ canManage: false, ledSpaceIds: ['s1', 's2'] }));
    expect(svc.setStatus).toHaveBeenCalledWith(expect.objectContaining({ canManage: false, ledSpaceIds: ['s1'] }));
  });

  it.each(['attendance/attendance.controller.ts', 'shift-issues/shift-issues.controller.ts'])(
    '%s keeps no private copy of the rule',
    (file) => {
      const src = fs.readFileSync(path.join(__dirname, '../../modules', file), 'utf8');
      expect(src).not.toMatch(/private canManage\(/);
      expect(src).not.toMatch(/canManageUsers\s*\|\|\s*req\.user\?*\.canViewAllTasks/);
    },
  );
});

describe('attendanceAuthority — the org-wide people manager', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { attendanceAuthority: authority } = require('../attendance-authority');
  it('the built-in Manager (canManageUsers org-wide) may resolve issues and annotate logs everywhere', () => {
    const user = { role: 'EMPLOYEE', access: { org: { canManageUsers: true }, perSpace: {} } };
    expect(authority({ user }, 'write')).toEqual({ canManage: true, spaceIds: undefined });
  });
  it('canManageUsers held in ONE space does not bridge', () => {
    const user = { role: 'EMPLOYEE', access: { org: {}, perSpace: { s1: { canManageUsers: true } } } };
    expect(authority({ user }, 'write')).toEqual({ canManage: false, spaceIds: [] });
  });
});
