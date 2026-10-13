/**
 * The automatic clock's two office settings (shared attendance/auto-clock.ts):
 * the workspace's settings on PATCH /locations/:id (parsed STRICTLY, never
 * clamped; the Remote bucket refuses), and the member's choice on their
 * assignment (narrowed to the workspace for a workspace-level manager; refused
 * for an external member, who holds no clock).
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AUTO_CLOCK_DEFAULTS } from '@hbcfield/shared';
import { Prisma } from '@prisma/client';
import { LocationsService } from '../locations.service';

function build(space: Record<string, unknown> = {}, assignment: Record<string, unknown> = {}) {
  const row = { id: 'loc-1', organizationId: 'org-1', isRemote: false, autoClock: null, ...space };
  const prisma: any = {
    companyLocation: {
      findFirst: jest.fn().mockResolvedValue(row),
      update: jest.fn(async ({ data }: any) => Object.assign(row, data)),
      findUniqueOrThrow: jest.fn(async () => row),
      findUnique: jest.fn(async () => ({ timezone: 'America/Los_Angeles' })),
    },
    spaceAssignment: {
      findFirst: jest.fn().mockResolvedValue({ id: 'a1', organizationId: 'org-1', userId: 'u1', spaceId: 'loc-1', user: { isExternal: false }, ...assignment }),
      update: jest.fn(async ({ data }: any) => ({ id: 'a1', spaceId: 'loc-1', space: {}, user: {}, ...data })),
      updateMany: jest.fn(),
      findMany: jest.fn().mockResolvedValue([{ userId: 'u1' }]),
    },
    timeEntry: { findMany: jest.fn().mockResolvedValue([]) },
    rateHistory: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
    $executeRaw: jest.fn().mockResolvedValue(0),
  };
  const client = { emit: jest.fn() };
  return { prisma, client, svc: new LocationsService(prisma, client as any) };
}

const patch = (svc: LocationsService, autoClock: unknown) =>
  svc.update({ id: 'loc-1', organizationId: 'org-1', userId: 'admin', autoClock } as any);

describe('workspace automatic-clock settings', () => {
  it('saves the parsed whole and returns it parsed', async () => {
    const { svc, prisma } = build();
    const res: any = await patch(svc, { ...AUTO_CLOCK_DEFAULTS, enabled: true, leadMinutes: 45 });
    expect(prisma.companyLocation.update.mock.calls[0][0].data.autoClock).toEqual({ ...AUTO_CLOCK_DEFAULTS, enabled: true, leadMinutes: 45 });
    expect(res.data.autoClock).toMatchObject({ enabled: true, leadMinutes: 45 });
  });

  it('an out-of-range value is a 400 naming the field — never clamped, nothing saved', async () => {
    const { svc, prisma } = build();
    await expect(patch(svc, { enabled: true, leadMinutes: 500 })).rejects.toMatchObject({
      response: { code: 'AUTO_CLOCK_SETTING_INVALID', params: { field: 'leadMinutes' } },
    });
    expect(prisma.companyLocation.update).not.toHaveBeenCalled();
  });

  it('the Remote bucket refuses it', async () => {
    const { svc } = build({ isRemote: true });
    await expect(patch(svc, { enabled: true })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('a PATCH without it leaves it alone', async () => {
    const { svc, prisma } = build({ autoClock: { enabled: true } });
    await svc.update({ id: 'loc-1', organizationId: 'org-1', userId: 'admin', name: 'Halle 2' } as any);
    expect('autoClock' in prisma.companyLocation.update.mock.calls[0][0].data).toBe(false);
  });
});

describe('a member chosen for the automatic clock', () => {
  it('writes the choice', async () => {
    const { svc, prisma } = build();
    await svc.updateAssignment({ assignmentId: 'a1', organizationId: 'org-1', autoClock: true });
    expect(prisma.spaceAssignment.update.mock.calls[0][0].data).toEqual({ autoClock: true });
  });

  it('a workspace-level manager reaches only their workspace — another one reads as not found', async () => {
    const { svc, prisma } = build({}, { spaceId: 'loc-other' });
    await expect(svc.updateAssignment({ assignmentId: 'a1', organizationId: 'org-1', autoClock: true, spaceId: 'loc-1' })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.spaceAssignment.update).not.toHaveBeenCalled();
  });

  it('refused for an external member', async () => {
    const { svc } = build({}, { user: { isExternal: true } });
    await expect(svc.updateAssignment({ assignmentId: 'a1', organizationId: 'org-1', autoClock: true })).rejects.toMatchObject({
      response: { code: 'AUTO_CLOCK_NOT_FOR_EXTERNAL' },
    });
  });
});

describe('telling a member the switch is there', () => {
  const ON = { ...AUTO_CLOCK_DEFAULTS, enabled: true };
  const offers = (client: { emit: jest.Mock }) => client.emit.mock.calls.filter((c) => c[0] === 'auto_clock_offered');
  const settle = () => new Promise((r) => setImmediate(r));

  it('choosing a member in a workspace that uses it offers it to them, naming the workspace', async () => {
    const { svc, client, prisma } = build({ autoClock: ON, name: 'HBC Office', enabledModules: ['time_tracking'] }, { autoClock: false });
    await svc.updateAssignment({ assignmentId: 'a1', organizationId: 'org-1', autoClock: true } as any);
    await settle();
    expect(offers(client)).toEqual([['auto_clock_offered', { organizationId: 'org-1', spaceId: 'loc-1', spaceName: 'HBC Office', userIds: ['u1'] }]]);
    // Only people who have not agreed yet, assigned now.
    expect(prisma.spaceAssignment.findMany.mock.calls[0][0].where).toMatchObject({ spaceId: 'loc-1', autoClock: true, userId: { in: ['u1'] }, user: { autoClockConsentAt: null, isExternal: false } });
  });

  it('no offer when they were already chosen, or the workspace does not use it', async () => {
    const again = build({ autoClock: ON, enabledModules: ['time_tracking'] }, { autoClock: true });
    await again.svc.updateAssignment({ assignmentId: 'a1', organizationId: 'org-1', autoClock: true } as any);
    const off = build({ autoClock: null }, { autoClock: false });
    await off.svc.updateAssignment({ assignmentId: 'a1', organizationId: 'org-1', autoClock: true } as any);
    await settle();
    expect(offers(again.client)).toEqual([]);
    expect(offers(off.client)).toEqual([]);
  });

  it('no offer where Time Tracking is off — it could never clock there', async () => {
    const { svc, client } = build({ autoClock: ON, enabledModules: ['tasks'] }, { autoClock: false });
    await svc.updateAssignment({ assignmentId: 'a1', organizationId: 'org-1', autoClock: true } as any);
    await settle();
    expect(offers(client)).toEqual([]);
  });

  it('switching the workspace on offers it to everyone already chosen there', async () => {
    const { svc, client, prisma } = build({ autoClock: null, name: 'HBC Office', enabledModules: ['time_tracking'] });
    await patch(svc, ON);
    await settle();
    expect(offers(client)).toHaveLength(1);
    expect('userId' in prisma.spaceAssignment.findMany.mock.calls[0][0].where).toBe(false);
  });

  it('a settings change on a workspace already on offers nothing again', async () => {
    const { svc, client } = build({ autoClock: ON, enabledModules: ['time_tracking'] });
    await patch(svc, { ...ON, leadMinutes: 45 });
    await settle();
    expect(offers(client)).toEqual([]);
  });
});

describe('how a member is clocked — by shift, or by arriving and leaving', () => {
  const upd = (svc: LocationsService, body: Record<string, unknown>) => svc.updateAssignment({ assignmentId: 'a1', organizationId: 'org-1', ...body } as any);

  it('switching to arriving and leaving fills their usual hours from their own clock-ins here', async () => {
    const { svc, prisma } = build({ autoClock: { enabled: true } }, { autoClockMode: 'SHIFT' });
    // Juan's last eight nights, PDT: 20:00–22:03 local.
    prisma.timeEntry.findMany.mockResolvedValue(['03:08', '03:10', '03:03', '03:02', '03:25', '03:05', '05:03', '03:00'].map((h) => ({ clockInAt: new Date(`2026-10-0${1}T${h}:00Z`) })));
    await upd(svc, { autoClockMode: 'PRESENCE' });
    const data = prisma.spaceAssignment.update.mock.calls[0][0].data;
    expect(data.autoClockMode).toBe('PRESENCE');
    expect(data.autoClockStartWindow).toEqual({ from: '19:00', to: '23:30' });
    // Only this member, this workspace, the last 60 days.
    expect(prisma.timeEntry.findMany.mock.calls[0][0].where).toMatchObject({ userId: 'u1', locationId: 'loc-1' });
  });

  it('hours sent by the office win over the suggestion; null = any time', async () => {
    const { svc, prisma } = build({}, { autoClockMode: 'SHIFT' });
    await upd(svc, { autoClockMode: 'PRESENCE', autoClockStartWindow: null });
    expect(prisma.timeEntry.findMany).not.toHaveBeenCalled();
    expect(prisma.spaceAssignment.update.mock.calls[0][0].data.autoClockStartWindow).toBe(Prisma.DbNull);
  });

  it('a malformed window or mode is refused, nothing saved', async () => {
    const { svc, prisma } = build();
    await expect(upd(svc, { autoClockStartWindow: { from: '19:00', to: '19:00' } })).rejects.toMatchObject({ response: { code: 'AUTO_CLOCK_SETTING_INVALID', params: { field: 'startWindow' } } });
    await expect(upd(svc, { autoClockMode: 'ALWAYS' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.spaceAssignment.update).not.toHaveBeenCalled();
  });
});

describe('the workspace’s hours without a shift — a change reaches running sessions', () => {
  it('changing them re-times the sessions open here', async () => {
    const { svc, prisma } = build({ noShiftDailyMinutes: 480 });
    await svc.update({ id: 'loc-1', organizationId: 'org-1', userId: 'admin', noShiftDailyMinutes: 600 } as any);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
  });
  it('anything else does not', async () => {
    const { svc, prisma } = build({ noShiftDailyMinutes: 480 });
    await svc.update({ id: 'loc-1', organizationId: 'org-1', userId: 'admin', name: 'Halle 2' } as any);
    await svc.update({ id: 'loc-1', organizationId: 'org-1', userId: 'admin', noShiftDailyMinutes: 480 } as any);
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });
});
