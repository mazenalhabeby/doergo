/**
 * The automatic clock's two office settings (shared attendance/auto-clock.ts):
 * the workspace's settings on PATCH /locations/:id (parsed STRICTLY, never
 * clamped; the Remote bucket refuses), and the member's choice on their
 * assignment (narrowed to the workspace for a workspace-level manager; refused
 * for an external member, who holds no clock).
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AUTO_CLOCK_DEFAULTS } from '@hbcfield/shared';
import { LocationsService } from '../locations.service';

function build(space: Record<string, unknown> = {}, assignment: Record<string, unknown> = {}) {
  const row = { id: 'loc-1', organizationId: 'org-1', isRemote: false, autoClock: null, ...space };
  const prisma: any = {
    companyLocation: {
      findFirst: jest.fn().mockResolvedValue(row),
      update: jest.fn(async ({ data }: any) => Object.assign(row, data)),
      findUniqueOrThrow: jest.fn(async () => row),
    },
    spaceAssignment: {
      findFirst: jest.fn().mockResolvedValue({ id: 'a1', organizationId: 'org-1', userId: 'u1', spaceId: 'loc-1', user: { isExternal: false }, ...assignment }),
      update: jest.fn(async ({ data }: any) => ({ id: 'a1', spaceId: 'loc-1', space: {}, user: {}, ...data })),
      updateMany: jest.fn(),
    },
    rateHistory: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };
  return { prisma, svc: new LocationsService(prisma, { emit: jest.fn() } as any) };
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
