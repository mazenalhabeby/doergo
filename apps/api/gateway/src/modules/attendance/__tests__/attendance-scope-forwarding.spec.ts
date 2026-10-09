/**
 * The gateway half of three narrowings: the guard only WIDENS (a grant in any
 * workspace passes it), so a scope that is not forwarded to the service is the
 * whole organization. Each of these routes forwarded nothing before.
 *
 *   PATCH/POST/DELETE /attendance/break-rules       → canManageWorkspaces scope
 *   GET  /attendance/locations/:id/entries          → canViewSpaceAttendance scope
 *   GET  /attendance/entries/:id/breaks             → requester + canViewSpaceAttendance scope
 */
import 'reflect-metadata';
import { AttendanceController } from '../attendance.controller';

function controller() {
  const service = {
    createBreakRule: jest.fn().mockResolvedValue({}),
    updateBreakRule: jest.fn().mockResolvedValue({}),
    deleteBreakRule: jest.fn().mockResolvedValue({}),
    getLocationEntries: jest.fn().mockResolvedValue({}),
    getLocationEntriesBatch: jest.fn().mockResolvedValue({}),
    getBreaksForEntry: jest.fn().mockResolvedValue({}),
  };
  const ctrl = new AttendanceController(service as any, {} as any) as any;
  return { ctrl, service };
}

const admin = { id: 'admin', role: 'ADMIN', organizationId: 'org-1', access: { org: {}, perSpace: {} } };
const siteLead = {
  id: 'lead', role: 'EMPLOYEE', organizationId: 'org-1',
  access: {
    org: {},
    perSpace: {
      'space-a': { canManageWorkspaces: true, canViewSpaceAttendance: true },
      // On the roster of B, with no attendance permission there.
      'space-b': { canViewAllTasks: true },
    },
  },
};

describe('break-rule writes forward the workspaces the caller manages', () => {
  it.each([
    ['create', (c: any, req: any) => c.createBreakRule({ spaceId: 'space-b' }, req), 'createBreakRule'],
    ['update', (c: any, req: any) => c.updateBreakRule('r1', {}, req), 'updateBreakRule'],
    ['delete', (c: any, req: any) => c.deleteBreakRule('r1', req), 'deleteBreakRule'],
  ])('%s', async (_l, run, method) => {
    const { ctrl, service } = controller();
    await run(ctrl, { user: siteLead });
    expect((service as any)[method].mock.calls[0][0].scopeSpaceIds).toEqual(['space-a']);
    await run(ctrl, { user: admin });
    expect((service as any)[method].mock.calls[1][0].scopeSpaceIds).toBeNull();
  });
});

describe('a workspace\'s entries: the attendance permission, not the roster', () => {
  it('forwards where the caller may read attendance, and no "view all tasks" flag', async () => {
    const { ctrl, service } = controller();
    await ctrl.getLocationEntries('space-b', undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, { user: { ...siteLead, canViewAllTasks: true } });
    const sent = service.getLocationEntries.mock.calls[0][0];
    expect(sent.viewScopeSpaceIds).toEqual(['space-a']);
    expect(sent).not.toHaveProperty('requesterCanViewAll');
  });
});

describe('the dashboard batch of entries: same rule as one workspace', () => {
  it('forwards the attendance scope, never the "view all tasks" flag', async () => {
    const { ctrl, service } = controller();
    await ctrl.getLocationEntriesBatch('space-a,space-b', undefined, { user: { ...siteLead, canViewAllTasks: true } });
    const sent = service.getLocationEntriesBatch.mock.calls[0][0];
    expect(sent.viewScopeSpaceIds).toEqual(['space-a']);
    expect(sent).not.toHaveProperty('requesterCanViewAll');
  });
  it('an admin is org-wide', async () => {
    const { ctrl, service } = controller();
    await ctrl.getLocationEntriesBatch('space-a', undefined, { user: admin });
    expect(service.getLocationEntriesBatch.mock.calls[0][0].viewScopeSpaceIds).toBeNull();
  });
});

describe('an entry\'s breaks', () => {
  it('names the requester and their attendance scope', async () => {
    const { ctrl, service } = controller();
    await ctrl.getBreaksForEntry('e1', { user: siteLead });
    expect(service.getBreaksForEntry).toHaveBeenCalledWith({
      timeEntryId: 'e1', organizationId: 'org-1', requesterId: 'lead', scopeSpaceIds: ['space-a'],
    });
  });
});
