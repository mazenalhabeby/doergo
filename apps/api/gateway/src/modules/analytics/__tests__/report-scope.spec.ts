import { ForbiddenException } from '@nestjs/common';
import { of } from 'rxjs';
import { DENY_EXTERNAL_KEY } from '../../../common/decorators/deny-external.decorator';
import { reportSpaceScope } from '../../../common/guards/report-access.guard';
import { AnalyticsController } from '../analytics.controller';

/*
  The report guard ADMITS anybody holding canViewReports or canViewAllTasks in
  any workspace. What they read must then be narrowed to those workspaces, an
  external member must never reach the organization's figures, and a schedule
  — which runs with no reader — is set up only by an org-wide reader.
*/
const member = (org: Record<string, boolean>, perSpace: Record<string, Record<string, boolean>> = {}, extra: any = {}) =>
  ({ id: 'u-1', role: 'EMPLOYEE', organizationId: 'org-1', access: { org, perSpace }, ...extra });

describe('reportSpaceScope', () => {
  it('admin and org-wide holders are not narrowed', () => {
    expect(reportSpaceScope({ role: 'ADMIN' })).toBeNull();
    expect(reportSpaceScope(member({ canViewReports: true }))).toBeNull();
    expect(reportSpaceScope(member({ canViewAllTasks: true }))).toBeNull();
  });
  it('space grants of either permission merge into one list', () => {
    const u = member({}, { a: { canViewReports: true }, b: { canViewAllTasks: true }, c: { canCreateTasks: true } });
    expect(reportSpaceScope(u)?.sort()).toEqual(['a', 'b']);
  });
  it('granted nowhere is [] — nothing, not everything', () => {
    expect(reportSpaceScope(member({}))).toEqual([]);
  });
});

describe('AnalyticsController', () => {
  it('is closed to external members', () => {
    expect(Reflect.getMetadata(DENY_EXTERNAL_KEY, AnalyticsController)).toBe(true);
  });

  const client = { send: jest.fn(() => of({ ok: true })) };
  const ctrl = new AnalyticsController(client as any);
  const scoped = { user: member({}, { a: { canViewReports: true } }) };
  beforeEach(() => client.send.mockClear());

  it('forwards the reader\'s scope with a run and a timesheet', async () => {
    await ctrl.run({ definition: {} }, scoped);
    expect((client.send.mock.calls[0] as any)[1].scopeSpaceIds).toEqual(['a']);
    await ctrl.timesheet(scoped, 'u-2');
    expect((client.send.mock.calls[1] as any)[1].scopeSpaceIds).toEqual(['a']);
  });

  it('a space-scoped reader cannot create, change or delete a schedule', async () => {
    await expect(ctrl.createSchedule({}, scoped)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(ctrl.updateSchedule('s', {}, scoped)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(ctrl.deleteSchedule('s', scoped)).rejects.toBeInstanceOf(ForbiddenException);
    expect(client.send).not.toHaveBeenCalled();
  });

  it('saved-report edits carry who is asking, for the owner check', async () => {
    await ctrl.deleteSaved('r-1', scoped);
    expect((client.send.mock.calls[0] as any)[1]).toMatchObject({ userId: 'u-1', isAdmin: false });
  });
});
