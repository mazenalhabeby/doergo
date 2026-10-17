import { ValidationPipe } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { Role, presentSections, type TaskReport } from '@hbcfield/shared';
import { TaskReportController } from '../task-report.controller';
import { TaskReportQueryDto } from '../dto';

import { fakeReq, fakeUser } from '../../../common/testing/fake-request';
/**
 * GET /tasks/:id/full-report — the gateway's half of the job report.
 *
 *   • `?copy=` is office or client; anything else is a 400 before any service is asked;
 *   • the caller travels WITHOUT a cross-org share (a guest reads the job, not its report);
 *   • the ROUTE appears only for the office copy, in a workspace that tracks, to a
 *     reader who may see where people are — and a failing tracking-service just
 *     leaves it out.
 */
describe('TaskReportController', () => {
  const report = (over: Partial<TaskReport> = {}): TaskReport => {
    const r = {
      meta: { copy: 'office', generatedAt: 'now', sections: [], historyTruncated: false },
      header: {
        workspace: { id: 'space-1', name: 'North', address: null, timezone: 'Europe/Vienna' },
        site: { address: null, lat: 48, lng: 14 },
      } as any,
      request: {} as any,
      history: [],
      route: null,
      ...over,
    } as TaskReport;
    // As over the wire: an absent section is no key at all.
    if (r.route === undefined) delete r.route;
    r.meta.sections = presentSections(r);
    return r;
  };
  const tracked = {
    success: true,
    data: {
      distance: 1500,
      duration: 300,
      startTime: '2026-10-09T08:00:00Z',
      endTime: '2026-10-09T08:05:00Z',
      points: [{ lat: 48, lng: 14, timestamp: '2026-10-09T08:05:00Z' }],
    },
  };

  let tasks: { fullReport: jest.Mock };
  let tracking: { send: jest.Mock };
  let controller: TaskReportController;

  const admin = {
    id: 'boss',
    role: Role.ADMIN,
    organizationId: 'org-1',
    access: { org: {}, perSpace: {}, sharedSpaces: [{ spaceId: 'shared-1' }] },
  };
  const member = (perSpace: Record<string, Record<string, boolean>> = {}) => ({
    id: 'anna',
    role: Role.EMPLOYEE,
    organizationId: 'org-1',
    canViewAllTasks: true,
    access: { org: {}, perSpace, sharedSpaces: [] },
  });
  const call = (user: any, copy?: 'office' | 'client') =>
    controller
      .fullReport('t-1', copy ? { copy } : {}, fakeReq({ user, method: 'GET' }))
      .then((r: any) => r.data as TaskReport);

  beforeEach(() => {
    tasks = {
      fullReport: jest
        .fn()
        .mockImplementation(({ copy }) =>
          Promise.resolve({
            success: true,
            data: report(copy === 'client' ? { meta: { copy: 'client' } as any, route: undefined } : {}),
          }),
        ),
    };
    tracking = { send: jest.fn().mockReturnValue(of(tracked)) };
    controller = new TaskReportController(tasks as never, tracking as never);
  });

  describe('the copy parameter', () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
    it.each(['office', 'client', undefined])('accepts %s', async (copy) => {
      await expect(
        pipe.transform(copy ? { copy } : {}, { type: 'query', metatype: TaskReportQueryDto }),
      ).resolves.toBeDefined();
    });
    it.each(['CLIENT', 'everything', ''])('refuses %p', async (copy) => {
      await expect(pipe.transform({ copy }, { type: 'query', metatype: TaskReportQueryDto })).rejects.toBeDefined();
    });
    it('accepts an issuer id, and refuses one that is not a short string', async () => {
      const ok = await pipe.transform({ issuer: 'le-123' }, { type: 'query', metatype: TaskReportQueryDto });
      expect(ok.issuer).toBe('le-123');
      await expect(
        pipe.transform({ issuer: 'x'.repeat(41) }, { type: 'query', metatype: TaskReportQueryDto }),
      ).rejects.toBeDefined();
      await expect(
        pipe.transform({ issuer: ['a', 'b'] }, { type: 'query', metatype: TaskReportQueryDto }),
      ).rejects.toBeDefined();
    });
    it('refuses a stray parameter', async () => {
      await expect(
        pipe.transform({ copy: 'office', sharedSpaceIds: 'x' }, { type: 'query', metatype: TaskReportQueryDto }),
      ).rejects.toBeDefined();
    });
  });

  it('forwards the caller without any cross-org share, and the copy', async () => {
    await call(admin, 'client');
    const sent = tasks.fullReport.mock.calls[0][0];
    expect(sent).toMatchObject({ id: 't-1', copy: 'client', userId: 'boss', organizationId: 'org-1' });
    expect(sent.sharedSpaceIds).toEqual([]);
  });

  it('fills the route for the office copy and a reader who may track', async () => {
    const r = await call(admin);
    expect(r.route).toMatchObject({ distanceMeters: 1500, pointCount: 1, arrivalDistanceMeters: 0 });
    expect(r.meta.sections).toContain('route');
    expect(tracking.send).toHaveBeenCalledWith({ cmd: 'get_task_route' }, { taskId: 't-1', organizationId: 'org-1' });
  });

  it('a tracking grant held in THIS workspace is enough', async () => {
    const r = await call(member({ 'space-1': { canViewTracking: true } }));
    expect(r.route).not.toBeNull();
  });

  it('a tracking grant held in ANOTHER workspace is not', async () => {
    const r = await call(member({ 'space-9': { canViewTracking: true } }));
    expect(r).not.toHaveProperty('route');
    expect(r.meta.sections).not.toContain('route');
  });

  it('no tracking permission: no route, and tracking-service is never asked', async () => {
    const r = await call(member());
    expect(r).not.toHaveProperty('route');
    expect(tracking.send).not.toHaveBeenCalled();
  });

  it('a client copy carries the route when the office added it, for a reader who may track', async () => {
    tasks.fullReport.mockImplementation(({ copy, include }) =>
      Promise.resolve({
        success: true,
        data: report({ meta: { copy, include: include === 'route' ? ['route'] : [] } as any }),
      }),
    );
    const r = await controller
      .fullReport('t-1', { copy: 'client', include: 'route' }, fakeReq({ user: fakeUser(admin), method: 'GET' }))
      .then((x: any) => x.data);
    expect(r.route).toMatchObject({ distanceMeters: 1500 });
    expect(tasks.fullReport.mock.calls[0][0]).toMatchObject({ include: 'route' });
    const noTrack = await controller
      .fullReport('t-1', { copy: 'client', include: 'route' }, fakeReq({ user: fakeUser(member()), method: 'GET' }))
      .then((x: any) => x.data);
    expect(noTrack).not.toHaveProperty('route');
  });

  it('the client copy never asks for, nor carries, the route', async () => {
    const r = await call(admin, 'client');
    expect(r).not.toHaveProperty('route');
    expect(tracking.send).not.toHaveBeenCalled();
  });

  it('a workspace without tracking (no placeholder) gets no route even when one exists', async () => {
    tasks.fullReport.mockResolvedValue({ success: true, data: report({ route: undefined }) });
    const r = await call(admin);
    expect(r).not.toHaveProperty('route');
  });

  it('a failing tracking-service leaves the route out and the report standing', async () => {
    tracking.send.mockReturnValue(throwError(() => new Error('down')));
    const r = await call(admin);
    expect(r).not.toHaveProperty('route');
    expect(r.meta.sections).toEqual(['header', 'request', 'history']);
  });

  it('forwards the chosen issuer, and surfaces its refusal as a coded 400', async () => {
    await controller.fullReport('t-1', { issuer: 'le-2' }, fakeReq({ user: fakeUser(admin), method: 'GET' }));
    expect(tasks.fullReport.mock.calls[0][0]).toMatchObject({ issuer: 'le-2' });
    tasks.fullReport.mockResolvedValue({
      success: false,
      statusCode: 400,
      message: 'no',
      code: 'REPORT_ISSUER_INVALID',
    });
    await expect(
      controller.fullReport('t-1', { issuer: 'foreign' }, fakeReq({ user: fakeUser(admin), method: 'GET' })),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('a service refusal surfaces as its HTTP error', async () => {
    tasks.fullReport.mockResolvedValue({ success: false, statusCode: 404, message: 'Task not found' });
    await expect(call(admin)).rejects.toMatchObject({ status: 404 });
  });
});
